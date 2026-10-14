//! Windows' executable compression (WOF, what CompactOS applies to the system files) on the files
//! setup has just placed. Measured on 3.11.3: 408 MB on disk becomes 211 MB, read back
//! transparently; an uncached read of the whole 235 MB executable goes from 90 ms to about 150 ms.
//!
//! It asks the file system directly instead of running compact.exe: setup starts no process,
//! because sandboxes score an installer that does. The Watchdog runs the same request after each
//! start (watchdog/util/installCompression.js), which covers the portable archive and any file that
//! was busy here.

use std::ffi::c_void;
use std::path::Path;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

use windows::Win32::Foundation::{CloseHandle, GENERIC_READ};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAGS_AND_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, GetCompressedFileSizeW,
    INVALID_FILE_SIZE, OPEN_EXISTING,
};
use windows::Win32::System::IO::DeviceIoControl;
use windows::core::HSTRING;

const FSCTL_SET_EXTERNAL_BACKING: u32 = 0x9030c;
/// WOF_EXTERNAL_INFO { version 1, WOF_PROVIDER_FILE } then FILE_PROVIDER_EXTERNAL_INFO_V1
/// { version 1, XPRESS16K, no flags }. XPRESS16K rather than LZX: LZX saves 44 MB more but takes
/// seven times longer, on every update.
const REQUEST: [u32; 5] = [1, 2, 1, 3, 0];
/// A smaller file takes one cluster compressed or not.
const MIN_BYTES: u64 = 8192;
/// XPRESS16K is bound by the CPU, so the files are spread over several threads.
const THREADS: usize = 8;

/// Compresses the files under `dir` and returns the bytes the folder then takes on disk. On a
/// volume without WOF (FAT32, exFAT, some network shares) nothing changes and the result is the
/// files' length.
pub fn compress_tree(dir: &str) -> u64 {
    let files = crate::system::list_tree(Path::new(dir)).0;
    let next = AtomicUsize::new(0);
    let on_disk = AtomicU64::new(0);
    std::thread::scope(|scope| {
        for _ in 0..THREADS.min(files.len().max(1)) {
            scope.spawn(|| {
                while let Some(file) = files.get(next.fetch_add(1, Ordering::Relaxed)) {
                    on_disk.fetch_add(compress_file(file), Ordering::Relaxed);
                }
            });
        }
    });
    on_disk.load(Ordering::Relaxed)
}

/// Compresses one file when it is worth it, and returns what it takes on disk afterwards.
fn compress_file(file: &Path) -> u64 {
    let length = std::fs::metadata(file).map(|meta| meta.len()).unwrap_or(0);
    if length >= MIN_BYTES {
        request_compression(file);
    }
    size_on_disk(file).unwrap_or(length)
}

fn request_compression(file: &Path) {
    let share = FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE;
    unsafe {
        let Ok(handle) = CreateFileW(&HSTRING::from(file.as_os_str()), GENERIC_READ.0, share, None, OPEN_EXISTING, FILE_FLAGS_AND_ATTRIBUTES(0), None)
        else {
            return;
        };
        let mut returned = 0u32;
        // A refusal (a file that would not shrink, a volume without WOF) leaves the file as it was.
        let _ = DeviceIoControl(
            handle,
            FSCTL_SET_EXTERNAL_BACKING,
            Some(REQUEST.as_ptr() as *const c_void),
            size_of_val(&REQUEST) as u32,
            None,
            0,
            Some(&mut returned),
            None,
        );
        let _ = CloseHandle(handle);
    }
}

fn size_on_disk(file: &Path) -> Option<u64> {
    let mut high = 0u32;
    let low = unsafe { GetCompressedFileSizeW(&HSTRING::from(file.as_os_str()), Some(&mut high)) };
    if low == INVALID_FILE_SIZE && high == 0 {
        return None;
    }
    Some((u64::from(high) << 32) | u64::from(low))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn sample(name: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("aw-setup-ui-compress-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("resources")).unwrap();
        root
    }

    #[test]
    fn compressed_files_take_less_room_and_read_back_unchanged() {
        let root = sample("text");
        let text = "Achievement Watcher Next ".repeat(8192);
        for name in ["app.exe", "resources\\app.asar"] {
            fs::write(root.join(name), &text).unwrap();
        }
        fs::write(root.join("tiny.txt"), "x").unwrap();

        let on_disk = compress_tree(root.to_str().unwrap());

        let logical = 2 * text.len() as u64 + 1;
        // A volume without WOF (a FAT32 temp folder) cannot show a gain; it must still report sizes.
        assert!(on_disk <= logical);
        if on_disk < logical {
            assert!(size_on_disk(&root.join("app.exe")).unwrap() < text.len() as u64);
        }
        assert_eq!(fs::read_to_string(root.join("resources\\app.asar")).unwrap(), text);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn a_missing_folder_takes_no_room() {
        assert_eq!(compress_tree("C:\\does-not-exist-aw-setup-ui"), 0);
    }
}
