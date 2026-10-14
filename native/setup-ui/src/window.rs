//! The window's thread: a borderless window that keeps the system shadow, rounded corners and
//! minimise animation, drawn entirely with Direct2D. It owns the drawing state; the installer's
//! threads reach it only through bridge.rs.

use std::cell::RefCell;
use std::ffi::c_void;
use std::sync::atomic::{AtomicIsize, Ordering};

use windows::Win32::Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM};
use windows::Win32::Graphics::Dwm::{
    DWMWA_BORDER_COLOR, DWMWA_CLOAK, DWMWA_USE_IMMERSIVE_DARK_MODE, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND, DwmExtendFrameIntoClientArea,
    DwmSetWindowAttribute,
};
use windows::Win32::Graphics::Gdi::{
    BeginPaint, EndPaint, GetMonitorInfoW, InvalidateRect, MONITOR_DEFAULTTOPRIMARY, MONITORINFO, MonitorFromPoint, PAINTSTRUCT,
    ScreenToClient, UpdateWindow,
};
use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Controls::{MARGINS, WM_MOUSELEAVE};
use windows::Win32::UI::HiDpi::{
    DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, GetDpiForMonitor, MDT_EFFECTIVE_DPI, SetThreadDpiAwarenessContext,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, ReleaseCapture, SetCapture, SetFocus, TME_LEAVE, TRACKMOUSEEVENT, TrackMouseEvent, VK_ESCAPE, VK_LEFT, VK_RETURN, VK_RIGHT,
    VK_SHIFT, VK_SPACE, VK_TAB,
};
use windows::Win32::UI::Shell::{ITaskbarList3, TBPF_NOPROGRESS, TBPF_NORMAL, TaskbarList};
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::core::{BOOL, HSTRING, PCWSTR, w};

use crate::bridge::{self, Choices, Command};
use crate::gfx::Gfx;
use crate::screens;
use crate::theme;
use crate::ui::{Deferred, Mode, Screen, Ui};

const CLASS: PCWSTR = w!("AwNextSetupWindow");
/// Posted from other threads (the install section, the data-size walk) to repaint with new state.
const WM_APP_SYNC: u32 = WM_APP + 1;
/// A boxed bridge::Command in lParam.
pub const WM_APP_COMMAND: u32 = WM_APP + 3;
/// NSIS keeps the installer's icon at this resource id.
const NSIS_ICON_ID: usize = 103;

struct Host {
    hwnd: HWND,
    gfx: Gfx,
    ui: Ui,
    pixels: (u32, u32),
    taskbar: Option<ITaskbarList3>,
    taskbar_shown: i32,
    tracking: bool,
    answered: bool,
}

thread_local! {
    static HOST: RefCell<Option<Host>> = const { RefCell::new(None) };
}

static WINDOW: AtomicIsize = AtomicIsize::new(0);
static TASKBAR_CREATED: AtomicIsize = AtomicIsize::new(0);

fn with_host<R>(f: impl FnOnce(&mut Host) -> R) -> Option<R> {
    HOST.with(|cell| cell.try_borrow_mut().ok().and_then(|mut host| host.as_mut().map(f)))
}

/// The window, as a raw handle any thread can post to; 0 when there is none.
pub fn handle() -> isize {
    WINDOW.load(Ordering::SeqCst)
}

pub fn post_sync(target: isize) {
    if target != 0 {
        unsafe {
            let _ = PostMessageW(Some(HWND(target as *mut c_void)), WM_APP_SYNC, WPARAM(0), LPARAM(0));
        }
    }
}

fn dpi_scale_at_cursor() -> (f32, RECT) {
    unsafe {
        let mut cursor = POINT::default();
        let _ = GetCursorPos(&mut cursor);
        let monitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTOPRIMARY);
        let mut info = MONITORINFO { cbSize: size_of::<MONITORINFO>() as u32, ..Default::default() };
        let _ = GetMonitorInfoW(monitor, &mut info);
        let (mut dpi_x, mut dpi_y) = (96u32, 96u32);
        let _ = GetDpiForMonitor(monitor, MDT_EFFECTIVE_DPI, &mut dpi_x, &mut dpi_y);
        (dpi_x as f32 / 96.0, info.rcWork)
    }
}

fn register_class() {
    unsafe {
        let instance = GetModuleHandleW(None).unwrap_or_default();
        let icon = LoadImageW(Some(instance.into()), PCWSTR(NSIS_ICON_ID as *const u16), IMAGE_ICON, 0, 0, LR_DEFAULTSIZE | LR_SHARED)
            .map(|handle| HICON(handle.0))
            .unwrap_or_default();
        let class = WNDCLASSEXW {
            cbSize: size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: Some(window_proc),
            hInstance: crate::nsis::this_module().into(),
            hIcon: icon,
            hIconSm: icon,
            hCursor: LoadCursorW(None, IDC_ARROW).unwrap_or_default(),
            lpszClassName: CLASS,
            ..Default::default()
        };
        RegisterClassExW(&class);
    }
}

