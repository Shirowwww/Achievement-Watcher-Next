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

// Stores `preference` for this executable unless a choice is already there: one made in Settings
// is the user's, and an earlier one of ours already had its chance.
fn store(exe: &Path, preference: u32) -> Result<bool> {
    let mut key = HKEY::default();
    unsafe {
        RegCreateKeyExW(HKEY_CURRENT_USER, PREFERENCES_KEY, None, PCWSTR::null(), REG_OPTION_NON_VOLATILE, KEY_QUERY_VALUE | KEY_SET_VALUE, None, &mut key, None).ok()?;
    }
    let name = HSTRING::from(exe.as_os_str());
    let stored = if unsafe { RegQueryValueExW(key, &name, None, None, None, None) } == ERROR_SUCCESS {
        Ok(false)
    } else {
        let value: Vec<u8> = format!("GpuPreference={preference};").encode_utf16().chain([0]).flat_map(u16::to_le_bytes).collect();
        unsafe { RegSetValueExW(key, &name, None, REG_SZ, Some(&value)) }.ok().map(|()| true)
    };
    let _ = unsafe { RegCloseKey(key) };
    stored
}

// After duplication was refused: when the display hangs off another GPU than `device`'s, asks Windows
// to start this executable on that GPU from now on. True when the choice was stored. Windows applies
// it to the next process only (checked on a desktop with an AMD and an NVIDIA GPU, 21/11/2026).
pub fn follow_display(device: &ID3D11Device, display: &[u16]) -> bool {
    let current = (|| -> Result<DXGI_ADAPTER_DESC1> {
        let adapter: IDXGIAdapter1 = unsafe { device.cast::<IDXGIDevice>()?.GetAdapter()? }.cast()?;
        unsafe { adapter.GetDesc1() }
    })();
    let (Ok(current), Some(gpu)) = (current, display_gpu(display)) else { return false };
    if gpu == (current.VendorId, current.DeviceId) {
        return false;
    }
    let Some(preference) = preference_for(gpu, &hardware_gpus()) else { return false };
    std::env::current_exe().ok().is_some_and(|exe| store(&exe, preference).unwrap_or(false))
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
}
