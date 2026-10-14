//! What the window shows and how it reacts, independent of how it is drawn (screens.rs) and of the
//! Win32 plumbing (window.rs). Drawing registers each control's rectangle every frame; input is
//! routed against the rectangles of the last frame.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use crate::anim::Tween;
use crate::gfx::Rect;
use crate::progress::{INSTALL_PLAN, Phase, Progress, UNINSTALL_DATA_PLAN, UNINSTALL_PLAN};
use crate::strings::Text;
use crate::system;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Mode {
    Install,
    Update,
    Uninstall,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Screen {
    Welcome,
    Options,
    Progress,
    Done,
    Error,
    Confirm,
    Removed,
}

/// Every control the user can point at or tab to.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Id {
    Minimize,
    Close,
    Options,
    Install,
    Back,
    Browse,
    JustMe,
    AllUsers,
    Desktop,
    Launch,
    Dismiss,
    Retry,
    Copy,
    DeleteData,
    Uninstall,
    Cancel,
    License,
}

/// What the user decided; read by the plug-in call that is waiting for it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Outcome {
    Next,
    Cancel,
    Launch,
    Close,
    Retry,
}

impl Outcome {
    pub fn word(self) -> &'static str {
        match self {
            Self::Next => "next",
            Self::Cancel => "cancel",
            Self::Launch => "launch",
            Self::Close => "close",
            Self::Retry => "retry",
        }
    }
}

/// Work that must run after the window state is released, because it pumps messages.
pub enum Deferred {
    Browse,
    Open(String),
    Copy(String),
    Minimize,
}

/// Values the installer script hands over before showing a screen.
#[derive(Default, Clone)]
pub struct Config {
    pub version: String,
    pub old_version: String,
    pub dir: String,
    pub dir_user: String,
    pub dir_all: String,
    pub desktop: bool,
    pub all_users: bool,
    pub required_bytes: u64,
    pub data_folders: Vec<String>,
    pub data_shown: String,
    pub error: String,
    pub detail: String,
    pub license: String,
}

impl Config {
    /// The folder name every install ends in: the last part of the per-user default, which the
    /// installer script builds from the same name it appends to a picked folder.
    pub fn app_folder(&self) -> String {
        std::path::Path::new(&self.dir_user).file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default()
    }
}

pub struct HitBox {
    pub id: Id,
    pub rect: Rect,
}

pub struct Ui {
    pub mode: Mode,
    pub screen: Screen,
    pub previous: Screen,
    pub config: Config,
    pub outcome: Option<Outcome>,
    pub entered: Instant,
    pub fade: Tween,
    pub hits: Vec<HitBox>,
    pub hover: Option<Id>,
    pub pressed: Option<Id>,
    pub focus: Option<Id>,
    pub focus_visible: bool,
    hover_tweens: HashMap<Id, Tween>,
    pub toggle: HashMap<Id, Tween>,
    pub dir: String,
    pub dir_custom: bool,
    pub dir_problem: Option<Text>,
    pub desktop: bool,
    pub all_users: bool,
    pub app_running: bool,
    last_scan: Instant,
    pub delete_data: bool,
    pub data_size: Arc<Mutex<Option<u64>>>,
    pub progress: Progress,
    pub copied_at: Option<Instant>,
    pub deferred: Vec<Deferred>,
}

/// How often the welcome screen looks again for a running copy of the app.
const SCAN_SECONDS: f32 = 1.5;
const HOVER_SECONDS: f32 = 0.12;
const TOGGLE_SECONDS: f32 = 0.18;
const FADE_SECONDS: f32 = 0.22;

