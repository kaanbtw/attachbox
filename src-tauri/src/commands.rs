use crate::clipboard;
use crate::errors::AppError;
use crate::media::MediaManager;
use crate::models::{AppSettings, MediaItem};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};

pub type ManagedMedia = Mutex<MediaManager>;
pub type ManagedSettings = Mutex<AppSettings>;
pub type ManagedItems = Mutex<Vec<MediaItem>>;

#[tauri::command]
pub fn get_all_media(items: State<'_, ManagedItems>) -> Vec<MediaItem> {
    items.lock().unwrap().clone()
}

/// Scan the storage folder and refresh the in-memory items list.
#[tauri::command]
pub fn scan_media(
    media_mgr: State<'_, ManagedMedia>,
    items: State<'_, ManagedItems>,
) -> Result<Vec<MediaItem>, AppError> {
    let mgr = media_mgr.lock().unwrap();
    let scanned = mgr.scan_folder()?;
    let mut store = items.lock().unwrap();
    *store = scanned.clone();
    Ok(scanned)
}

#[tauri::command]
pub fn import_files(
    paths: Vec<String>,
    media_mgr: State<'_, ManagedMedia>,
    items: State<'_, ManagedItems>,
) -> Result<Vec<MediaItem>, AppError> {
    let mgr = media_mgr.lock().unwrap();
    let mut imported = Vec::new();

    for path_str in &paths {
        let path = PathBuf::from(path_str);
        if !path.exists() {
            continue;
        }
        match mgr.import_file(&path) {
            Ok(item) => {
                imported.push(item);
            }
            Err(e) => {
                eprintln!("Failed to import {}: {}", path_str, e);
            }
        }
    }

    // Re-scan folder to get the up-to-date list
    let scanned = mgr.scan_folder()?;
    let mut store = items.lock().unwrap();
    *store = scanned;

    Ok(imported)
}

#[tauri::command]
pub fn delete_media(
    id: String,
    media_mgr: State<'_, ManagedMedia>,
    items: State<'_, ManagedItems>,
) -> Result<(), AppError> {
    let mgr = media_mgr.lock().unwrap();
    let mut store = items.lock().unwrap();

    if let Some(pos) = store.iter().position(|item| item.id == id) {
        let item = store.remove(pos);
        mgr.delete_media(&item.filename)?;
    }

    Ok(())
}

#[tauri::command]
pub fn select_and_paste(
    id: String,
    auto_paste: bool,
    media_mgr: State<'_, ManagedMedia>,
    items: State<'_, ManagedItems>,
    app: tauri::AppHandle,
) -> Result<(), AppError> {
    let mgr = media_mgr.lock().unwrap();
    let store = items.lock().unwrap();

    let item = store
        .iter()
        .find(|i| i.id == id)
        .ok_or_else(|| AppError::NotFound(format!("Media not found: {}", id)))?;

    let abs_path = mgr.get_absolute_path(&item.filename);

    clipboard::copy_file_to_clipboard(&abs_path)?;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    if auto_paste {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            if let Err(e) = clipboard::simulate_paste() {
                eprintln!("Auto-paste failed: {}", e);
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub fn get_settings(settings: State<'_, ManagedSettings>) -> AppSettings {
    settings.lock().unwrap().clone()
}

#[tauri::command]
pub fn update_settings(
    new_settings: AppSettings,
    settings: State<'_, ManagedSettings>,
) -> Result<(), AppError> {
    let mut current = settings.lock().unwrap();
    *current = new_settings;
    Ok(())
}

#[tauri::command]
pub fn get_storage_path(media_mgr: State<'_, ManagedMedia>) -> String {
    let mgr = media_mgr.lock().unwrap();
    mgr.storage_path().to_string_lossy().to_string()
}

#[tauri::command]
pub fn get_media_asset_path(
    filename: String,
    media_mgr: State<'_, ManagedMedia>,
) -> String {
    let mgr = media_mgr.lock().unwrap();
    let path = mgr.get_absolute_path(&filename);
    path.to_string_lossy().to_string()
}

#[tauri::command]
pub fn update_shortcut(key: String, app: tauri::AppHandle) -> Result<(), AppError> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;
    use tauri_plugin_global_shortcut::Shortcut;

    let code = crate::key_name_to_code(&key)
        .ok_or_else(|| AppError::Generic(format!("Unsupported key: {}", key)))?;

    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let shortcut = Shortcut::new(None, code);
    gs.register(shortcut)
        .map_err(|e| AppError::Generic(format!("Failed to register shortcut: {}", e)))?;

    Ok(())
}

/// Change the storage directory. Moves files from old to new, deletes old.
/// Returns the new storage path.
#[tauri::command]
pub fn change_storage_path(
    new_path: String,
    media_mgr: State<'_, ManagedMedia>,
    items: State<'_, ManagedItems>,
    settings: State<'_, ManagedSettings>,
    watched_path: State<'_, crate::WatchedPath>,
    app: tauri::AppHandle,
) -> Result<String, AppError> {
    let new_dir = PathBuf::from(&new_path);

    let mut mgr = media_mgr.lock().unwrap();
    mgr.change_storage_dir(new_dir.clone())?;

    // Re-scan to get updated items
    let scanned = mgr.scan_folder()?;
    let mut store = items.lock().unwrap();
    *store = scanned;

    // Update settings
    let final_path = mgr.storage_path().to_string_lossy().to_string();
    {
        let mut s = settings.lock().unwrap();
        s.storage_path = final_path.clone();
    }

    // Update the file watcher's watched directory
    {
        let mut wp = watched_path.lock().unwrap();
        *wp = new_dir;
    }

    let _ = app.emit("storage-changed", &final_path);

    Ok(final_path)
}
