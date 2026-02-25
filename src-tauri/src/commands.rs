use crate::clipboard;
use crate::errors::AppError;
use crate::media::MediaManager;
use crate::models::{AppSettings, MediaItem};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

pub type ManagedMedia = Mutex<MediaManager>;
pub type ManagedSettings = Mutex<AppSettings>;
pub type ManagedItems = Mutex<Vec<MediaItem>>;

#[tauri::command]
pub fn get_all_media(items: State<'_, ManagedItems>) -> Vec<MediaItem> {
    items.lock().unwrap().clone()
}

#[tauri::command]
pub fn import_files(
    paths: Vec<String>,
    media_mgr: State<'_, ManagedMedia>,
    items: State<'_, ManagedItems>,
) -> Result<Vec<MediaItem>, AppError> {
    let mgr = media_mgr.lock().unwrap();
    let mut store = items.lock().unwrap();
    let mut imported = Vec::new();

    for path_str in &paths {
        let path = PathBuf::from(path_str);
        if !path.exists() {
            continue;
        }
        match mgr.import_file(&path) {
            Ok(item) => {
                store.push(item.clone());
                imported.push(item);
            }
            Err(e) => {
                eprintln!("Failed to import {}: {}", path_str, e);
            }
        }
    }

    mgr.save_manifest(&store)?;
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
        mgr.save_manifest(&store)?;
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

    // Hide the window, restore focus, then simulate paste
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }

    if auto_paste {
        // Small delay to let the OS process the window hide and focus switch
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            // Focus will naturally return to the previous window when AttachBox hides
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

    // Unregister all existing shortcuts, then register the new one
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();

    let shortcut = Shortcut::new(None, code);
    gs.register(shortcut)
        .map_err(|e| AppError::Generic(format!("Failed to register shortcut: {}", e)))?;

    Ok(())
}
