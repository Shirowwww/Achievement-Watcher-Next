// Keeps the game's last seconds encoded in memory and writes the stretch around an unlock to MP4.
// The line protocol with the Watchdog is described in native/hdr-screenshot/README.md.
mod audio;
mod mux;
mod ring;
mod video;

use std::io::{BufRead, Write};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::time::{Duration, Instant};

use windows::Win32::Foundation::{FILETIME, HANDLE};
use windows::Win32::Media::MediaFoundation::*;
use windows::Win32::System::Com::{COINIT_MULTITHREADED, CoInitializeEx};
use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};
use windows::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
use windows::Win32::System::Threading::{GetCurrentProcess, GetProcessTimes};
use windows::Win32::UI::HiDpi::{DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext};

use ring::{Ring, SECOND, Schedule};

// Encoder and audio buffering: a clip is cut this long after its end so its last frames are out.
const SETTLE: i64 = SECOND * 7 / 10;
const LONGEST_CLIP: i64 = 60 * SECOND;
const RING_CAP_BYTES: usize = 512 * 1024 * 1024;

// Force exists for testing the tone-mapping pass on an SDR desktop.
#[derive(Clone, Copy, PartialEq)]
pub enum HdrMode {
    Off,
    Auto,
    Force,
}

#[derive(Clone, Copy, PartialEq)]
pub enum AudioSource {
    Game,
    All,
    Off,
}

pub struct Config {
    pub pid: u32,
    pub codec: String,
    pub height: u32,
    pub fps: u32,
    pub quality: String,
    pub before: i64,
    pub after: i64,
    pub audio: AudioSource,
    pub hdr: HdrMode,
    pub selftest: Option<(String, u64)>,
}

pub struct Shared {
    pub ring: Mutex<Ring>,
    pub video_type: Mutex<Option<Vec<u8>>>,
    pub audio_type: Mutex<Option<Vec<u8>>>,
    pub stop: AtomicBool,
    pub encoded: AtomicU64,
    pub dropped: AtomicU64,
}

pub fn emit(line: &str) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{line}");
    let _ = out.flush();
}

pub fn log(text: &str) {
    emit(&format!("log {text}"));
}

// Performance-counter time in 100 ns units, the clock of both the desktop and the audio engine.
pub fn now() -> i64 {
    let (mut counter, mut frequency) = (0i64, 1i64);
    unsafe {
        let _ = QueryPerformanceCounter(&mut counter);
        let _ = QueryPerformanceFrequency(&mut frequency);
    }
    (counter as i128 * SECOND as i128 / frequency as i128) as i64
}

pub fn type_blob(media_type: &IMFMediaType) -> windows::core::Result<Vec<u8>> {
    unsafe {
        let size = MFGetAttributesAsBlobSize(media_type)?;
        let mut blob = vec![0u8; size as usize];
        MFGetAttributesAsBlob(media_type, &mut blob)?;
        Ok(blob)
    }
}

fn parse_args() -> Result<Config, String> {
    let mut config = Config {
        pid: 0,
        codec: "h264".into(),
        height: 1080,
        fps: 30,
        quality: "medium".into(),
        before: 10 * SECOND,
        after: 10 * SECOND,
        audio: AudioSource::Game,
        hdr: HdrMode::Auto,
        selftest: None,
    };
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        let value = args.get(i + 1).cloned().unwrap_or_default();
        let number = || value.parse::<u64>().map_err(|_| format!("{} needs a number", args[i]));
        match args[i].as_str() {
            "--pid" => config.pid = number()? as u32,
            "--codec" => config.codec = value.clone(),
            "--height" => config.height = number()? as u32,
            "--fps" => config.fps = (number()? as u32).clamp(1, 120),
            "--quality" => config.quality = value.clone(),
            "--before" => config.before = number()? as i64 * SECOND / 1000,
            "--after" => config.after = number()? as i64 * SECOND / 1000,
            "--audio" => {
                config.audio = match value.as_str() {
                    "all" => AudioSource::All,
                    "off" => AudioSource::Off,
                    _ => AudioSource::Game,
                }
            }
            "--hdr" => {
                config.hdr = match value.as_str() {
                    "off" => HdrMode::Off,
                    "force" => HdrMode::Force,
                    _ => HdrMode::Auto,
                }
            }
            "--selftest" => {
                let seconds = args.get(i + 2).and_then(|s| s.parse().ok()).unwrap_or(10);
                config.selftest = Some((value.clone(), seconds));
                i += 1;
            }
            other => return Err(format!("unknown argument {other}")),
        }
        i += 2;
    }
    Ok(config)
}

enum Command {
    Clip { age: i64, path: String },
    Quit,
}

fn read_commands(sender: mpsc::Sender<Command>) {
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let mut parts = line.trim().splitn(3, ' ');
        match (parts.next(), parts.next(), parts.next()) {
            (Some("clip"), Some(age), Some(path)) => {
                let age = age.parse::<i64>().unwrap_or(0).max(0) * SECOND / 1000;
                let _ = sender.send(Command::Clip { age, path: path.to_string() });
            }
            (Some("quit"), _, _) => break,
            _ => log(&format!("ignored command: {line}")),
        }
    }
    // A closed pipe means the Watchdog is gone: finish what is pending and leave.
    let _ = sender.send(Command::Quit);
}

