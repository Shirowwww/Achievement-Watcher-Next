//! AwSetupUi: the NSIS plug-in that draws AW Next's installer, uninstaller and update window.
//!
//! The installer script keeps doing all the work (pages, sections, registry, shortcuts, the
//! electron-updater contract); this DLL only replaces what the user sees. Calls, in order of use:
//!
//!   AwSetupUi::Set <key> <value>   values the screens show (version, folders, sizes, errors)
//!   AwSetupUi::Init <mode>         install | update | uninstall; pushes "ok" or "error"
//!   AwSetupUi::Show <screen>       welcome | options | progress | done | error | confirm | removed;
//!                                  the interactive screens wait and push the user's answer
//!   AwSetupUi::Get <key>           dir | desktop | allusers | deletedata
//!   AwSetupUi::Phase <name>        from the install section: which step is running
//!   AwSetupUi::Progress <done> <total>   the running step's own progress, when it has one
//!   AwSetupUi::Hide / Close
//!   AwSetupUi::AppRunning <dir> / CloseApp <dir>   processes started from the installation
//!                                  folder (no window needed, so silent runs use them too)
//!   AwSetupUi::RemoveTree <dir> atomic|best       the uninstaller's fast, measured deletion
//!
//! Every call made from the install section's thread only records state and posts a message; the
//! window itself lives on the installer's main thread.

// The DLL name is the NSIS plug-in name (AwSetupUi::Init), so it cannot be snake case.
#![allow(non_snake_case)]

mod anim;
mod bridge;
mod clock;
mod fonts;
mod gfx;
mod icons;
mod modal;
pub mod nsis;
mod progress;
mod screens;
mod strings;
mod system;
mod theme;
mod ui;
mod widgets;
mod window;

use std::sync::Mutex;

use bridge::Command;
use nsis::{Call, ExtraParameters};
use progress::Phase;
use ui::{Config, Mode, Outcome, Screen, Ui};

static CONFIG: Mutex<Option<Config>> = Mutex::new(None);
static MODE: Mutex<Mode> = Mutex::new(Mode::Install);
static PENDING: Mutex<Pending> = Mutex::new(Pending { phase: None, fraction: None });

struct Pending {
    phase: Option<Phase>,
    fraction: Option<(f64, f64)>,
}

fn config() -> Config {
    CONFIG.lock().ok().and_then(|config| config.clone()).unwrap_or_default()
}

fn edit_config(f: impl FnOnce(&mut Config)) {
    if let Ok(mut slot) = CONFIG.lock() {
        f(slot.get_or_insert_with(Config::default));
    }
}

fn flag(value: &str) -> bool {
    matches!(value.trim(), "1" | "true" | "yes")
}

fn set(call: &Call, _extra: *mut ExtraParameters) {
    let key = call.pop();
    let value = call.pop();
    edit_config(|config| match key.as_str() {
        "version" => config.version = value,
        "oldversion" => config.old_version = value,
        "dir" => config.dir = value,
        "diruser" => config.dir_user = value,
        "dirall" => config.dir_all = value,
        "desktop" => config.desktop = flag(&value),
        "allusers" => config.all_users = flag(&value),
        "requiredkb" => config.required_bytes = value.trim().parse::<u64>().unwrap_or(0) * 1024,
        "datafolder" => config.data_folders.push(value),
        "datashown" => config.data_shown = value,
        "error" => config.error = value,
        "detail" => config.detail = value,
        "license" => config.license = value,
        _ => {}
    });
}

fn init(call: &Call, extra: *mut ExtraParameters) {
    let mode = match call.pop().as_str() {
        "update" => Mode::Update,
        "uninstall" => Mode::Uninstall,
        _ => Mode::Install,
    };
    if nsis::is_silent(extra) || bridge::running() {
        call.push(if bridge::running() { "ok" } else { "error" });
        return;
    }
    // A way out for a machine where the window misbehaves: the installer then shows NSIS's own
    // pages, which the script supports as its fallback anyway.
    if std::env::var_os("AW_SETUP_CLASSIC").is_some() {
        call.push("error");
        return;
    }
    strings::select(call.language());
    if let Ok(mut slot) = MODE.lock() {
        *slot = mode;
    }
    call.push(if bridge::start(mode, config(), call.parent) { "ok" } else { "error" });
}

/// How long the update card stays on its last frame before the app restarts.
const UPDATE_LINGER_SECONDS: f32 = 0.9;

