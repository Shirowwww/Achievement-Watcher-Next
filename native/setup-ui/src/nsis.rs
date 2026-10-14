//! The NSIS plug-in ABI (Unicode build): the parameter stack, the user variables and the callback
//! that keeps this DLL loaded between calls. Mirrors `Contrib/ExDLL/pluginapi.h` and `api.h`.

use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};

use windows::Win32::Foundation::{GlobalFree, HGLOBAL, HMODULE, HWND};
use windows::Win32::System::LibraryLoader::{
    GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS, GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT, GetModuleHandleExW,
};
use windows::Win32::System::Memory::{GPTR, GlobalAlloc};
use windows::core::PCWSTR;

#[repr(C)]
pub struct StackT {
    next: *mut StackT,
    text: [u16; 1],
}

#[repr(C)]
pub struct ExecFlags {
    autoclose: i32,
    all_user_var: i32,
    exec_error: i32,
    abort: i32,
    exec_reboot: i32,
    reboot_called: i32,
    cur_insttype: i32,
    plugin_api_version: i32,
    pub silent: i32,
    instdir_error: i32,
    rtl: i32,
    errlvl: i32,
    alter_reg_view: i32,
    status_update: i32,
}

type PluginCallback = unsafe extern "C" fn(message: i32) -> usize;

#[repr(C)]
pub struct ExtraParameters {
    pub exec_flags: *mut ExecFlags,
    execute_code_segment: unsafe extern "system" fn(i32, HWND) -> i32,
    validate_filename: unsafe extern "system" fn(*mut u16),
    register_plugin_callback: unsafe extern "system" fn(HMODULE, PluginCallback) -> i32,
}

/// Index of `$LANGUAGE` in the variables block: $0-$9, $R0-$R9, $CMDLINE, $INSTDIR, $OUTDIR,
/// $EXEDIR, then $LANGUAGE.
const VAR_LANGUAGE: usize = 24;

/// One plug-in call: the parent window and the stack NSIS handed over.
pub struct Call {
    pub parent: HWND,
    string_size: usize,
    variables: *mut u16,
    stacktop: *mut *mut StackT,
}

impl Call {
    /// # Safety
    /// The pointers must be the ones NSIS passed to the exported function.
    pub unsafe fn new(parent: HWND, string_size: i32, variables: *mut u16, stacktop: *mut *mut StackT) -> Self {
        Self { parent, string_size: string_size.max(1) as usize, variables, stacktop }
    }

    /// Pops the next parameter; a missing one reads as an empty string.
    pub fn pop(&self) -> String {
        unsafe {
            if self.stacktop.is_null() || (*self.stacktop).is_null() {
                return String::new();
            }
            let top = *self.stacktop;
            let text = (*top).text.as_ptr();
            let value = String::from_utf16_lossy(slice_until_nul(text, self.string_size));
            *self.stacktop = (*top).next;
            let _ = GlobalFree(Some(HGLOBAL(top as *mut c_void)));
            value
        }
    }

    pub fn push(&self, value: &str) {
        unsafe {
            if self.stacktop.is_null() {
                return;
            }
            let bytes = std::mem::size_of::<StackT>() + self.string_size * 2;
            let Ok(memory) = GlobalAlloc(GPTR, bytes) else { return };
            let node = memory.0 as *mut StackT;
            let text = (*node).text.as_mut_ptr();
            for (index, unit) in value.encode_utf16().take(self.string_size - 1).enumerate() {
                *text.add(index) = unit;
            }
            (*node).next = *self.stacktop;
            *self.stacktop = node;
        }
    }

    /// The installer's language id ($LANGUAGE).
    pub fn language(&self) -> u16 {
        if self.variables.is_null() {
            return 0;
        }
        let value = unsafe { slice_until_nul(self.variables.add(VAR_LANGUAGE * self.string_size), self.string_size) };
        String::from_utf16_lossy(value).trim().parse().unwrap_or(0)
    }
}

unsafe fn slice_until_nul<'a>(text: *const u16, max: usize) -> &'a [u16] {
    let mut length = 0;
    while length < max && unsafe { *text.add(length) } != 0 {
        length += 1;
    }
    unsafe { std::slice::from_raw_parts(text, length) }
}

static REGISTERED: AtomicBool = AtomicBool::new(false);

unsafe extern "C" fn on_plugin_message(_message: i32) -> usize {
    0
}

/// NSIS unloads a plug-in after every call unless it registers a callback; the window and its
/// message procedure live in this DLL, so it has to stay mapped for the whole run.
pub fn keep_loaded(extra: *mut ExtraParameters) {
    if extra.is_null() || REGISTERED.swap(true, Ordering::SeqCst) {
        return;
    }
    unsafe { ((*extra).register_plugin_callback)(this_module(), on_plugin_message) };
}

pub fn is_silent(extra: *mut ExtraParameters) -> bool {
    !extra.is_null() && unsafe { !(*extra).exec_flags.is_null() && (*(*extra).exec_flags).silent != 0 }
}

pub fn this_module() -> HMODULE {
    let mut module = HMODULE::default();
    let address = this_module as *const () as *const u16;
    let flags = GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_UNCHANGED_REFCOUNT;
    unsafe {
        let _ = GetModuleHandleExW(flags, PCWSTR(address), &mut module);
    }
    module
}

/// Declares an NSIS export. The body gets the [`Call`]; a panic inside it pushes "error" instead of
/// unwinding into the installer.
#[macro_export]
macro_rules! nsis_export {
    ($name:ident, $body:path) => {
        #[unsafe(no_mangle)]
        pub unsafe extern "C" fn $name(
            parent: ::windows::Win32::Foundation::HWND,
            string_size: i32,
            variables: *mut u16,
            stacktop: *mut *mut $crate::nsis::StackT,
            extra: *mut $crate::nsis::ExtraParameters,
        ) {
            $crate::nsis::keep_loaded(extra);
            let call = unsafe { $crate::nsis::Call::new(parent, string_size, variables, stacktop) };
            let outcome = ::std::panic::catch_unwind(::std::panic::AssertUnwindSafe(|| $body(&call, extra)));
            if outcome.is_err() {
                call.push("error");
            }
        }
    };
}
