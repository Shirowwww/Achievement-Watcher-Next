//! Frame pacing. While something on screen moves, a helper thread waits for each desktop
//! composition (DwmFlush, so frames land on the display's refresh) and asks the window for one
//! frame. When nothing moves the thread sleeps, and the window costs no CPU at all.
//!
//! Repainting from inside WM_PAINT would also animate, but it keeps a paint message permanently
//! pending: any PeekMessage loop (NSIS's, the preview's) would never drain the queue.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicIsize, Ordering};
use std::sync::{Condvar, Mutex};
use std::time::Duration;

use windows::Win32::Foundation::{HWND, LPARAM, WPARAM};
use windows::Win32::Graphics::Dwm::DwmFlush;
use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_APP};

pub const WM_APP_FRAME: u32 = WM_APP + 2;

static TARGET: AtomicIsize = AtomicIsize::new(0);
static FRAME_PENDING: AtomicBool = AtomicBool::new(false);
static WAKE: (Mutex<bool>, Condvar) = (Mutex::new(false), Condvar::new());
static STARTED: AtomicBool = AtomicBool::new(false);

/// Used when the compositor cannot be waited on (remote sessions, a failing DwmFlush).
const FALLBACK_FRAME: Duration = Duration::from_millis(16);

pub fn start(hwnd: HWND) {
    TARGET.store(hwnd.0 as isize, Ordering::SeqCst);
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(run);
}

pub fn stop() {
    TARGET.store(0, Ordering::SeqCst);
    set_animating(true);
}

pub fn set_animating(animating: bool) {
    let (lock, signal) = &WAKE;
    if let Ok(mut wanted) = lock.lock() {
        if *wanted != animating {
            *wanted = animating;
            signal.notify_all();
        }
    }
}

/// The window took the last frame request; the next one may be posted.
pub fn frame_taken() {
    FRAME_PENDING.store(false, Ordering::SeqCst);
}

fn run() {
    let (lock, signal) = &WAKE;
    loop {
        if let Ok(guard) = lock.lock() {
            let _unused = signal.wait_while(guard, |wanted| !*wanted);
        }
        let target = TARGET.load(Ordering::SeqCst);
        if target == 0 {
            STARTED.store(false, Ordering::SeqCst);
            return;
        }
        if unsafe { DwmFlush() }.is_err() {
            std::thread::sleep(FALLBACK_FRAME);
        }
        if !FRAME_PENDING.swap(true, Ordering::SeqCst) {
            let posted = unsafe { PostMessageW(Some(HWND(target as *mut c_void)), WM_APP_FRAME, WPARAM(0), LPARAM(0)) };
            if posted.is_err() {
                FRAME_PENDING.store(false, Ordering::SeqCst);
            }
        }
    }
}