/// Creates the window, hidden, on the calling thread (the window's thread). Returns where it is.
pub fn create(mode: Mode, ui: Ui) -> windows::core::Result<RECT> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
    crate::anim::read_motion_preference();
    register_class();
    let (scale, work) = dpi_scale_at_cursor();
    let (width, height) = if mode == Mode::Update { theme::COMPACT_SIZE } else { theme::MAIN_SIZE };
    let (px_w, px_h) = ((width * scale).round() as i32, (height * scale).round() as i32);
    let x = work.left + (work.right - work.left - px_w) / 2;
    let y = work.top + (work.bottom - work.top - px_h) / 2;
    let title = HSTRING::from("Achievement Watcher Next");
    let style = WS_POPUP | WS_THICKFRAME | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX;
    let hwnd = unsafe {
        CreateWindowExW(WS_EX_APPWINDOW, CLASS, &title, style, x, y, px_w, px_h, None, None, Some(crate::nsis::this_module().into()), None)?
    };
    TASKBAR_CREATED.store(unsafe { RegisterWindowMessageW(w!("TaskbarButtonCreated")) } as isize, Ordering::SeqCst);
    decorate(hwnd);
    let gfx = Gfx::new(hwnd, scale)?;
    HOST.with(|cell| {
        *cell.borrow_mut() = Some(Host {
            hwnd,
            gfx,
            ui,
            pixels: (px_w as u32, px_h as u32),
            taskbar: None,
            taskbar_shown: -1,
            tracking: false,
            answered: true,
        });
    });
    WINDOW.store(hwnd.0 as isize, Ordering::SeqCst);
    crate::clock::start(hwnd);
    crate::modal::watch();
    Ok(RECT { left: x, top: y, right: x + px_w, bottom: y + px_h })
}

fn decorate(hwnd: HWND) {
    unsafe {
        let dark: i32 = 1;
        let _ = DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, (&dark as *const i32).cast(), 4);
        let round = DWMWCP_ROUND;
        let _ = DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &round as *const _ as *const c_void, 4);
        let border = COLORREF(0x0057_3D2A);
        let _ = DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, (&border as *const COLORREF).cast(), 4);
        let margins = MARGINS { cxLeftWidth: 1, cxRightWidth: 1, cyTopHeight: 1, cyBottomHeight: 1 };
        let _ = DwmExtendFrameIntoClientArea(hwnd, &margins);
        let _ = SetWindowPos(hwnd, None, 0, 0, 0, 0, SWP_FRAMECHANGED | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE);
    }
}

