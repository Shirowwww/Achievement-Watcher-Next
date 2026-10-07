// DisplayConfig queries shared by the screenshot and clip helpers: whether a display path is in HDR
// and how bright Windows paints SDR white on it.
use windows::Win32::Devices::Display::{
    DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO,
    DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL, DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
    DISPLAYCONFIG_DEVICE_INFO_HEADER, DISPLAYCONFIG_DEVICE_INFO_TYPE,
    DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO, DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO,
    DISPLAYCONFIG_SDR_WHITE_LEVEL, DISPLAYCONFIG_SOURCE_DEVICE_NAME, DisplayConfigGetDeviceInfo,
    GetDisplayConfigBufferSizes, QDC_ONLY_ACTIVE_PATHS, QueryDisplayConfig,
};
use windows::Win32::Foundation::{ERROR_SUCCESS, WIN32_ERROR};

use crate::AnyError;

pub fn active_display_paths() -> Result<Vec<DISPLAYCONFIG_PATH_INFO>, AnyError> {
    let mut path_count = 0_u32;
    let mut mode_count = 0_u32;
    let status = unsafe {
        GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut path_count, &mut mode_count)
    };
    if status != ERROR_SUCCESS {
        return Err(format!("GetDisplayConfigBufferSizes failed: {}", status.0).into());
    }

    let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); path_count as usize];
    let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); mode_count as usize];
    let status = unsafe {
        QueryDisplayConfig(
            QDC_ONLY_ACTIVE_PATHS,
            &mut path_count,
            paths.as_mut_ptr(),
            &mut mode_count,
            modes.as_mut_ptr(),
            None,
        )
    };
    if status != ERROR_SUCCESS {
        return Err(format!("QueryDisplayConfig failed: {}", status.0).into());
    }

    paths.truncate(path_count as usize);
    Ok(paths)
}

pub fn path_source_name(path: &DISPLAYCONFIG_PATH_INFO) -> Option<Vec<u16>> {
    let mut request = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
    request.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
    request.header.size = size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32;
    request.header.adapterId = path.sourceInfo.adapterId;
    request.header.id = path.sourceInfo.id;
    let status = WIN32_ERROR(unsafe { DisplayConfigGetDeviceInfo(&mut request.header) } as u32);
    if status != ERROR_SUCCESS {
        return None;
    }
    Some(request.viewGdiDeviceName.to_vec())
}

// DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_2, which the windows crate does not expose yet. Windows 11
// 24H2 added it because the older query cannot tell HDR apart from automatic colour management:
// a display running in wide colour gamut reports advancedColorEnabled just like an HDR one does.
const DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO_2: DISPLAYCONFIG_DEVICE_INFO_TYPE =
    DISPLAYCONFIG_DEVICE_INFO_TYPE(15);
const DISPLAYCONFIG_ADVANCED_COLOR_MODE_HDR: u32 = 2;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct AdvancedColorInfo2 {
    header: DISPLAYCONFIG_DEVICE_INFO_HEADER,
    value: u32,
    color_encoding: u32,
    bits_per_color_channel: u32,
    active_color_mode: u32,
}

fn path_active_color_mode(path: &DISPLAYCONFIG_PATH_INFO) -> Option<u32> {
    let mut request = AdvancedColorInfo2 {
        header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
            r#type: DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO_2,
            size: size_of::<AdvancedColorInfo2>() as u32,
            adapterId: path.targetInfo.adapterId,
            id: path.targetInfo.id,
        },
        ..Default::default()
    };
    let status = WIN32_ERROR(unsafe { DisplayConfigGetDeviceInfo(&mut request.header) } as u32);
    (status == ERROR_SUCCESS).then_some(request.active_color_mode)
}

fn path_advanced_color_enabled(path: &DISPLAYCONFIG_PATH_INFO) -> Result<bool, AnyError> {
    let mut request = DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO::default();
    request.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO;
    request.header.size = size_of::<DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO>() as u32;
    request.header.adapterId = path.targetInfo.adapterId;
    request.header.id = path.targetInfo.id;
    let status = WIN32_ERROR(unsafe { DisplayConfigGetDeviceInfo(&mut request.header) } as u32);
    if status != ERROR_SUCCESS {
        return Err(format!("DisplayConfigGetDeviceInfo failed: {}", status.0).into());
    }
    // Bit 1 is advancedColorEnabled.
    Ok(unsafe { request.Anonymous.value } & 0b10 != 0)
}

pub fn path_hdr_enabled(path: &DISPLAYCONFIG_PATH_INFO) -> Result<bool, AnyError> {
    match path_active_color_mode(path) {
        Some(mode) => Ok(mode == DISPLAYCONFIG_ADVANCED_COLOR_MODE_HDR),
        // Before 24H2 there is no wide colour gamut mode, so the old query means HDR.
        None => path_advanced_color_enabled(path),
    }
}

// While HDR is on, the desktop composes in scRGB where 1.0 is 80 nits, but Windows paints SDR
// content at the brightness of the "SDR content brightness" slider. Without dividing by that
// factor the whole desktop reads as a highlight and the tone mapper crushes it.
pub fn path_sdr_white_scale(path: &DISPLAYCONFIG_PATH_INFO) -> f32 {
    let mut request = DISPLAYCONFIG_SDR_WHITE_LEVEL::default();
    request.header.r#type = DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL;
    request.header.size = size_of::<DISPLAYCONFIG_SDR_WHITE_LEVEL>() as u32;
    request.header.adapterId = path.targetInfo.adapterId;
    request.header.id = path.targetInfo.id;
    let status = WIN32_ERROR(unsafe { DisplayConfigGetDeviceInfo(&mut request.header) } as u32);
    if status != ERROR_SUCCESS || request.SDRWhiteLevel == 0 {
        return 1.0;
    }
    // The level is reported in thousandths of the 80 nit scRGB reference white.
    (request.SDRWhiteLevel as f32 / 1000.0).max(1.0)
}

// The path whose source is the given GDI device name (MONITORINFOEXW::szDevice or
// DXGI_OUTPUT_DESC::DeviceName), so a monitor's HDR state can be read from either API.
pub fn path_for_device(device_name: &[u16]) -> Result<DISPLAYCONFIG_PATH_INFO, AnyError> {
    let wanted = trim_nul(device_name);
    for path in active_display_paths()? {
        if let Some(name) = path_source_name(&path) {
            if trim_nul(&name) == wanted {
                return Ok(path);
            }
        }
    }
    Err("The display was not found through DisplayConfig".into())
}

fn trim_nul(name: &[u16]) -> &[u16] {
    let end = name.iter().position(|&c| c == 0).unwrap_or(name.len());
    &name[..end]
}
