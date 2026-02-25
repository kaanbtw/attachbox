use crate::clipboard;
use crate::errors::AppError;
use crate::media::{has_audio_stream, MediaManager};
use crate::models::{AppSettings, MediaItem};
use ffmpeg_sidecar::command::FfmpegCommand;
use ffmpeg_sidecar::download::auto_download;
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
pub async fn download_from_url(url: String) -> Result<String, AppError> {
    let response = reqwest::get(&url)
        .await
        .map_err(|e| AppError::Generic(format!("Download failed: {}", e)))?;

    // Guess extension
    let url_without_query = url.split('?').next().unwrap_or("");
    let url_path = std::path::Path::new(url_without_query);
    let mut ext = url_path
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    if ext.is_empty() {
        if let Some(ct) = response.headers().get(reqwest::header::CONTENT_TYPE) {
            let ct_str = ct.to_str().unwrap_or("");
            ext = match ct_str {
                "image/jpeg" => "jpg".to_string(),
                "image/png" => "png".to_string(),
                "image/gif" => "gif".to_string(),
                "image/webp" => "webp".to_string(),
                "video/mp4" => "mp4".to_string(),
                _ => "bin".to_string(),
            };
        }
    }

    let temp_dir = std::env::temp_dir();
    let temp_file_name = format!("download-{}.{}", uuid::Uuid::new_v4(), ext);
    let mut temp_path = temp_dir.join(&temp_file_name);

    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::Generic(format!("Read failed: {}", e)))?;
    std::fs::write(&temp_path, bytes).map_err(|e| AppError::Generic(format!("Write failed: {}", e)))?;

    let final_ext = ext;
    
    // Check if it's a video. If it's a silent MP4, convert it to a robust generic GIF
    if final_ext == "mp4" || final_ext == "webm" {
        if !has_audio_stream(&temp_path) {
            let gif_file_name = format!("download-{}.gif", uuid::Uuid::new_v4());
            let gif_path = temp_dir.join(&gif_file_name);
            
            // Auto install ffmpeg binaries to the user's OS without any prompts
            if auto_download().is_ok() {
               let command = FfmpegCommand::new()
                   .input(&temp_path.to_string_lossy().to_string())
                   .args(&[
                       "-vf",
                       "fps=8,scale=250:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64:stats_mode=single[p];[s1][p]paletteuse=dither=floyd_steinberg:diff_mode=rectangle",
                       "-c:v",
                       "gif",
                       "-loop", 
                       "0"
                   ])
                   .output(&gif_path.to_string_lossy().to_string())
                   .spawn()
                   .map_err(|e| AppError::Generic(format!("GIF execution spawned incorrectly: {}", e)));
                   
               if let Ok(mut c) = command {
                   let _ = c.wait(); // Wait for compression engine to finish
                   if gif_path.exists() {
                       // Replace the standard MP4 download with the beautiful GIF
                       let _ = std::fs::remove_file(&temp_path);
                       temp_path = gif_path;
                   }
               }
            }
        }
    }

    Ok(temp_path.to_string_lossy().to_string())
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

#[tauri::command]
pub fn is_silent_video(path: String) -> bool {
    !crate::media::has_audio_stream(std::path::Path::new(&path))
}
