//! Message boxes the installer script opens while the window is up: electron-builder's "cannot be
//! closed" retry when a file is in use, NSIS's own file errors. They belong to the invisible NSIS
//! dialog, so they opened behind this window and the installer looked frozen. Each one is lifted
//! above the window and centred on it, and the window stays disabled until the box is answered.

use std::sync::atomic::{AtomicIsize, Ordering};

use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::System::Threading::GetCurrentProcessId;
use windows::Win32::UI::Accessibility::{HWINEVENTHOOK, SetWinEventHook, UnhookWinEvent};
use windows::Win32::UI::Input::KeyboardAndMouse::EnableWindow;
use windows::Win32::UI::WindowsAndMessaging::*;

static INSTALLER_DIALOG: AtomicIsize = AtomicIsize::new(0);
static BLOCKING: AtomicIsize = AtomicIsize::new(0);
static HOOK: AtomicIsize = AtomicIsize::new(0);

const DIALOG_CLASS: &str = "#32770";

fn hwnd(raw: isize) -> HWND {
    HWND(raw as *mut _)
}

/// The NSIS dialog that owns the script's message boxes.
pub fn set_installer_dialog(dialog: HWND) {
    INSTALLER_DIALOG.store(dialog.0 as isize, Ordering::SeqCst);
}

/// Starts watching for the boxes. Called on the window's thread, which receives the events.
pub fn watch() {
    let hook = unsafe {
        SetWinEventHook(
            EVENT_OBJECT_DESTROY,
            EVENT_OBJECT_HIDE,
            None,
            Some(on_event),
            GetCurrentProcessId(),
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNTHREAD,
        )
    };
    HOOK.store(hook.0 as isize, Ordering::SeqCst);
}

pub fn stop() {
    let hook = HOOK.swap(0, Ordering::SeqCst);
    if hook != 0 {
        unsafe {
            let _ = UnhookWinEvent(HWINEVENTHOOK(hook as *mut _));
        }
    }
    BLOCKING.store(0, Ordering::SeqCst);
}

unsafe extern "system" fn on_event(_hook: HWINEVENTHOOK, event: u32, target: HWND, object: i32, child: i32, _thread: u32, _time: u32) {
    if object != OBJID_WINDOW.0 || child != CHILDID_SELF as i32 {
        return;
    }
    let _ = std::panic::catch_unwind(|| match event {
        EVENT_OBJECT_SHOW if is_script_box(target) => lift(target),
        EVENT_OBJECT_HIDE | EVENT_OBJECT_DESTROY if BLOCKING.load(Ordering::SeqCst) == target.0 as isize => release(),
        _ => {}
    });
}

/// A top-level dialog box owned by the NSIS dialog (the folder picker belongs to this window).
fn is_script_box(target: HWND) -> bool {
    let dialog = INSTALLER_DIALOG.load(Ordering::SeqCst);
    if dialog == 0 || target.0 as isize == dialog {
        return false;
    }
    unsafe {
        if GetAncestor(target, GA_ROOT) != target {
            return false;
        }
        let owner = GetWindow(target, GW_OWNER).unwrap_or_default();
        let mut class = [0u16; 16];
        let length = GetClassNameW(target, &mut class).max(0) as usize;
        owner.0 as isize == dialog && String::from_utf16_lossy(&class[..length]) == DIALOG_CLASS
    }
}

fn lift(target: HWND) {
    let window = hwnd(crate::window::handle());
    if window.0.is_null() || unsafe { !IsWindowVisible(window).as_bool() } {
        return;
    }
    BLOCKING.store(target.0 as isize, Ordering::SeqCst);
    unsafe {
        let _ = EnableWindow(window, false);
        let (mut outer, mut inner) = (RECT::default(), RECT::default());
        let _ = GetWindowRect(window, &mut outer);
        let _ = GetWindowRect(target, &mut inner);
        let x = outer.left + ((outer.right - outer.left) - (inner.right - inner.left)) / 2;
        let y = outer.top + ((outer.bottom - outer.top) - (inner.bottom - inner.top)) / 2;
        let _ = SetWindowPos(target, Some(HWND_TOPMOST), x, y, 0, 0, SWP_NOSIZE);
        let _ = SetForegroundWindow(target);
    }
}

fn release() {
    BLOCKING.store(0, Ordering::SeqCst);
    let window = hwnd(crate::window::handle());
    if window.0.is_null() {
        return;
    }
    unsafe {
        let _ = EnableWindow(window, true);
        let _ = SetForegroundWindow(window);
    }
}