impl Ui {
    pub fn new(mode: Mode, config: Config) -> Self {
        let mut ui = Self {
            mode,
            screen: Screen::Progress,
            previous: Screen::Progress,
            outcome: None,
            entered: Instant::now(),
            fade: Tween::new(1.0),
            hits: Vec::new(),
            hover: None,
            pressed: None,
            focus: None,
            focus_visible: false,
            hover_tweens: HashMap::new(),
            toggle: HashMap::new(),
            dir: String::new(),
            dir_custom: false,
            dir_problem: None,
            desktop: true,
            all_users: false,
            app_running: false,
            last_scan: Instant::now(),
            delete_data: false,
            data_size: Arc::new(Mutex::new(None)),
            progress: Progress::new(if mode == Mode::Uninstall { UNINSTALL_PLAN } else { INSTALL_PLAN }),
            copied_at: None,
            deferred: Vec::new(),
            config: Config::default(),
        };
        ui.apply_config(config);
        ui
    }

    pub fn apply_config(&mut self, config: Config) {
        self.dir = config.dir.clone();
        self.desktop = config.desktop;
        self.all_users = config.all_users;
        self.dir_custom = !config.dir.is_empty() && config.dir != config.dir_user && config.dir != config.dir_all;
        self.toggle.insert(Id::Desktop, Tween::new(if self.desktop { 1.0 } else { 0.0 }));
        self.toggle.insert(Id::AllUsers, Tween::new(if self.all_users { 1.0 } else { 0.0 }));
        self.toggle.insert(Id::DeleteData, Tween::new(0.0));
        self.config = config;
        self.app_running = system::app_running(&self.dir);
    }

    /// Takes the installer's latest values. The user's own choices live in separate fields and are
    /// never overwritten by it.
    pub fn refresh(&mut self, config: &Config) {
        self.config = config.clone();
    }

    pub fn show(&mut self, screen: Screen) {
        if screen == self.screen && self.outcome.is_none() {
            return;
        }
        self.previous = self.screen;
        self.screen = screen;
        self.outcome = None;
        self.entered = Instant::now();
        self.fade.snap(0.0);
        self.fade.set(1.0, FADE_SECONDS);
        self.focus = None;
        self.pressed = None;
        if screen == Screen::Confirm {
            self.measure_data();
        }
    }

    /// The uninstall screen shows how much deleting the data frees; walking a large profile can
    /// take a moment, so it happens off the window's thread.
    fn measure_data(&self) {
        let folders = self.config.data_folders.clone();
        let slot = Arc::clone(&self.data_size);
        let notify = crate::window::handle();
        std::thread::spawn(move || {
            let size = system::folder_size(&folders);
            if let Ok(mut shown) = slot.lock() {
                *shown = Some(size);
            }
            crate::window::post_sync(notify);
        });
    }

    pub fn modal(&self) -> bool {
        !matches!(self.screen, Screen::Progress)
    }

    // ---- per-frame registration and animation state ---------------------------------------

    pub fn begin_frame(&mut self) {
        self.hits.clear();
        if self.screen == Screen::Welcome && self.last_scan.elapsed().as_secs_f32() > SCAN_SECONDS {
            self.last_scan = Instant::now();
            self.app_running = system::app_running(&self.dir);
        }
    }

    pub fn hit(&mut self, id: Id, rect: Rect) {
        self.hits.push(HitBox { id, rect });
    }

    pub fn hover_amount(&mut self, id: Id) -> f32 {
        let hovered = self.hover == Some(id) || self.pressed == Some(id);
        let tween = self.hover_tweens.entry(id).or_insert_with(|| Tween::new(0.0));
        tween.set(if hovered { 1.0 } else { 0.0 }, HOVER_SECONDS);
        tween.value()
    }

    pub fn toggle_amount(&self, id: Id) -> f32 {
        self.toggle.get(&id).map(Tween::value).unwrap_or(0.0)
    }

    pub fn shows_focus(&self, id: Id) -> bool {
        self.focus_visible && self.focus == Some(id)
    }

    /// True while anything on screen still moves, so the window keeps drawing frames.
    pub fn animating(&self) -> bool {
        self.fade.running()
            || self.hover_tweens.values().any(Tween::running)
            || self.toggle.values().any(Tween::running)
            || self.screen == Screen::Progress
            || self.entered.elapsed().as_secs_f32() < 1.6
            || self.copied_at.is_some_and(|at| at.elapsed().as_secs_f32() < 2.2)
    }

