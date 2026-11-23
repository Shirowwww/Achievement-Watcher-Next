// Desktop duplication only works from a device on the GPU that drives the screen. On a laptop whose
// panel hangs off the integrated GPU, a recorder that Windows starts on the discrete one is refused
// (DXGI_ERROR_UNSUPPORTED) and falls back to Windows Graphics Capture, whose yellow frame Windows 10
// cannot hide. Windows keeps a GPU choice per executable; this module stores the screen's GPU there.

use std::ffi::c_void;
use std::path::Path;

use windows::Win32::Foundation::*;
use windows::Win32::Graphics::DXCore::*;
use windows::Win32::Graphics::Direct3D11::ID3D11Device;
use windows::Win32::Graphics::Dxgi::*;
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::System::LibraryLoader::{GetProcAddress, LOAD_LIBRARY_SEARCH_SYSTEM32, LoadLibraryExW};
use windows::Win32::System::Registry::*;
use windows::core::*;

use crate::log;

// Where Settings > Display > Graphics keeps its per-app choices, one "GpuPreference=N;" per path.
const PREFERENCES_KEY: PCWSTR = w!("Software\\Microsoft\\DirectX\\UserGpuPreferences");
const POWER_SAVING: u32 = 1;
const HIGH_PERFORMANCE: u32 = 2;

type Ids = (u32, u32);

// "PCI\VEN_8086&DEV_46A8&SUBSYS_..." as (vendor, device), the ids DXGI reports for an adapter.
pub fn pci_ids(device_id: &str) -> Option<Ids> {
    let upper = device_id.to_ascii_uppercase();
    let hex_after = |tag: &str| {
        let start = upper.find(tag)? + tag.len();
        u32::from_str_radix(upper.get(start..start + 4)?, 16).ok()
    };
    Some((hex_after("VEN_")?, hex_after("DEV_")?))
}

// The choice that lands on `gpu` among the hardware GPUs (ids, integrated): power saving is the one
// built into the processor, high performance the discrete one. None when that would be a guess,
// such as two discrete GPUs, where high performance may name the other.
pub fn preference_for(gpu: Ids, gpus: &[(Ids, bool)]) -> Option<u32> {
    let &(_, integrated) = gpus.iter().find(|(ids, _)| *ids == gpu)?;
    let others = gpus.iter().filter(|(ids, _)| *ids != gpu);
    if integrated {
        others.clone().any(|&(_, other)| !other).then_some(POWER_SAVING)
    } else {
        let mut others = others.peekable();
        (others.peek().is_some() && others.all(|&(_, other)| other)).then_some(HIGH_PERFORMANCE)
    }
}

fn text(wide: &[u16]) -> String {
    let end = wide.iter().position(|&c| c == 0).unwrap_or(wide.len());
    String::from_utf16_lossy(&wide[..end])
}

// The GPU behind a display named as DXGI and GDI name it (\\.\DISPLAY1): GDI tells the GPU that
// scans it out even when DXGI lists the display under the GPU the process renders on.
fn display_gpu(display: &[u16]) -> Option<Ids> {
    let name = text(display);
    for index in 0.. {
        let mut device = DISPLAY_DEVICEW { cb: size_of::<DISPLAY_DEVICEW>() as u32, ..Default::default() };
        if !unsafe { EnumDisplayDevicesW(PCWSTR::null(), index, &mut device, 0) }.as_bool() {
            return None;
        }
        if text(&device.DeviceName).eq_ignore_ascii_case(&name) {
            return pci_ids(&text(&device.DeviceID));
        }
    }
    None
}

fn property<T: Default>(adapter: &IDXCoreAdapter, property: DXCoreAdapterProperty) -> Option<T> {
    let mut value = T::default();
    unsafe { adapter.GetProperty(property, size_of::<T>(), &mut value as *mut T as *mut c_void) }.ok()?;
    Some(value)
}

// dxcore.dll only exists from Windows 10 2004: imported directly, it would keep the recorder from
// starting on older builds, so it is loaded when needed.
fn dxcore_factory() -> Option<IDXCoreAdapterFactory> {
    type Create = unsafe extern "system" fn(*const GUID, *mut *mut c_void) -> HRESULT;
    let module = unsafe { LoadLibraryExW(w!("dxcore.dll"), None, LOAD_LIBRARY_SEARCH_SYSTEM32) }.ok()?;
    let create = unsafe { GetProcAddress(module, s!("DXCoreCreateAdapterFactory")) }?;
    let create: Create = unsafe { std::mem::transmute(create) };
    let mut factory = std::ptr::null_mut();
    unsafe { create(&IDXCoreAdapterFactory::IID, &mut factory) }.ok().ok()?;
    (!factory.is_null()).then(|| unsafe { IDXCoreAdapterFactory::from_raw(factory) })
}

