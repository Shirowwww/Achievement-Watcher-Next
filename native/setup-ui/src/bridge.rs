//! The installer's threads and the window's thread.
//!
//! The window runs on a thread of its own. NSIS sends its main thread a message for every
//! instruction a section executes (to move its progress bar): with the window drawing on that same
//! thread, each instruction waited for a frame, and a scan of the running processes took 33 seconds
//! instead of a fraction of one. Here the installer's threads only post commands and wait for
//! answers, and the window never delays them.

use std::ffi::c_void;
use std::sync::Mutex;
use std::sync::atomic::{AtomicIsize, Ordering};
use std::sync::mpsc;
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{COLORREF, HANDLE, HWND, LPARAM, RECT, WAIT_OBJECT_0, WPARAM};
use windows::Win32::System::Threading::{CreateEventW, INFINITE};
use windows::Win32::UI::WindowsAndMessaging::*;

use crate::ui::{Config, Mode, Outcome, Screen, Ui};
use crate::window;

/// What the installer asks of the window.
pub enum Command {
    Show(Screen, Config),
    Hide,
    Close,
}

/// The user's choices, copied out of the window when they answer.
#[derive(Clone, Default)]
pub struct Choices {
    pub dir: String,
    pub desktop: bool,
    pub all_users: bool,
    pub delete_data: bool,
}

static OUTCOME: Mutex<Option<Outcome>> = Mutex::new(None);
static CHOICES: Mutex<Option<Choices>> = Mutex::new(None);
static ANSWERED: AtomicIsize = AtomicIsize::new(0);
static THREAD: Mutex<Option<JoinHandle<()>>> = Mutex::new(None);

/// How long Close waits for the window's thread to finish.
const CLOSE_TIMEOUT: Duration = Duration::from_secs(2);

/// Starts the window's thread and waits until the window exists. `nsis` is the installer's own
/// dialog; it is made invisible from this thread, since changing a window sends messages to the
/// thread that owns it, and that thread is the one waiting here.
pub fn start(mode: Mode, config: Config, nsis: HWND) -> bool {
    let event = unsafe { CreateEventW(None, false, false, None) };
    let Ok(event) = event else { return false };
    ANSWERED.store(event.0 as isize, Ordering::SeqCst);
    crate::modal::set_installer_dialog(nsis);
    let (ready, created) = mpsc::channel::<Option<RECT>>();
    let thread = std::thread::spawn(move || {
        let rect = window::create(mode, Ui::new(mode, config)).ok();
        let _ = ready.send(rect);
        if rect.is_some() {
            window::run_loop();
        }
    });
    let Ok(Some(rect)) = created.recv() else { return false };
    if let Ok(mut slot) = THREAD.lock() {
        *slot = Some(thread);
    }
    hide_nsis(nsis, rect);
    true
}

/// The installer dialog keeps running every page and section, but fully transparent, click-through
/// and off the taskbar. It sits exactly behind the window so its message boxes centre on it.
fn hide_nsis(nsis: HWND, rect: RECT) {
    if nsis.0.is_null() {
        return;
    }
    unsafe {
        let style = GetWindowLongPtrW(nsis, GWL_EXSTYLE) as u32;
        let hidden = (style | WS_EX_LAYERED.0 | WS_EX_TRANSPARENT.0 | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0;
        SetWindowLongPtrW(nsis, GWL_EXSTYLE, hidden as _);
        let _ = SetLayeredWindowAttributes(nsis, COLORREF(0), 0, LWA_ALPHA);
        let (width, height) = (rect.right - rect.left, rect.bottom - rect.top);
        let _ = SetWindowPos(nsis, None, rect.left, rect.top, width, height, SWP_NOZORDER | SWP_NOACTIVATE);
    }
}

pub fn running() -> bool {
    window::handle() != 0
}

pub fn send(command: Command) {
    let target = window::handle();
    if target == 0 {
        return;
    }
    if matches!(command, Command::Show(..)) {
        if let Ok(mut outcome) = OUTCOME.lock() {
            *outcome = None;
        }
    }
    let boxed = Box::into_raw(Box::new(command));
    let posted = unsafe { PostMessageW(Some(HWND(target as *mut c_void)), window::WM_APP_COMMAND, WPARAM(0), LPARAM(boxed as isize)) };
    if posted.is_err() {
        drop(unsafe { Box::from_raw(boxed) });
    }
}

/// Called on the window's thread when the user answers.
pub fn answer(outcome: Outcome, choices: Choices) {
    if let Ok(mut slot) = CHOICES.lock() {
        *slot = Some(choices);
    }
    if let Ok(mut slot) = OUTCOME.lock() {
        *slot = Some(outcome);
    }
    unsafe {
        let _ = windows::Win32::System::Threading::SetEvent(HANDLE(ANSWERED.load(Ordering::SeqCst) as *mut c_void));
    }
}

pub fn choices() -> Choices {
    CHOICES.lock().ok().and_then(|slot| slot.clone()).unwrap_or_default()
}

/// Waits for the user's answer while keeping this thread's own windows (the hidden NSIS dialog)
/// responsive: a thread that stops pumping can hang any program that broadcasts a message.
pub fn wait_for_answer() -> Outcome {
    loop {
        if let Some(outcome) = OUTCOME.lock().ok().and_then(|mut slot| slot.take()) {
            return outcome;
        }
        if !running() {
            return Outcome::Cancel;
        }
        wait_pumping(None);
    }
}

/// Keeps this thread pumping for `seconds` (the update's last frame stays on screen meanwhile).
pub fn linger(seconds: f32) {
    let until = Instant::now() + Duration::from_secs_f32(seconds);
    while let Some(left) = until.checked_duration_since(Instant::now()) {
        wait_pumping(Some(left));
    }
}

fn wait_pumping(timeout: Option<Duration>) {
    let event = HANDLE(ANSWERED.load(Ordering::SeqCst) as *mut c_void);
    let millis = timeout.map(|left| left.as_millis().min(u32::MAX as u128) as u32).unwrap_or(INFINITE);
    let woke = unsafe { MsgWaitForMultipleObjects(Some(&[event]), false, millis, QS_ALLINPUT) };
    if woke == WAIT_OBJECT_0 {
        return;
    }
    let mut message = MSG::default();
    unsafe {
        while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
            if message.message == WM_QUIT {
                PostQuitMessage(message.wParam.0 as i32);
                return;
            }
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}

/// Closes the window and lets its thread finish.
pub fn stop() {
    send(Command::Close);
    let thread = THREAD.lock().ok().and_then(|mut slot| slot.take());
    if let Some(thread) = thread {
        let until = Instant::now() + CLOSE_TIMEOUT;
        while !thread.is_finished() && Instant::now() < until {
            wait_pumping(Some(Duration::from_millis(20)));
        }
        if thread.is_finished() {
            let _ = thread.join();
        }
    }
}
