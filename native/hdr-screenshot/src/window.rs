// Which monitor a game is shown on, shared by the screenshot and clip helpers.
use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT, TRUE};
use windows::core::BOOL;
use windows::Win32::Graphics::Dwm::{DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute};
use windows::Win32::Graphics::Gdi::{
    HMONITOR, MONITOR_DEFAULTTONULL, MONITOR_DEFAULTTOPRIMARY, MonitorFromPoint, MonitorFromWindow,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindow,
    IsWindowVisible,
};

struct WindowSearch {
    pid: u32,
    best: HWND,
    area: i64,
}

unsafe extern "system" fn visit_window(window: HWND, param: LPARAM) -> BOOL {
    unsafe {
        let search = &mut *(param.0 as *mut WindowSearch);
        let mut owner = 0u32;
        GetWindowThreadProcessId(window, Some(&mut owner));
        if owner == search.pid && IsWindowVisible(window).as_bool() && !IsIconic(window).as_bool() {
            let mut rect = RECT::default();
            if GetWindowRect(window, &mut rect).is_ok() {
                let area = (rect.right - rect.left) as i64 * (rect.bottom - rect.top) as i64;
                if area > search.area {
                    search.area = area;
                    search.best = window;
                }
            }
        }
        TRUE
    }
}

// The game's largest visible window, if it has one.
pub fn game_window(pid: u32) -> Option<HWND> {
    if pid == 0 {
        return None;
    }
    let mut search = WindowSearch { pid, best: HWND::default(), area: 0 };
    unsafe {
        let _ = EnumWindows(Some(visit_window), LPARAM(&mut search as *mut _ as isize));
    }
    (search.area > 0).then_some(search.best)
}

// The monitor showing the game's largest visible window, if it has one.
pub fn game_monitor(pid: u32) -> Option<HMONITOR> {
    game_window(pid).map(|window| unsafe { MonitorFromWindow(window, MONITOR_DEFAULTTOPRIMARY) })
}

// What the window shows on screen, in physical desktop pixels: DWM's bounds leave out the invisible
// resize borders that GetWindowRect counts. None while it is minimised, hidden or gone.
pub fn visible_bounds(window: HWND) -> Option<RECT> {
    unsafe {
        if !IsWindow(Some(window)).as_bool() || IsIconic(window).as_bool() || !IsWindowVisible(window).as_bool() {
            return None;
        }
        let mut rect = RECT::default();
        let read = DwmGetWindowAttribute(window, DWMWA_EXTENDED_FRAME_BOUNDS, &mut rect as *mut RECT as *mut _, size_of::<RECT>() as u32);
        if read.is_err() && GetWindowRect(window, &mut rect).is_err() {
            return None;
        }
        (rect.right > rect.left && rect.bottom > rect.top).then_some(rect)
    }
}

// Still open and not hidden, minimised included: a game sent to the taskbar is waited for, not
// replaced by another of its windows.
pub fn still_shown(window: HWND) -> bool {
    unsafe { IsWindow(Some(window)).as_bool() && IsWindowVisible(window).as_bool() }
}

// A game that just unlocked something is nearly always the window in front.
pub fn foreground_monitor() -> Option<HMONITOR> {
    unsafe {
        let window = GetForegroundWindow();
        if window.is_invalid() || IsIconic(window).as_bool() {
            return None;
        }
        let monitor = MonitorFromWindow(window, MONITOR_DEFAULTTONULL);
        (!monitor.is_invalid()).then_some(monitor)
    }
}

pub fn primary_monitor() -> HMONITOR {
    unsafe { MonitorFromPoint(POINT::default(), MONITOR_DEFAULTTOPRIMARY) }
}