fn save(job: &ring::Job, shared: &Shared, frame: i64) {
    let clip = shared.ring.lock().unwrap().select(job.start, job.end);
    let video_type = shared.video_type.lock().unwrap().clone();
    let audio_type = shared.audio_type.lock().unwrap().clone();
    match (clip, video_type) {
        (Some(clip), Some(video_type)) if !clip.video.is_empty() => match mux::write(&job.path, &clip, &video_type, audio_type.as_deref(), frame) {
            Ok(()) => emit(&format!("saved {}", job.path)),
            Err(detail) => emit(&format!("error write-failed {detail}")),
        },
        _ => emit("error nothing-recorded the capture had no frames for this unlock"),
    }
}

fn filetime(value: FILETIME) -> i64 {
    ((value.dwHighDateTime as i64) << 32) | value.dwLowDateTime as i64
}

fn stats(shared: &Shared, started: Instant) {
    let (mut created, mut exited, mut kernel, mut user) = (FILETIME::default(), FILETIME::default(), FILETIME::default(), FILETIME::default());
    let mut memory = PROCESS_MEMORY_COUNTERS::default();
    unsafe {
        let process: HANDLE = GetCurrentProcess();
        let _ = GetProcessTimes(process, &mut created, &mut exited, &mut kernel, &mut user);
        let _ = K32GetProcessMemoryInfo(process, &mut memory, size_of::<PROCESS_MEMORY_COUNTERS>() as u32);
    }
    let wall = started.elapsed().as_secs_f64();
    let cpu = (filetime(kernel) + filetime(user)) as f64 / SECOND as f64;
    let threads = std::thread::available_parallelism().map_or(1, |n| n.get()) as f64;
    emit(&format!(
        "stats seconds={wall:.0} encoded={} dropped={} cpu={:.2}% peak-memory={}MB",
        shared.encoded.load(Ordering::Relaxed),
        shared.dropped.load(Ordering::Relaxed),
        cpu / wall.max(0.001) / threads * 100.0,
        memory.PeakWorkingSetSize / (1024 * 1024)
    ));
}

fn main() {
    let config = match parse_args() {
        Ok(config) => Arc::new(config),
        Err(detail) => {
            emit(&format!("error bad-arguments {detail}"));
            std::process::exit(2);
        }
    };
    unsafe {
        // Desktop duplication of an HDR or scaled display refuses a process that is not DPI aware.
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        if let Err(error) = MFStartup(MF_VERSION, MFSTARTUP_FULL) {
            emit(&format!("error no-media-foundation {}", error.message()));
            std::process::exit(3);
        }
    }
    let started = Instant::now();
    let shared = Arc::new(Shared {
        ring: Mutex::new(Ring::new(config.before + config.after + 2 * SECOND, RING_CAP_BYTES)),
        video_type: Mutex::new(None),
        audio_type: Mutex::new(None),
        stop: AtomicBool::new(false),
        encoded: AtomicU64::new(0),
        dropped: AtomicU64::new(0),
    });

    let mut workers = Vec::new();
    for job in [video::run as fn(&Config, &Shared), audio::run] {
        let (config, shared) = (Arc::clone(&config), Arc::clone(&shared));
        workers.push(std::thread::spawn(move || {
            unsafe {
                let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            }
            job(&config, &shared);
        }));
    }
    let (sender, commands) = mpsc::channel();
    if config.selftest.is_none() {
        std::thread::spawn(move || read_commands(sender));
    }

    let frame = SECOND / config.fps as i64;
    let mut schedule = Schedule::new(LONGEST_CLIP);
    let mut quitting: Option<Instant> = None;
    loop {
        match commands.recv_timeout(Duration::from_millis(100)) {
            Ok(Command::Clip { age, path }) => {
                if let Some(joined) = schedule.add(now() - age, config.before, config.after, path) {
                    emit(&format!("merged {joined}"));
                }
            }
            Ok(Command::Quit) => {
                quitting.get_or_insert_with(Instant::now);
            }
            Err(_) => {}
        }
        if let Some((path, seconds)) = &config.selftest {
            if quitting.is_none() && started.elapsed() >= Duration::from_secs(*seconds) {
                schedule.add(now(), *seconds as i64 * SECOND, 0, path.clone());
                quitting = Some(Instant::now());
            }
        }
        while let Some(job) = schedule.take_due(now() - SETTLE) {
            save(&job, &shared, frame);
        }
        let capture_gone = shared.stop.load(Ordering::Relaxed);
        if let Some(since) = quitting {
            let patience = Duration::from_nanos(((config.after + LONGEST_CLIP) * 100) as u64);
            if schedule.is_empty() || since.elapsed() > patience || capture_gone {
                break;
            }
        } else if capture_gone {
            break;
        }
    }
    shared.stop.store(true, Ordering::Relaxed);
    for worker in workers {
        let _ = worker.join();
    }
    stats(&shared, started);
    unsafe {
        let _ = MFShutdown();
    }
}
