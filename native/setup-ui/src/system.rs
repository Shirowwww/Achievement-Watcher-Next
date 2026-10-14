//! What the window asks of Windows: the folder picker, folder checks, running copies of the app,
//! the size of the user data, the clipboard and opening links.

use std::ffi::c_void;
use std::fs;
use std::path::{Path, PathBuf};

use windows::Win32::Foundation::{CloseHandle, HANDLE, HWND};
use windows::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;
use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, CoCreateInstance, CoTaskMemFree};
use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock};
use windows::Win32::System::ProcessStatus::K32EnumProcesses;
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE, QueryFullProcessImageNameW, TerminateProcess,
};
use windows::Win32::UI::Shell::{
    FOS_FORCEFILESYSTEM, FOS_PATHMUSTEXIST, FOS_PICKFOLDERS, FileOpenDialog, IFileOpenDialog, IShellItem, SHCreateItemFromParsingName,
    SIGDN_FILESYSPATH, ShellExecuteW,
};
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
use windows::core::{HSTRING, PCWSTR, PWSTR, w};

/// Appends `app_folder` (the name every install ends in) unless the chosen path already ends with
/// it. Picking "D:\Games" must not install into D:\Games itself: the uninstaller removes the whole
/// installation folder. The installer script appends the same name (AwKeepAppFolder).
pub fn with_app_folder(chosen: &str, app_folder: &str) -> String {
    let trimmed = chosen.trim_end_matches(['\\', '/']);
    let last = Path::new(trimmed).file_name().map(|name| name.to_string_lossy().to_lowercase());
    if last.as_deref() == Some(&app_folder.to_lowercase()) {
        trimmed.to_owned()
    } else {
        format!("{trimmed}\\{app_folder}")
    }
}

/// The folder picker, opened on the parent of the current choice. None when cancelled.
pub fn pick_folder(owner: HWND, title: &str, current: &str) -> Option<String> {
    unsafe {
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER).ok()?;
        let options = dialog.GetOptions().ok()?;
        dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST).ok()?;
        let _ = dialog.SetTitle(&HSTRING::from(title));
        if let Some(start) = nearest_existing(Path::new(current)) {
            if let Ok(item) = SHCreateItemFromParsingName::<_, _, IShellItem>(&HSTRING::from(start.as_os_str()), None) {
                let _ = dialog.SetFolder(&item);
            }
        }
        dialog.Show(Some(owner)).ok()?;
        let item = dialog.GetResult().ok()?;
        let raw: PWSTR = item.GetDisplayName(SIGDN_FILESYSPATH).ok()?;
        let path = raw.to_string().ok();
        CoTaskMemFree(Some(raw.0 as *const c_void));
        path
    }
}

fn nearest_existing(path: &Path) -> Option<PathBuf> {
    path.ancestors().find(|candidate| candidate.is_dir()).map(Path::to_path_buf)
}

/// Whether this process can create files in `dir`. Creates what is missing, then removes what it
/// created, so a test leaves no trace.
pub fn can_write(dir: &str) -> bool {
    let path = Path::new(dir);
    let created: Vec<PathBuf> = path.ancestors().take_while(|ancestor| !ancestor.exists()).map(Path::to_path_buf).collect();
    if fs::create_dir_all(path).is_err() {
        return false;
    }
    let probe = path.join(".aw-write-test");
    let writable = fs::write(&probe, b"").is_ok();
    let _ = fs::remove_file(&probe);
    for folder in created {
        let _ = fs::remove_dir(folder);
    }
    writable
}

/// Free bytes on the drive of `dir`, and the drive's name ("C:").
pub fn free_space(dir: &str) -> Option<(u64, String)> {
    let existing = nearest_existing(Path::new(dir))?;
    let mut free = 0u64;
    unsafe { GetDiskFreeSpaceExW(&HSTRING::from(existing.as_os_str()), Some(&mut free), None, None).ok()? };
    let drive: String = dir.chars().take(2).collect();
    Some((free, drive))
}

/// True when a process started from inside `dir` is running: the app, its Watchdog (the same
/// executable) or a native helper. Mirrors customCheckAppRunning in build/installer.nsh.
pub fn app_running(dir: &str) -> bool {
    !processes_in(dir).is_empty()
}

/// Rounds of "end them all, wait, look again". Processes go one at a time, so the app can start a
/// GPU or renderer process again before its own turn comes.
const CLOSE_ROUNDS: u32 = 12;
const CLOSE_WAIT: std::time::Duration = std::time::Duration::from_millis(500);

