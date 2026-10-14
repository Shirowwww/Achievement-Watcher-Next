//! Drives AwSetupUi.dll the way NSIS does, so the screens can be looked at without building an
//! installer: `cargo run --release --example preview -- <install|upgrade|update|uninstall|error> [langid]`.
//! Progress is simulated on a second thread, as the install section would report it.

use std::ffi::c_void;
use std::time::Duration;

use windows::Win32::Foundation::{GlobalFree, HMODULE, HWND};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
use windows::Win32::System::Memory::{GPTR, GlobalAlloc};
use windows::core::{HSTRING, PCSTR};

const STRING_SIZE: usize = 1024;

#[repr(C)]
struct StackT {
    next: *mut StackT,
    text: [u16; 1],
}

type Export = unsafe extern "C" fn(HWND, i32, *mut u16, *mut *mut StackT, *mut c_void);

struct Plugin {
    module: HMODULE,
    variables: Vec<u16>,
}

impl Plugin {
    fn load(language: u16) -> Self {
        let path = std::env::current_exe().unwrap().parent().unwrap().parent().unwrap().join("AwSetupUi.dll");
        let module = unsafe { LoadLibraryW(&HSTRING::from(path.as_os_str())).expect("AwSetupUi.dll") };
        let mut variables = vec![0u16; STRING_SIZE * 25];
        for (index, unit) in language.to_string().encode_utf16().enumerate() {
            variables[24 * STRING_SIZE + index] = unit;
        }
        Self { module, variables }
    }

    /// Calls `name` with `args` (first argument on top of the stack) and returns what it pushed.
    fn call(&mut self, name: &str, args: &[&str]) -> Option<String> {
        let symbol = format!("{name}\0");
        let export: Export = unsafe { std::mem::transmute(GetProcAddress(self.module, PCSTR(symbol.as_ptr()))?) };
        let mut top: *mut StackT = std::ptr::null_mut();
        for arg in args.iter().rev() {
            top = push(top, arg);
        }
        unsafe { export(HWND::default(), STRING_SIZE as i32, self.variables.as_mut_ptr(), &mut top, std::ptr::null_mut()) };
        pop(&mut top)
    }

    fn set(&mut self, key: &str, value: &str) {
        self.call("Set", &[key, value]);
    }
}

fn push(next: *mut StackT, text: &str) -> *mut StackT {
    unsafe {
        let node = GlobalAlloc(GPTR, size_of::<StackT>() + STRING_SIZE * 2).unwrap().0 as *mut StackT;
        for (index, unit) in text.encode_utf16().enumerate() {
            *(*node).text.as_mut_ptr().add(index) = unit;
        }
        (*node).next = next;
        node
    }
}

fn pop(top: &mut *mut StackT) -> Option<String> {
    if top.is_null() {
        return None;
    }
    unsafe {
        let node = *top;
        let text = (*node).text.as_ptr();
        let length = (0..STRING_SIZE).take_while(|&i| *text.add(i) != 0).count();
        let value = String::from_utf16_lossy(std::slice::from_raw_parts(text, length));
        *top = (*node).next;
        let _ = GlobalFree(Some(windows::Win32::Foundation::HGLOBAL(node as *mut c_void)));
        Some(value)
    }
}

/// The section's side: phases and the extraction's own progress, from another thread.
fn simulate(phases: &'static [&'static str]) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let mut plugin = Plugin::load(0);
        for phase in phases {
            plugin.call("Phase", &[phase]);
            if *phase == "extracting" || *phase == "files" {
                for step in 0..=40 {
                    plugin.call("Progress", &[&(step * 25).to_string(), "1000"]);
                    std::thread::sleep(Duration::from_millis(60));
                }
            } else {
                std::thread::sleep(Duration::from_millis(900));
            }
        }
    })
}

/// Lets the window paint while the simulated section runs.
fn wait(plugin: &mut Plugin, worker: std::thread::JoinHandle<()>) {
    plugin.call("Show", &["progress"]);
    while !worker.is_finished() {
        std::thread::sleep(Duration::from_millis(8));
        pump();
    }
}

fn pump() {
    use windows::Win32::UI::WindowsAndMessaging::{DispatchMessageW, MSG, PM_REMOVE, PeekMessageW, TranslateMessage};
    let mut message = MSG::default();
    unsafe {
        while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
            let _ = TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    }
}

fn configure(plugin: &mut Plugin, old_version: &str) {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    plugin.set("version", "3.12.0");
    plugin.set("oldversion", old_version);
    plugin.set("diruser", &format!("{local}\\Programs\\Achievement Watcher"));
    plugin.set("dirall", "C:\\Program Files\\Achievement Watcher");
    plugin.set("dir", &format!("{local}\\Programs\\Achievement Watcher"));
    plugin.set("desktop", "1");
    plugin.set("requiredkb", "440320");
    plugin.set("datafolder", &format!("{appdata}\\Achievement Watcher Next"));
    plugin.set("datashown", "%APPDATA%\\Achievement Watcher Next");
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let scenario = args.get(1).map(String::as_str).unwrap_or("install");
    let language: u16 = args.get(2).and_then(|value| value.parse().ok()).unwrap_or(1036);
    let mut plugin = Plugin::load(language);
    let old = if scenario == "upgrade" || scenario == "update" { "3.11.3" } else { "" };
    configure(&mut plugin, old);
    let mode = match scenario {
        "update" => "update",
        "uninstall" => "uninstall",
        _ => "install",
    };
    println!("Init: {:?}", plugin.call("Init", &[mode]));
    match scenario {
        "uninstall" => {
            println!("confirm: {:?}", plugin.call("Show", &["confirm"]));
            let worker = simulate(&["closing", "files", "data", "cleanup", "done"]);
            wait(&mut plugin, worker);
            println!("removed: {:?}", plugin.call("Show", &["removed"]));
        }
        "update" => {
            plugin.call("Show", &["progress"]);
            let worker = simulate(&["closing", "removing", "extracting", "placing", "finishing", "done"]);
            wait(&mut plugin, worker);
            println!("done: {:?}", plugin.call("Show", &["done"]));
        }
        "error" => {
            plugin.set("detail", "Can't modify \"Achievement Watcher Next\"'s files.");
            println!("error: {:?}", plugin.call("Show", &["error"]));
        }
        _ => {
            println!("welcome: {:?}", plugin.call("Show", &["welcome"]));
            println!("dir={:?} desktop={:?} allusers={:?}", plugin.call("Get", &["dir"]), plugin.call("Get", &["desktop"]), plugin.call("Get", &["allusers"]));
            let worker = simulate(&["closing", "removing", "extracting", "placing", "finishing", "done"]);
            wait(&mut plugin, worker);
            println!("done: {:?}", plugin.call("Show", &["done"]));
        }
    }
    plugin.call("Close", &[]);
}
