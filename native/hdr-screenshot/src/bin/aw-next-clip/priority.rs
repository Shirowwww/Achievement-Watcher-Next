// GPU and thread priority for the recorder. A game that keeps the GPU at 99% otherwise delays every
// copy, conversion and encode, and the clip judders (issue #190). Copied from OBS's set_priority()
// in libobs-d3d11/d3d11-subsystem.cpp: the same scheduling classes, and nothing on Intel GPUs.
use std::sync::OnceLock;

use windows::Wdk::Graphics::Direct3D::*;
use windows::Win32::Foundation::LUID;
use windows::Win32::Graphics::Direct3D11::ID3D11Device;
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::Threading::{AvSetMmThreadCharacteristicsW, GetCurrentProcess};
use windows::core::{Interface, w};

const INTEL: u32 = 0x8086;
// IDXGIDevice::SetGPUThreadPriority accepts -7 to 7.
const GPU_THREAD_PRIORITY: i32 = 7;
// HwSchEnabled in D3DKMT_WDDM_2_7_CAPS: hardware-accelerated GPU scheduling is on.
const HWSCH_ENABLED: u32 = 1 << 1;

fn hardware_scheduling(luid: LUID) -> bool {
    unsafe {
        let mut open = D3DKMT_OPENADAPTERFROMLUID { AdapterLuid: luid, hAdapter: 0 };
        if D3DKMTOpenAdapterFromLuid(&mut open).is_err() {
            return false;
        }
        let mut caps = D3DKMT_WDDM_2_7_CAPS::default();
        let mut query = D3DKMT_QUERYADAPTERINFO {
            hAdapter: open.hAdapter,
            Type: KMTQAITYPE_WDDM_2_7_CAPS,
            pPrivateDriverData: &mut caps as *mut _ as *mut _,
            PrivateDriverDataSize: size_of::<D3DKMT_WDDM_2_7_CAPS>() as u32,
        };
        let read = D3DKMTQueryAdapterInfo(&mut query).is_ok();
        let _ = D3DKMTCloseAdapter(&D3DKMT_CLOSEADAPTER { hAdapter: open.hAdapter });
        read && caps.Anonymous.Value & HWSCH_ENABLED != 0
    }
}

// The classes to try, best first. Realtime needs administrator rights, and OBS keeps to High when
// hardware scheduling is on.
fn classes(hags: bool) -> &'static [(&'static str, D3DKMT_SCHEDULINGPRIORITYCLASS)] {
    if hags {
        &[("high", D3DKMT_SCHEDULINGPRIORITYCLASS_HIGH)]
    } else {
        &[("realtime", D3DKMT_SCHEDULINGPRIORITYCLASS_REALTIME), ("high", D3DKMT_SCHEDULINGPRIORITYCLASS_HIGH)]
    }
}

// Process-wide, so it is set once; the answer is the class obtained, for the `ready` line.
fn raise_process(luid: LUID) -> &'static str {
    static CLASS: OnceLock<&'static str> = OnceLock::new();
    CLASS.get_or_init(|| {
        let process = unsafe { GetCurrentProcess() };
        classes(hardware_scheduling(luid))
            .iter()
            .find(|(_, class)| unsafe { D3DKMTSetProcessSchedulingPriorityClass(process, *class) }.is_ok())
            .map_or("normal", |(name, _)| name)
    })
}

// Raises the process and the device; returns `gpu-priority=<class> gpu-thread=<n>`.
pub fn raise_gpu(device: &ID3D11Device, luid: LUID, vendor: u32) -> String {
    if vendor == INTEL {
        return "gpu-priority=normal gpu-thread=0".to_string();
    }
    let class = raise_process(luid);
    let thread = device
        .cast::<IDXGIDevice>()
        .and_then(|dxgi| unsafe { dxgi.SetGPUThreadPriority(GPU_THREAD_PRIORITY) })
        .map_or(0, |()| GPU_THREAD_PRIORITY);
    format!("gpu-priority={class} gpu-thread={thread}")
}

// The multimedia scheduler's "Capture" class for the capture thread, so its pacing survives a busy
// CPU. The handle is kept for the thread's life: the class ends when the thread does.
pub fn raise_capture_thread() -> bool {
    let mut index = 0u32;
    unsafe { AvSetMmThreadCharacteristicsW(w!("Capture"), &mut index) }.is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn realtime_is_tried_only_without_hardware_scheduling_and_high_is_the_fallback() {
        let names = |hags| classes(hags).iter().map(|(name, _)| *name).collect::<Vec<_>>();
        assert_eq!(names(false), ["realtime", "high"]);
        assert_eq!(names(true), ["high"]);
    }
}