/// Ends every process started from inside `dir` and returns how many are still alive afterwards
/// (most likely an elevated copy, out of an unelevated installer's reach).
pub fn close_app(dir: &str) -> usize {
    for _ in 0..CLOSE_ROUNDS {
        let running = processes_in(dir);
        if running.is_empty() {
            return 0;
        }
        for id in running {
            unsafe {
                if let Ok(handle) = OpenProcess(PROCESS_TERMINATE, false, id) {
                    let _ = TerminateProcess(handle, 1);
                    let _ = CloseHandle(handle);
                }
            }
        }
        std::thread::sleep(CLOSE_WAIT);
    }
    processes_in(dir).len()
}

fn processes_in(dir: &str) -> Vec<u32> {
    if dir.is_empty() {
        return Vec::new();
    }
    let prefix = format!("{}\\", dir.trim_end_matches('\\').to_lowercase());
    let own = std::process::id();
    let mut ids = vec![0u32; 4096];
    let mut used = 0u32;
    let listed = unsafe { K32EnumProcesses(ids.as_mut_ptr(), (ids.len() * 4) as u32, &mut used) };
    if !listed.as_bool() {
        return Vec::new();
    }
    ids.truncate(used as usize / 4);
    ids.into_iter()
        .filter(|&id| id != own && process_path(id).is_some_and(|path| path.to_lowercase().starts_with(&prefix)))
        .collect()
}

fn process_path(id: u32) -> Option<String> {
    unsafe {
        let handle: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, id).ok()?;
        let mut buffer = vec![0u16; 1024];
        let mut length = buffer.len() as u32;
        let read = QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buffer.as_mut_ptr()), &mut length);
        let _ = CloseHandle(handle);
        read.ok()?;
        Some(String::from_utf16_lossy(&buffer[..length as usize]))
    }
}

/// What deleting the folders frees; missing folders count as empty. AW Next keeps identical restore
/// points and theme pictures as hard links to one copy, so a file is counted once whatever the
/// number of its names: adding up names reported twice the real size on one profile.
pub fn folder_size(folders: &[String]) -> u64 {
    let mut seen = std::collections::HashSet::new();
    folders
        .iter()
        .flat_map(|folder| list_tree(Path::new(folder)).0)
        .map(|file| match file_identity(&file) {
            Some((id, length)) => {
                if seen.insert(id) {
                    length
                } else {
                    0
                }
            }
            None => fs::metadata(&file).map(|meta| meta.len()).unwrap_or(0),
        })
        .sum()
}

/// The volume and file index that every name of a file shares, and its length.
fn file_identity(file: &Path) -> Option<((u32, u64), u64)> {
    use std::os::windows::fs::OpenOptionsExt;
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Storage::FileSystem::{BY_HANDLE_FILE_INFORMATION, GetFileInformationByHandle};

    // No access right is needed to read a file's identity, so a file held open elsewhere still has one.
    let opened = fs::OpenOptions::new().access_mode(0).share_mode(7).open(file).ok()?;
    let mut info = BY_HANDLE_FILE_INFORMATION::default();
    unsafe { GetFileInformationByHandle(HANDLE(opened.as_raw_handle()), &mut info).ok()? };
    let index = (u64::from(info.nFileIndexHigh) << 32) | u64::from(info.nFileIndexLow);
    let length = (u64::from(info.nFileSizeHigh) << 32) | u64::from(info.nFileSizeLow);
    Some(((info.dwVolumeSerialNumber, index), length))
}

/// Threads deleting files at once; deletion is bound by the file system, not the CPU.
const REMOVE_THREADS: usize = 8;

/// Removes `dir` and everything in it, calling `progress(done, total)` as files go.
///
/// The folder is first renamed to a hidden sibling. That rename fails at once when a file inside is
/// in use, so with `atomic` nothing is touched and the error names the folder (an update must not
/// leave half an installation behind). Without it, the files are deleted in place instead, as far
/// as they can be. The renamed tree is then deleted on several threads.
pub fn remove_tree(dir: &str, atomic: bool, progress: impl Fn(u64, u64) + Sync) -> Result<(), String> {
    let original = Path::new(dir);
    if !original.exists() {
        return Ok(());
    }
    let name = original.file_name().map(|name| name.to_string_lossy().into_owned()).unwrap_or_default();
    let doomed = original.with_file_name(format!(".{name}.removing-{}", std::process::id()));
    let target = match fs::rename(original, &doomed) {
        Ok(()) => doomed,
        Err(error) if atomic => return Err(format!("{dir}: {error}")),
        Err(_) => original.to_path_buf(),
    };
    let (files, folders) = list_tree(&target);
    let total = files.len() as u64;
    let next = std::sync::atomic::AtomicUsize::new(0);
    let done = std::sync::atomic::AtomicU64::new(0);
    std::thread::scope(|scope| {
        for _ in 0..REMOVE_THREADS.min(files.len().max(1)) {
            scope.spawn(|| {
                while let Some(file) = files.get(next.fetch_add(1, std::sync::atomic::Ordering::Relaxed)) {
                    remove_file(file);
                    let count = done.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
                    if count % 32 == 0 || count == total {
                        progress(count, total);
                    }
                }
            });
        }
    });
    for folder in folders.iter().rev() {
        let _ = fs::remove_dir(folder);
    }
    let _ = fs::remove_dir(&target);
    Ok(())
}