fn show(call: &Call, _extra: *mut ExtraParameters) {
    let screen = match call.pop().as_str() {
        "welcome" => Screen::Welcome,
        "options" => Screen::Options,
        "done" => Screen::Done,
        "error" => Screen::Error,
        "confirm" => Screen::Confirm,
        "removed" => Screen::Removed,
        _ => Screen::Progress,
    };
    if !bridge::running() {
        call.push("error");
        return;
    }
    trace(&format!("show {screen:?}"));
    let mode = MODE.lock().map(|mode| *mode).unwrap_or(Mode::Install);
    if (screen, mode) == (Screen::Done, Mode::Update) {
        report_phase(Phase::Done);
    }
    bridge::send(Command::Show(screen, config()));
    let answer = match (screen, mode) {
        (Screen::Progress, _) => "ok",
        (Screen::Done, Mode::Update) => {
            bridge::linger(UPDATE_LINGER_SECONDS);
            Outcome::Launch.word()
        }
        _ => bridge::wait_for_answer().word(),
    };
    call.push(answer);
}

fn get(call: &Call, _extra: *mut ExtraParameters) {
    let key = call.pop();
    let choices = bridge::choices();
    let value = match key.as_str() {
        "dir" => choices.dir,
        "desktop" => bool_word(choices.desktop),
        "allusers" => bool_word(choices.all_users),
        "deletedata" => bool_word(choices.delete_data),
        _ => String::new(),
    };
    call.push(&value);
}

fn bool_word(value: bool) -> String {
    (if value { "1" } else { "0" }).to_owned()
}

fn phase(call: &Call, _extra: *mut ExtraParameters) {
    let name = call.pop();
    trace(&name);
    if let Some(phase) = Phase::parse(name.trim()) {
        report_phase(phase);
    }
}

fn report_phase(phase: Phase) {
    if let Ok(mut pending) = PENDING.lock() {
        pending.phase = Some(phase);
        pending.fraction = None;
    }
    window::post_sync(window::handle());
}

/// Timing of each step, for measuring a run: set AW_SETUP_TRACE to a file path before starting
/// the installer and each phase is appended to it with the milliseconds since the first one.
fn trace(phase: &str) {
    use std::io::Write as _;
    use std::sync::OnceLock;
    static START: OnceLock<std::time::Instant> = OnceLock::new();
    let Ok(path) = std::env::var("AW_SETUP_TRACE") else { return };
    let since = START.get_or_init(std::time::Instant::now).elapsed().as_millis();
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{since:>7} ms  {phase}");
    }
}

fn progress_call(call: &Call, _extra: *mut ExtraParameters) {
    let done: f64 = call.pop().trim().parse().unwrap_or(0.0);
    let total: f64 = call.pop().trim().parse().unwrap_or(0.0);
    if let Ok(mut pending) = PENDING.lock() {
        pending.fraction = Some((done, total));
    }
    window::post_sync(window::handle());
}

/// Applies what the install section reported since the last frame. Called by the window.
pub(crate) fn drain_pending(ui: &mut Ui) {
    let Ok(mut pending) = PENDING.lock() else { return };
    if let Some(phase) = pending.phase.take() {
        ui.set_phase(phase);
    }
    if let Some((done, total)) = pending.fraction.take() {
        ui.progress.set_fraction(done, total);
    }
}

fn hide(call: &Call, _extra: *mut ExtraParameters) {
    bridge::send(Command::Hide);
    call.push("ok");
}

fn close(call: &Call, _extra: *mut ExtraParameters) {
    bridge::stop();
    call.push("ok");
}

/// "1" when a process started from the given folder is running. Works without a window, so the
/// silent install and uninstall use it too.
fn app_running(call: &Call, _extra: *mut ExtraParameters) {
    let dir = call.pop();
    call.push(if system::app_running(&dir) { "1" } else { "0" });
}

/// Deletes the installation folder: `RemoveTree <dir> atomic|best`. Pushes "ok", or the reason
/// an atomic removal refused to start. The files' progress feeds the bar.
fn remove_tree(call: &Call, _extra: *mut ExtraParameters) {
    let dir = call.pop();
    let atomic = call.pop() == "atomic";
    let result = system::remove_tree(&dir, atomic, |done, total| {
        if let Ok(mut pending) = PENDING.lock() {
            pending.fraction = Some((done as f64, total as f64));
        }
        window::post_sync(window::handle());
    });
    match result {
        Ok(()) => call.push("ok"),
        Err(reason) => call.push(&reason),
    }
}

/// Ends every process started from the given folder and pushes how many are still alive.
fn close_app(call: &Call, _extra: *mut ExtraParameters) {
    let dir = call.pop();
    call.push(&system::close_app(&dir).to_string());
}

nsis_export!(Set, set);
nsis_export!(Init, init);
nsis_export!(Show, show);
nsis_export!(Get, get);
nsis_export!(Phase, phase);
nsis_export!(Progress, progress_call);
nsis_export!(Hide, hide);
nsis_export!(Close, close);
nsis_export!(AppRunning, app_running);
nsis_export!(CloseApp, close_app);
nsis_export!(RemoveTree, remove_tree);
