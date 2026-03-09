use crate::errors::AppError;
use std::path::Path;

/// Copy a file path to the OS clipboard as a "file drop" item.
/// On Windows this uses OLE clipboard with CF_HDROP so that
/// Ctrl+V in Discord/Explorer pastes the actual file.
#[cfg(target_os = "windows")]
pub fn copy_file_to_clipboard(file_path: &Path) -> Result<(), AppError> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    use windows::Win32::Foundation::*;
    use windows::Win32::System::DataExchange::*;
    use windows::Win32::System::Ole::*;
    use windows::Win32::System::Memory::*;

    let path_str = file_path
        .to_str()
        .ok_or_else(|| AppError::Clipboard("Invalid path encoding".into()))?;

    unsafe {
        // DROPFILES struct: 20 bytes header + wide string + double null
        let wide: Vec<u16> = OsStr::new(path_str)
            .encode_wide()
            .chain(std::iter::once(0))
            .chain(std::iter::once(0))
            .collect();

        let header_size = 20u32; // sizeof(DROPFILES)
        let total_size = header_size as usize + wide.len() * 2;

        let hmem = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_size)
            .map_err(|_| AppError::Clipboard("GlobalAlloc failed".into()))?;

        let ptr = GlobalLock(hmem) as *mut u8;
        if ptr.is_null() {
            let _ = GlobalFree(hmem);
            return Err(AppError::Clipboard("GlobalLock failed".into()));
        }

        // Write DROPFILES header
        std::ptr::write(ptr as *mut u32, header_size);
        std::ptr::write((ptr.add(16)) as *mut i32, 1);

        let dest = ptr.add(header_size as usize) as *mut u16;
        std::ptr::copy_nonoverlapping(wide.as_ptr(), dest, wide.len());

        let _ = GlobalUnlock(hmem);

        let _ = OleInitialize(None);

        if OpenClipboard(HWND::default()).is_ok() {
            let _ = EmptyClipboard();
            let cf_hdrop = 15u32; // CF_HDROP
            SetClipboardData(cf_hdrop, HANDLE(hmem.0))
                .map_err(|_| AppError::Clipboard("SetClipboardData failed".into()))?;
            let _ = CloseClipboard();
        } else {
            let _ = GlobalFree(hmem);
            return Err(AppError::Clipboard("Cannot open clipboard".into()));
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn copy_file_to_clipboard(_file_path: &Path) -> Result<(), AppError> {
    Err(AppError::Clipboard(
        "File clipboard not implemented for this platform".into(),
    ))
}

#[cfg(target_os = "windows")]
pub fn copy_text_to_clipboard(text: &str) -> Result<(), AppError> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    use windows::Win32::Foundation::*;
    use windows::Win32::System::DataExchange::*;
    use windows::Win32::System::Memory::*;

    unsafe {
        let wide: Vec<u16> = OsStr::new(text)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let total_size = wide.len() * std::mem::size_of::<u16>();

        let hmem = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, total_size)
            .map_err(|_| AppError::Clipboard("GlobalAlloc failed".into()))?;

        let ptr = GlobalLock(hmem) as *mut u16;
        if ptr.is_null() {
            let _ = GlobalFree(hmem);
            return Err(AppError::Clipboard("GlobalLock failed".into()));
        }

        std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
        let _ = GlobalUnlock(hmem);

        if OpenClipboard(HWND::default()).is_ok() {
            let _ = EmptyClipboard();
            let cf_unicode_text = 13u32; // CF_UNICODETEXT
            SetClipboardData(cf_unicode_text, HANDLE(hmem.0))
                .map_err(|_| AppError::Clipboard("SetClipboardData failed".into()))?;
            let _ = CloseClipboard();
        } else {
            let _ = GlobalFree(hmem);
            return Err(AppError::Clipboard("Cannot open clipboard".into()));
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn copy_text_to_clipboard(_text: &str) -> Result<(), AppError> {
    Err(AppError::Clipboard(
        "Text clipboard not implemented for this platform".into(),
    ))
}

/// Simulate Ctrl+V keystroke using enigo
pub fn simulate_paste() -> Result<(), AppError> {
    use enigo::{Direction, Enigo, Key, Keyboard, Settings};

    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|e| AppError::Clipboard(e.to_string()))?;

    enigo
        .key(Key::Control, Direction::Press)
        .map_err(|e| AppError::Clipboard(e.to_string()))?;
    enigo
        .key(Key::Unicode('v'), Direction::Click)
        .map_err(|e| AppError::Clipboard(e.to_string()))?;
    enigo
        .key(Key::Control, Direction::Release)
        .map_err(|e| AppError::Clipboard(e.to_string()))?;

    Ok(())
}