/// Every file under `root`, and every folder in an order where parents come before children.
pub(crate) fn list_tree(root: &Path) -> (Vec<PathBuf>, Vec<PathBuf>) {
    let mut files = Vec::new();
    let mut folders = Vec::new();
    let mut pending = vec![root.to_path_buf()];
    while let Some(folder) = pending.pop() {
        let Ok(entries) = fs::read_dir(&folder) else { continue };
        for entry in entries.flatten() {
            match entry.file_type() {
                Ok(kind) if kind.is_dir() && !kind.is_symlink() => {
                    folders.push(entry.path());
                    pending.push(entry.path());
                }
                _ => files.push(entry.path()),
            }
        }
    }
    (files, folders)
}

/// A read-only file refuses deletion until its attribute is cleared.
fn remove_file(file: &Path) {
    if fs::remove_file(file).is_ok() {
        return;
    }
    if let Ok(meta) = fs::symlink_metadata(file) {
        let mut permissions = meta.permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        permissions.set_readonly(false);
        let _ = fs::set_permissions(file, permissions);
        let _ = fs::remove_file(file);
    }
}

const CF_UNICODETEXT: u32 = 13;

pub fn copy_text(owner: HWND, text: &str) -> bool {
    let wide: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
    unsafe {
        if OpenClipboard(Some(owner)).is_err() {
            return false;
        }
        let copied = (|| {
            EmptyClipboard().ok()?;
            let memory = GlobalAlloc(GMEM_MOVEABLE, wide.len() * 2).ok()?;
            let target = GlobalLock(memory) as *mut u16;
            if target.is_null() {
                return None;
            }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), target, wide.len());
            let _ = GlobalUnlock(memory);
            SetClipboardData(CF_UNICODETEXT, Some(HANDLE(memory.0))).ok()
        })()
        .is_some();
        let _ = CloseClipboard();
        copied
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::windows::fs::OpenOptionsExt;

    fn sample_tree(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!("aw-setup-ui-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("resources").join("app")).unwrap();
        for index in 0..50 {
            fs::write(root.join("resources").join("app").join(format!("{index}.js")), b"x").unwrap();
        }
        fs::write(root.join("app.exe"), b"exe").unwrap();
        root
    }

    #[test]
    fn removes_the_whole_tree_and_reports_every_file() {
        let root = sample_tree("whole");
        let last = std::sync::Mutex::new((0, 0));
        remove_tree(root.to_str().unwrap(), true, |done, total| *last.lock().unwrap() = (done, total)).unwrap();
        assert!(!root.exists());
        assert_eq!(*last.lock().unwrap(), (51, 51));
    }

    #[test]
    fn an_atomic_removal_touches_nothing_while_a_file_is_in_use() {
        let root = sample_tree("busy");
        let held = fs::OpenOptions::new().read(true).share_mode(0).open(root.join("app.exe")).unwrap();
        let result = remove_tree(root.to_str().unwrap(), true, |_, _| {});
        assert!(result.is_err());
        assert!(root.join("resources").join("app").join("0.js").exists());
        drop(held);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_file_with_several_names_is_counted_once() {
        let root = sample_tree("links");
        let data = root.join("backups");
        fs::create_dir_all(data.join("a")).unwrap();
        fs::create_dir_all(data.join("b")).unwrap();
        fs::write(data.join("a").join("steam_api64.dll"), vec![7u8; 4096]).unwrap();
        fs::hard_link(data.join("a").join("steam_api64.dll"), data.join("b").join("steam_api64.dll")).unwrap();

        assert_eq!(folder_size(&[data.to_string_lossy().into_owned()]), 4096);
        // The same file reached through two folders is still one file.
        let both = [data.join("a").to_string_lossy().into_owned(), data.join("b").to_string_lossy().into_owned()];
        assert_eq!(folder_size(&both), 4096);
        assert_eq!(folder_size(&["C:\\does-not-exist-aw-setup-ui".to_owned()]), 0);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn the_app_folder_is_appended_unless_already_there() {
        let folder = "Achievement Watcher";
        assert_eq!(with_app_folder("D:\\Games", folder), "D:\\Games\\Achievement Watcher");
        assert_eq!(with_app_folder("D:\\Games\\achievement watcher\\", folder), "D:\\Games\\achievement watcher");
        assert_eq!(with_app_folder("D:\\Games", "AW Update Probe"), "D:\\Games\\AW Update Probe");
    }
}

pub fn open(owner: HWND, target: &str) {
    unsafe {
        ShellExecuteW(Some(owner), w!("open"), &HSTRING::from(target), PCWSTR::null(), PCWSTR::null(), SW_SHOWNORMAL);
    }
}