    // ---- input --------------------------------------------------------------------------------

    pub fn hit_at(&self, x: f32, y: f32) -> Option<Id> {
        self.hits.iter().rev().find(|hit| hit.rect.contains(x, y)).map(|hit| hit.id)
    }

    pub fn pointer_move(&mut self, x: f32, y: f32) -> bool {
        let hover = self.hit_at(x, y);
        let changed = hover != self.hover;
        self.hover = hover;
        changed
    }

    pub fn pointer_down(&mut self, x: f32, y: f32) {
        self.pressed = self.hit_at(x, y);
        self.focus_visible = false;
    }

    pub fn pointer_up(&mut self, x: f32, y: f32) {
        let pressed = self.pressed.take();
        if pressed.is_some() && pressed == self.hit_at(x, y) {
            self.activate(pressed.unwrap());
        }
    }

    pub fn tab(&mut self, backward: bool) {
        let order: Vec<Id> = self.hits.iter().map(|hit| hit.id).filter(|id| !matches!(id, Id::Minimize | Id::Close)).collect();
        if order.is_empty() {
            return;
        }
        let current = self.focus.and_then(|focus| order.iter().position(|id| *id == focus));
        let next = match (current, backward) {
            (None, false) => 0,
            (None, true) => order.len() - 1,
            (Some(index), false) => (index + 1) % order.len(),
            (Some(index), true) => (index + order.len() - 1) % order.len(),
        };
        self.focus = Some(order[next]);
        self.focus_visible = true;
    }

    /// Enter: the focused button, or the screen's main action. As in a Windows dialog, Enter on a
    /// check box or a switch does not toggle it; Space does.
    pub fn confirm(&mut self) {
        let toggles = matches!(self.focus, Some(Id::Desktop | Id::DeleteData | Id::JustMe | Id::AllUsers));
        let focused = self.focus.filter(|_| self.focus_visible && !toggles);
        let target = focused.or_else(|| self.primary());
        if let Some(id) = target {
            self.activate(id);
        }
    }

    pub fn space(&mut self) {
        if let Some(id) = self.focus.filter(|_| self.focus_visible) {
            self.activate(id);
        }
    }

    pub fn escape(&mut self) {
        match self.screen {
            Screen::Options => self.show(Screen::Welcome),
            Screen::Progress => {}
            _ => self.activate(Id::Close),
        }
    }

    pub fn arrows(&mut self, right: bool) {
        if matches!(self.focus, Some(Id::JustMe | Id::AllUsers)) {
            let id = if right { Id::AllUsers } else { Id::JustMe };
            self.focus = Some(id);
            self.activate(id);
        }
    }

    fn primary(&self) -> Option<Id> {
        Some(match self.screen {
            Screen::Welcome | Screen::Options => Id::Install,
            Screen::Done => Id::Launch,
            Screen::Error => Id::Retry,
            Screen::Confirm => Id::Uninstall,
            Screen::Removed => Id::Dismiss,
            Screen::Progress => return None,
        })
    }

    pub fn activate(&mut self, id: Id) {
        match id {
            Id::Minimize => self.deferred.push(Deferred::Minimize),
            Id::Close => self.close_requested(),
            Id::Options => self.show(Screen::Options),
            Id::Back => self.show(Screen::Welcome),
            Id::Install => self.try_install(),
            Id::Browse => self.deferred.push(Deferred::Browse),
            Id::JustMe => self.set_all_users(false),
            Id::AllUsers => self.set_all_users(true),
            Id::Desktop => self.flip(Id::Desktop),
            Id::DeleteData => self.flip(Id::DeleteData),
            Id::Launch => self.finish(Outcome::Launch),
            Id::Dismiss => self.finish(Outcome::Close),
            Id::Retry => self.finish(Outcome::Retry),
            Id::Uninstall => self.finish(Outcome::Next),
            Id::Cancel => self.finish(Outcome::Cancel),
            Id::Copy => self.copy_requested(),
            Id::License => self.deferred.push(Deferred::Open(self.license_target())),
        }
    }