/// The window's message loop; returns once the window is closed.
pub fn run_loop() {
    let mut message = MSG::default();
    unsafe {
        while GetMessageW(&mut message, None, 0, 0).0 > 0 {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}

fn run_command(hwnd: HWND, command: Command) {
    match command {
        Command::Show(screen, config) => {
            with_host(|host| {
                host.ui.refresh(&config);
                host.ui.show(screen);
                host.answered = false;
            });
            unsafe {
                if !IsWindowVisible(hwnd).as_bool() {
                    show_painted(hwnd);
                }
                let _ = SetForegroundWindow(hwnd);
                let _ = SetFocus(Some(hwnd));
            }
        }
        Command::Hide => unsafe {
            let _ = ShowWindow(hwnd, SW_HIDE);
        },
        Command::Close => {
            WINDOW.store(0, Ordering::SeqCst);
            crate::clock::stop();
            crate::modal::stop();
            HOST.with(|cell| cell.borrow_mut().take());
            unsafe {
                let _ = DestroyWindow(hwnd);
                PostQuitMessage(0);
            }
        }
    }
}

/// Shows the window once its first frame is drawn. The first frame takes a few hundred
/// milliseconds (fonts, layouts, the mark), and DWM showed the bare client area meanwhile: a flat
/// panel that flashed before every installer, uninstaller and update.
fn show_painted(hwnd: HWND) {
    let set_cloak = |cloaked: bool| unsafe {
        let value = BOOL::from(cloaked);
        let _ = DwmSetWindowAttribute(hwnd, DWMWA_CLOAK, (&value as *const BOOL).cast(), size_of::<BOOL>() as u32);
    };
    set_cloak(true);
    unsafe {
        let _ = ShowWindow(hwnd, SW_SHOW);
        let _ = UpdateWindow(hwnd);
    }
    set_cloak(false);
}

/// Hands the user's answer to the installer thread waiting for it, once per screen.
fn publish_answer() {
    let answer = with_host(|host| {
        let outcome = host.ui.outcome?;
        if host.answered {
            return None;
        }
        host.answered = true;
        let ui = &host.ui;
        Some((outcome, Choices { dir: ui.dir.clone(), desktop: ui.desktop, all_users: ui.all_users, delete_data: ui.delete_data }))
    })
    .flatten();
    if let Some((outcome, choices)) = answer {
        bridge::answer(outcome, choices);
    }
}

// ---- the window procedure ---------------------------------------------------------------------

unsafe extern "system" fn window_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let handled = std::panic::catch_unwind(|| on_message(hwnd, message, wparam, lparam));
    match handled {
        Ok(Some(result)) => result,
        _ => unsafe { DefWindowProcW(hwnd, message, wparam, lparam) },
    }
}

fn on_message(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> Option<LRESULT> {
    let result = match message {
        WM_NCCALCSIZE if wparam.0 != 0 => LRESULT(0),
        WM_NCHITTEST => hit_test(hwnd, lparam)?,
        WM_ERASEBKGND => LRESULT(1),
        WM_PAINT => {
            paint(hwnd);
            LRESULT(0)
        }
        WM_SIZE => {
            let (width, height) = ((lparam.0 & 0xFFFF) as u32, ((lparam.0 >> 16) & 0xFFFF) as u32);
            with_host(|host| {
                host.pixels = (width, height);
                host.gfx.resize(width, height);
            });
            LRESULT(0)
        }
        WM_DPICHANGED => dpi_changed(hwnd, wparam, lparam),
        WM_MOUSEMOVE => pointer(hwnd, lparam, PointerEvent::Move),
        WM_MOUSELEAVE => {
            with_host(|host| {
                host.tracking = false;
                host.ui.hover = None;
            });
            invalidate(hwnd)
        }
        WM_LBUTTONDOWN => pointer(hwnd, lparam, PointerEvent::Down),
        WM_LBUTTONUP => pointer(hwnd, lparam, PointerEvent::Up),
        WM_KEYDOWN => key(hwnd, wparam)?,
        WM_CLOSE => {
            with_host(|host| host.ui.close_requested());
            invalidate(hwnd)
        }
        WM_APP_SYNC => invalidate(hwnd),
        WM_APP_COMMAND => {
            let command = unsafe { Box::from_raw(lparam.0 as *mut Command) };
            run_command(hwnd, *command);
            return Some(invalidate(hwnd));
        }
        crate::clock::WM_APP_FRAME => {
            crate::clock::frame_taken();
            invalidate(hwnd)
        }
        _ if message as isize == TASKBAR_CREATED.load(Ordering::SeqCst) && message != 0 => {
            connect_taskbar();
            LRESULT(0)
        }
        _ => return None,
    };
    run_deferred(hwnd);
    publish_answer();
    Some(result)
}

fn invalidate(hwnd: HWND) -> LRESULT {
    unsafe {
        let _ = InvalidateRect(Some(hwnd), None, false);
    }
    LRESULT(0)
}

fn client_dips(x: i32, y: i32) -> (f32, f32) {
    let scale = with_host(|host| host.gfx.scale).unwrap_or(1.0);
    (x as f32 / scale, y as f32 / scale)
}

fn hit_test(hwnd: HWND, lparam: LPARAM) -> Option<LRESULT> {
    let mut point = POINT { x: (lparam.0 & 0xFFFF) as i16 as i32, y: ((lparam.0 >> 16) & 0xFFFF) as i16 as i32 };
    unsafe {
        let _ = ScreenToClient(hwnd, &mut point);
    }
    let (x, y) = client_dips(point.x, point.y);
    let (mode, over_control) = with_host(|host| (host.ui.mode, host.ui.hit_at(x, y).is_some()))?;
    let draggable = mode == Mode::Update || (y < theme::CAPTION_HEIGHT && !over_control);
    Some(LRESULT(if draggable { HTCAPTION as isize } else { HTCLIENT as isize }))
}

enum PointerEvent {
    Move,
    Down,
    Up,
}

fn pointer(hwnd: HWND, lparam: LPARAM, event: PointerEvent) -> LRESULT {
    let (x, y) = client_dips((lparam.0 & 0xFFFF) as i16 as i32, ((lparam.0 >> 16) & 0xFFFF) as i16 as i32);
    let start_tracking = with_host(|host| {
        match event {
            PointerEvent::Move => {
                host.ui.pointer_move(x, y);
            }
            PointerEvent::Down => host.ui.pointer_down(x, y),
            PointerEvent::Up => host.ui.pointer_up(x, y),
        }
        let start = !host.tracking;
        host.tracking = true;
        start
    })
    .unwrap_or(false);
    unsafe {
        match event {
            PointerEvent::Down => {
                SetCapture(hwnd);
            }
            PointerEvent::Up => {
                let _ = ReleaseCapture();
            }
            PointerEvent::Move => {}
        }
        if start_tracking {
            let mut track = TRACKMOUSEEVENT { cbSize: size_of::<TRACKMOUSEEVENT>() as u32, dwFlags: TME_LEAVE, hwndTrack: hwnd, dwHoverTime: 0 };
            let _ = TrackMouseEvent(&mut track);
        }
    }
    invalidate(hwnd)
}

fn key(hwnd: HWND, wparam: WPARAM) -> Option<LRESULT> {
    let code = wparam.0 as u16;
    let shift = unsafe { GetKeyState(VK_SHIFT.0 as i32) } < 0;
    with_host(|host| match code {
        _ if code == VK_TAB.0 => host.ui.tab(shift),
        _ if code == VK_RETURN.0 => host.ui.confirm(),
        _ if code == VK_SPACE.0 => host.ui.space(),
        _ if code == VK_ESCAPE.0 => host.ui.escape(),
        _ if code == VK_LEFT.0 => host.ui.arrows(false),
        _ if code == VK_RIGHT.0 => host.ui.arrows(true),
        _ => {}
    })?;
    Some(invalidate(hwnd))
}

fn dpi_changed(hwnd: HWND, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let dpi = (wparam.0 & 0xFFFF) as f32;
    with_host(|host| host.gfx.set_scale(dpi / 96.0));
    let suggested = unsafe { &*(lparam.0 as *const RECT) };
    unsafe {
        let _ = SetWindowPos(
            hwnd,
            None,
            suggested.left,
            suggested.top,
            suggested.right - suggested.left,
            suggested.bottom - suggested.top,
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }
    invalidate(hwnd)
}

fn paint(hwnd: HWND) {
    let mut paint_struct = PAINTSTRUCT::default();
    unsafe { BeginPaint(hwnd, &mut paint_struct) };
    let animating = with_host(|host| {
        let (width, height) = host.pixels;
        let Host { gfx, ui, .. } = host;
        crate::drain_pending(ui);
        let _ = gfx.frame(width, height, |g| screens::paint(g, ui));
        update_taskbar(host);
        host.ui.animating()
    })
    .unwrap_or(false);
    unsafe {
        let _ = EndPaint(hwnd, &paint_struct);
    }
    crate::clock::set_animating(animating);
}

fn connect_taskbar() {
    let taskbar: Option<ITaskbarList3> = unsafe { CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER).ok() };
    let taskbar = taskbar.filter(|list| unsafe { list.HrInit() }.is_ok());
    with_host(|host| host.taskbar = taskbar);
}

/// Mirrors the bar on the taskbar button, in whole percents so it is not updated every frame.
fn update_taskbar(host: &mut Host) {
    let Some(taskbar) = &host.taskbar else { return };
    let percent = if host.ui.screen == Screen::Progress { (host.ui.progress.shown() * 100.0) as i32 } else { -1 };
    if percent == host.taskbar_shown {
        return;
    }
    host.taskbar_shown = percent;
    unsafe {
        if percent < 0 {
            let _ = taskbar.SetProgressState(host.hwnd, TBPF_NOPROGRESS);
        } else {
            let _ = taskbar.SetProgressState(host.hwnd, TBPF_NORMAL);
            let _ = taskbar.SetProgressValue(host.hwnd, percent as u64, 100);
        }
    }
}

fn run_deferred(hwnd: HWND) {
    let work = with_host(|host| std::mem::take(&mut host.ui.deferred)).unwrap_or_default();
    for item in work {
        match item {
            Deferred::Minimize => unsafe {
                let _ = ShowWindow(hwnd, SW_MINIMIZE);
            },
            Deferred::Open(target) => crate::system::open(hwnd, &target),
            // "Copied" is only shown for a copy that reached the clipboard.
            Deferred::Copy(text) => {
                if !crate::system::copy_text(hwnd, &text) {
                    with_host(|host| host.ui.copied_at = None);
                }
            }
            Deferred::Browse => browse(hwnd),
        }
    }
}

fn browse(hwnd: HWND) {
    let current = with_host(|host| host.ui.dir.clone()).unwrap_or_default();
    let title = crate::strings::tr(crate::strings::Text::BrowseTitle);
    if let Some(chosen) = crate::system::pick_folder(hwnd, title, &current) {
        with_host(|host| {
            let dir = crate::system::with_app_folder(&chosen, &host.ui.config.app_folder());
            host.ui.set_dir(dir);
        });
        invalidate(hwnd);
    }
}
