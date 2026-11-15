//! A plain message for when QRZero can't start. The Windows build has no console, so without
//! this a log that won't open would close the app with nothing on screen.

use std::path::Path;

/// The text of the message: what went wrong, where the log is, and how to get going again.
pub fn message(error: &dyn std::fmt::Display, data_dir: &Path) -> String {
    let dir = data_dir.display();
    format!(
        "QRZero could not open its log.\n\n{error}\n\n\
         The log is the file qrzero.db in:\n{dir}\n\n\
         Nothing has been deleted. If another copy of QRZero or a program that backs up or \
         scans that folder is using the log, close it and start QRZero again. If the log is \
         damaged, close QRZero and rename qrzero.db (and qrzero.db-wal and qrzero.db-shm, if \
         present) to something else, then copy the newest file from the backups folder:\n\
         {dir}/backups\n\
         to {dir} and name the copy qrzero.db. If the message says the log was made by a newer \
         QRZero, install the newest QRZero."
    )
}

/// Shows `text` in a message box (or the nearest thing on this platform) and returns.
pub fn show(text: &str) {
    eprintln!("QRZero: {text}");
    show_native(text);
}

#[cfg(windows)]
fn show_native(text: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};
    let wide = |s: &str| {
        s.encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<u16>>()
    };
    let (text, title) = (wide(text), wide("QRZero"));
    // SAFETY: both buffers are NUL-terminated UTF-16 that outlive the call; no owner window.
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            title.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(target_os = "macos")]
fn show_native(text: &str) {
    let escaped = text.replace('\\', "\\\\").replace('"', "\\\"");
    let script = format!("display alert \"QRZero\" message \"{escaped}\" as critical");
    let _ = std::process::Command::new("osascript")
        .args(["-e", &script])
        .status();
}

#[cfg(not(any(windows, target_os = "macos")))]
fn show_native(text: &str) {
    // Whichever dialog tool the desktop has; the message is on stderr either way.
    if std::process::Command::new("zenity")
        .args(["--error", "--title=QRZero", "--no-markup", "--text", text])
        .status()
        .is_ok_and(|s| s.success())
    {
        return;
    }
    let _ = std::process::Command::new("kdialog")
        .args(["--title", "QRZero", "--error", text])
        .status();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_names_the_error_and_the_folder() {
        let m = message(&"database is locked", Path::new("/data/QRZero"));
        assert!(m.contains("database is locked"));
        assert!(m.contains("/data/QRZero"));
        assert!(m.contains("backups"));
    }
}