    fn finish(&mut self, outcome: Outcome) {
        if self.mode == Mode::Uninstall && outcome == Outcome::Next {
            self.progress.set_plan(if self.delete_data { UNINSTALL_DATA_PLAN } else { UNINSTALL_PLAN });
        }
        self.outcome = Some(outcome);
    }

    /// The caption's close button and Alt+F4. Nothing can stop a run that is writing files.
    pub fn close_requested(&mut self) {
        let outcome = match self.screen {
            Screen::Progress => return,
            Screen::Done | Screen::Removed | Screen::Error => Outcome::Close,
            _ => Outcome::Cancel,
        };
        self.finish(outcome);
    }

    fn flip(&mut self, id: Id) {
        let on = match id {
            Id::Desktop => {
                self.desktop = !self.desktop;
                self.desktop
            }
            _ => {
                self.delete_data = !self.delete_data;
                self.delete_data
            }
        };
        if let Some(tween) = self.toggle.get_mut(&id) {
            tween.set(if on { 1.0 } else { 0.0 }, TOGGLE_SECONDS);
        }
    }

    fn set_all_users(&mut self, all: bool) {
        if all == self.all_users {
            return;
        }
        self.all_users = all;
        if !self.dir_custom {
            self.dir = if all { self.config.dir_all.clone() } else { self.config.dir_user.clone() };
        }
        self.dir_problem = None;
        if let Some(tween) = self.toggle.get_mut(&Id::AllUsers) {
            tween.set(if all { 1.0 } else { 0.0 }, TOGGLE_SECONDS);
        }
    }

    pub fn set_dir(&mut self, dir: String) {
        self.dir_custom = dir != self.config.dir_user && dir != self.config.dir_all;
        self.dir = dir;
        self.dir_problem = None;
        self.app_running = system::app_running(&self.dir);
    }

    /// A per-user install is checked here, while the user can still pick another folder. An
    /// all-users install is checked by the elevated installer, which is the one that writes.
    fn try_install(&mut self) {
        self.dir_problem = self.folder_problem();
        if self.dir_problem.is_some() {
            if self.screen != Screen::Options {
                self.show(Screen::Options);
            }
            return;
        }
        self.finish(Outcome::Next);
    }

    fn folder_problem(&self) -> Option<Text> {
        if let Some((free, _)) = system::free_space(&self.dir) {
            if self.config.required_bytes > 0 && free < self.config.required_bytes {
                return Some(Text::FolderNotEnoughSpace);
            }
        }
        if !self.all_users && !system::can_write(&self.dir) {
            return Some(Text::FolderNotWritable);
        }
        None
    }

    fn copy_requested(&mut self) {
        self.copied_at = Some(Instant::now());
        self.deferred.push(Deferred::Copy(self.copy_text()));
    }

    pub fn copy_text(&self) -> String {
        let title = if self.mode == Mode::Uninstall { Text::ErrorUninstall } else { Text::ErrorInstall };
        let mut text = String::from(crate::strings::tr(title));
        for part in [&self.config.error, &self.config.detail] {
            if !part.is_empty() {
                text.push_str("\r\n");
                text.push_str(part);
            }
        }
        text.push_str(&format!("\r\nAchievement Watcher Next {}", self.config.version));
        text
    }

    fn license_target(&self) -> String {
        if self.config.license.is_empty() {
            "https://github.com/Shirowwww/Achievement-Watcher-Next/blob/main/LICENSE".to_owned()
        } else {
            self.config.license.clone()
        }
    }

    pub fn set_phase(&mut self, phase: Phase) {
        self.progress.set_phase(phase);
    }
}