// Every hardware GPU with whether it is integrated. DXCore answers that itself, unlike DXGI, whose
// order of GPUs already follows the choice stored for this executable.
fn hardware_gpus() -> Vec<(Ids, bool)> {
    let Some(factory) = dxcore_factory() else { return Vec::new() };
    let Ok(list) = (unsafe { factory.CreateAdapterList::<IDXCoreAdapterList>(&[DXCORE_ADAPTER_ATTRIBUTE_D3D11_GRAPHICS]) }) else {
        return Vec::new();
    };
    (0..unsafe { list.GetAdapterCount() })
        .filter_map(|index| unsafe { list.GetAdapter::<IDXCoreAdapter>(index) }.ok())
        .filter(|adapter| property::<u8>(adapter, IsHardware).is_some_and(|hardware| hardware != 0))
        .filter_map(|adapter| {
            let id = property::<DXCoreHardwareID>(&adapter, HardwareID)?;
            let integrated = property::<u8>(&adapter, IsIntegrated)? != 0;
            Some(((id.vendorID, id.deviceID), integrated))
        })
        .collect()
}

// The value to store for `preference` given what the executable's entry holds now, or None when it
// already names a GPU: one picked in Settings is the user's, and an earlier one of ours had its
// chance. "Let Windows decide" (0) and other settings in the entry (Windows 11 keeps windowed-game
// optimizations there) are no GPU choice: the first is replaced, the others kept.
pub fn merged_preference(existing: Option<&str>, preference: u32) -> Option<String> {
    let parts: Vec<&str> = existing.unwrap_or("").split(';').map(str::trim).filter(|part| !part.is_empty()).collect();
    let chosen = parts.iter().filter_map(|part| part.strip_prefix("GpuPreference=")).any(|value| value.trim() != "0");
    if chosen {
        return None;
    }
    let kept: String = parts.iter().filter(|part| !part.starts_with("GpuPreference=")).map(|part| format!("{part};")).collect();
    Some(format!("{kept}GpuPreference={preference};"))
}

fn read_value(key: HKEY, name: &HSTRING) -> Option<String> {
    let mut size = 0u32;
    if unsafe { RegQueryValueExW(key, name, None, None, None, Some(&mut size)) } != ERROR_SUCCESS {
        return None;
    }
    let mut buffer = vec![0u16; (size as usize).div_ceil(2) + 1];
    let mut bytes = (buffer.len() * 2) as u32;
    if unsafe { RegQueryValueExW(key, name, None, None, Some(buffer.as_mut_ptr().cast()), Some(&mut bytes)) } != ERROR_SUCCESS {
        return None;
    }
    Some(text(&buffer))
}

// Stores `preference` for this executable when its entry names no GPU yet (merged_preference).
// Ok(None) when stored, Ok(Some(entry)) with the entry left as it is otherwise.
fn store(exe: &Path, preference: u32) -> Result<Option<String>> {
    let mut key = HKEY::default();
    unsafe {
        RegCreateKeyExW(HKEY_CURRENT_USER, PREFERENCES_KEY, None, PCWSTR::null(), REG_OPTION_NON_VOLATILE, KEY_QUERY_VALUE | KEY_SET_VALUE, None, &mut key, None).ok()?;
    }
    let name = HSTRING::from(exe.as_os_str());
    let existing = read_value(key, &name);
    let stored = match merged_preference(existing.as_deref(), preference) {
        None => Ok(Some(existing.unwrap_or_default())),
        Some(entry) => {
            let value: Vec<u8> = entry.encode_utf16().chain([0]).flat_map(u16::to_le_bytes).collect();
            unsafe { RegSetValueExW(key, &name, None, REG_SZ, Some(&value)) }.ok().map(|()| None)
        }
    };
    let _ = unsafe { RegCloseKey(key) };
    stored
}

fn ids_text((vendor, device): Ids) -> String {
    format!("{vendor:04x}:{device:04x}")
}

// After duplication was refused: when the display hangs off another GPU than `device`'s, asks Windows
// to start this executable on that GPU from now on. True when the choice was stored. Windows applies
// it to the next process only (checked on a desktop with an AMD and an NVIDIA GPU, 21/11/2026).
pub fn follow_display(device: &ID3D11Device, display: &[u16]) -> bool {
    let current = (|| -> Result<DXGI_ADAPTER_DESC1> {
        let adapter: IDXGIAdapter1 = unsafe { device.cast::<IDXGIDevice>()?.GetAdapter()? }.cast()?;
        unsafe { adapter.GetDesc1() }
    })();
    // Each way out is logged: a laptop that keeps the yellow frame otherwise says nothing (22/11/2026).
    let Ok(current) = current else {
        log("gpu: the recorder's own GPU could not be read, staying on it");
        return false;
    };
    let own = (current.VendorId, current.DeviceId);
    let Some(gpu) = display_gpu(display) else {
        log(&format!("gpu: no GPU found for display {}, staying on {}", text(display), ids_text(own)));
        return false;
    };
    if gpu == own {
        log(&format!("gpu: the screen hangs off the recorder's own GPU ({}), nothing to change", ids_text(gpu)));
        return false;
    }
    let gpus = hardware_gpus();
    let Some(preference) = preference_for(gpu, &gpus) else {
        let listed: Vec<String> = gpus.iter().map(|&(ids, integrated)| format!("{}{}", ids_text(ids), if integrated { " integrated" } else { "" })).collect();
        log(&format!("gpu: no Windows choice lands on the screen's GPU {} (GPUs: {})", ids_text(gpu), listed.join(", ")));
        return false;
    };
    let Ok(exe) = std::env::current_exe() else {
        log("gpu: the recorder's own path could not be read");
        return false;
    };
    match store(&exe, preference) {
        Ok(None) => true,
        Ok(Some(entry)) => {
            log(&format!("gpu: Windows already holds a GPU choice for the recorder ({entry}), left as it is"));
            false
        }
        Err(error) => {
            log(&format!("gpu: the GPU choice could not be stored: {}", error.message()));
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const INTEL: Ids = (0x8086, 0x46a8);
    const NVIDIA: Ids = (0x10de, 0x2786);
    const AMD: Ids = (0x1002, 0x164e);

    #[test]
    fn reads_the_vendor_and_device_of_a_pci_id() {
        assert_eq!(pci_ids("PCI\\VEN_8086&DEV_46A8&SUBSYS_3F1A17AA&REV_0C"), Some((0x8086, 0x46a8)));
        assert_eq!(pci_ids("pci\\ven_10de&dev_2786"), Some((0x10de, 0x2786)));
        assert_eq!(pci_ids("Root\\Parsec\\VDA"), None, "a virtual adapter has no PCI ids");
        assert_eq!(pci_ids("PCI\\VEN_80"), None, "a cut id is not read past its end");
    }

    #[test]
    fn a_laptop_panel_on_the_integrated_gpu_asks_for_power_saving() {
        assert_eq!(preference_for(INTEL, &[(INTEL, true), (NVIDIA, false)]), Some(POWER_SAVING));
    }

    #[test]
    fn a_screen_on_the_discrete_gpu_asks_for_high_performance() {
        assert_eq!(preference_for(NVIDIA, &[(AMD, true), (NVIDIA, false)]), Some(HIGH_PERFORMANCE));
    }

    #[test]
    fn no_choice_is_stored_when_it_would_be_a_guess() {
        assert_eq!(preference_for(NVIDIA, &[(NVIDIA, false)]), None, "one GPU: nothing to choose");
        assert_eq!(preference_for(NVIDIA, &[(NVIDIA, false), (AMD, false)]), None, "two discrete GPUs");
        assert_eq!(preference_for(INTEL, &[(NVIDIA, false)]), None, "a GPU DXCore does not list");
    }

    #[test]
    fn a_gpu_picked_in_settings_is_kept() {
        assert_eq!(merged_preference(Some("GpuPreference=2;"), POWER_SAVING), None);
        assert_eq!(merged_preference(Some("SwapEffectUpgradeEnable=1;GpuPreference=1;"), HIGH_PERFORMANCE), None);
    }

    #[test]
    fn no_entry_or_let_windows_decide_takes_the_screens_gpu() {
        assert_eq!(merged_preference(None, POWER_SAVING).as_deref(), Some("GpuPreference=1;"));
        assert_eq!(merged_preference(Some("GpuPreference=0;"), POWER_SAVING).as_deref(), Some("GpuPreference=1;"));
        assert_eq!(merged_preference(Some(""), HIGH_PERFORMANCE).as_deref(), Some("GpuPreference=2;"));
    }

    #[test]
    fn other_settings_in_the_entry_are_kept() {
        assert_eq!(
            merged_preference(Some("SwapEffectUpgradeEnable=1;"), POWER_SAVING).as_deref(),
            Some("SwapEffectUpgradeEnable=1;GpuPreference=1;")
        );
        assert_eq!(
            merged_preference(Some("GpuPreference=0;SwapEffectUpgradeEnable=1;"), POWER_SAVING).as_deref(),
            Some("SwapEffectUpgradeEnable=1;GpuPreference=1;")
        );
    }
}
