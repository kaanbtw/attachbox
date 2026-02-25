mod clipboard;
mod commands;
mod errors;
mod media;
mod models;

use commands::*;
use media::MediaManager;
use models::AppSettings;
use std::sync::Mutex;
use std::path::PathBuf;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter,
    Manager,
    WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

pub fn key_name_to_code(name: &str) -> Option<Code> {
    match name {
        "End" => Some(Code::End),
        "Home" => Some(Code::Home),
        "Insert" => Some(Code::Insert),
        "Delete" => Some(Code::Delete),
        "PageUp" => Some(Code::PageUp),
        "PageDown" => Some(Code::PageDown),
        "Pause" => Some(Code::Pause),
        "ScrollLock" => Some(Code::ScrollLock),
        "F1" => Some(Code::F1),
        "F2" => Some(Code::F2),
        "F3" => Some(Code::F3),
        "F4" => Some(Code::F4),
        "F5" => Some(Code::F5),
        "F6" => Some(Code::F6),
        "F7" => Some(Code::F7),
        "F8" => Some(Code::F8),
        "F9" => Some(Code::F9),
        "F10" => Some(Code::F10),
        "F11" => Some(Code::F11),
        "F12" => Some(Code::F12),
        "`" | "Backquote" => Some(Code::Backquote),
        "\\" | "Backslash" => Some(Code::Backslash),
        "[" | "BracketLeft" => Some(Code::BracketLeft),
        "]" | "BracketRight" => Some(Code::BracketRight),
        "," | "Comma" => Some(Code::Comma),
        "." | "Period" => Some(Code::Period),
        "/" | "Slash" => Some(Code::Slash),
        ";" | "Semicolon" => Some(Code::Semicolon),
        "'" | "Quote" => Some(Code::Quote),
        "-" | "Minus" => Some(Code::Minus),
        "=" | "Equal" => Some(Code::Equal),
        "NumLock" => Some(Code::NumLock),
        _ => None,
    }
}

fn toggle_window(app: &tauri::AppHandle, source: &str) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            position_window_at_cursor(&window);
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.emit("window-opened", source);
        }
    }
}

fn position_window_at_cursor(window: &tauri::WebviewWindow) {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::POINT;
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromPoint, MONITORINFO,
            MONITOR_DEFAULTTONEAREST,
        };
        use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

        unsafe {
            let mut cursor = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut cursor).is_ok() {
                let hmonitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
                let mut monitor_info = MONITORINFO {
                    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                    ..Default::default()
                };

                let (mon_left, mon_top, mon_right, mon_bottom) =
                    if GetMonitorInfoW(hmonitor, &mut monitor_info).as_bool() {
                        let rc = monitor_info.rcWork;
                        (rc.left, rc.top, rc.right, rc.bottom)
                    } else {
                        (0, 0, 1920, 1080)
                    };

                let win_w = 480i32;
                let win_h = 560i32;

                let mut x = cursor.x - win_w / 2;
                let mut y = cursor.y - win_h + 20;

                if x + win_w > mon_right { x = mon_right - win_w; }
                if y + win_h > mon_bottom { y = mon_bottom - win_h; }
                if x < mon_left { x = mon_left; }
                if y < mon_top { y = mon_top; }

                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = window.center();
    }
}

/// Shared state for the watched directory path, so commands can update it.
pub type WatchedPath = std::sync::Arc<Mutex<PathBuf>>;

/// Start a file system watcher that reads the watch path from shared state.
/// When the path changes (via change_storage_path), the watcher automatically
/// switches to the new directory.
fn start_file_watcher(app_handle: tauri::AppHandle, watched_path: WatchedPath) {
    use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
    use std::sync::mpsc;
    use std::time::Duration;

    std::thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<notify::Result<Event>>();

        let mut watcher: RecommendedWatcher = match Watcher::new(
            tx,
            notify::Config::default().with_poll_interval(Duration::from_secs(2)),
        ) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("Failed to create file watcher: {}", e);
                return;
            }
        };

        let mut current_dir = {
            let p = watched_path.lock().unwrap();
            p.clone()
        };

        let _ = watcher.watch(&current_dir, RecursiveMode::NonRecursive);

        let mut last_emit = std::time::Instant::now();
        let debounce_dur = Duration::from_millis(500);

        loop {
            // Check if the watched path has changed
            {
                let new_dir = watched_path.lock().unwrap().clone();
                if new_dir != current_dir {
                    let _ = watcher.unwatch(&current_dir);
                    if let Err(e) = watcher.watch(&new_dir, RecursiveMode::NonRecursive) {
                        eprintln!("Failed to watch new directory {:?}: {}", new_dir, e);
                    } else {}
                    current_dir = new_dir;
                }
            }

            match rx.recv_timeout(Duration::from_millis(300)) {
                Ok(Ok(event)) => {
                    match event.kind {
                        EventKind::Create(_)
                        | EventKind::Remove(_)
                        | EventKind::Modify(notify::event::ModifyKind::Name(_)) => {
                            let now = std::time::Instant::now();
                            if now.duration_since(last_emit) > debounce_dur {
                                last_emit = now;
                                let _ = app_handle.emit("media-changed", ());
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Err(_)) => {}
                Err(mpsc::RecvTimeoutError::Timeout) => {}
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    break;
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_window(app, "hotkey");
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .setup(|app| {
            // Determine storage directory
            let app_data = app
                .path()
                .app_local_data_dir()
                .expect("Failed to resolve app local data dir");
            let default_media_dir = app_data.join("media");

            // Load persisted settings from store
            let store = app.store("settings.json")
                .expect("Failed to open settings store");

            let saved_shortcut = store.get("shortcut_key")
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| "End".to_string());

            let saved_auto_paste = store.get("auto_paste_enabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);

            let saved_storage_path = store.get("storage_path")
                .and_then(|v| v.as_str().map(|s| s.to_string()));

            // Use saved storage path if it exists and is valid, otherwise use default
            let media_dir = if let Some(ref saved_path) = saved_storage_path {
                let p = std::path::PathBuf::from(saved_path);
                if p.exists() || std::fs::create_dir_all(&p).is_ok() {
                    p
                } else {
                    default_media_dir
                }
            } else {
                default_media_dir
            };

            // Initialize MediaManager
            let media_mgr =
                MediaManager::new(media_dir.clone()).expect("Failed to initialize media storage");

            // Scan folder for existing media
            let existing_items = media_mgr.scan_folder().unwrap_or_default();

            // Build settings from persisted values
            let settings = AppSettings {
                shortcut_key: saved_shortcut,
                storage_path: media_mgr.storage_path().to_string_lossy().to_string(),
                auto_paste_enabled: saved_auto_paste,
            };

            // Manage state
            app.manage(Mutex::new(media_mgr));
            app.manage(Mutex::new(existing_items));
            app.manage(Mutex::new(settings));

            // --- Register Global Shortcut from settings ---
            let initial_key = {
                let s = app.state::<Mutex<AppSettings>>();
                let guard = s.lock().unwrap();
                guard.shortcut_key.clone()
            };
            let code = key_name_to_code(&initial_key).unwrap_or(Code::End);
            let shortcut = Shortcut::new(None, code);
            app.global_shortcut()
                .register(shortcut)
                .expect("Failed to register global shortcut");

            // --- Start File Watcher ---
            let watched_path: WatchedPath = std::sync::Arc::new(Mutex::new(media_dir));
            app.manage(watched_path.clone());
            start_file_watcher(app.handle().clone(), watched_path);

            // --- System Tray ---
            let show_item = MenuItem::with_id(app, "show", "Show AttachBox", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))
                .expect("Failed to load tray icon");

            TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("AttachBox – Quick Media Board")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        toggle_window(app, "tray");
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle(), "tray");
                    }
                })
                .build(app)?;

            // --- Configure main window ---
            let main_window = app.get_webview_window("main").unwrap();

            let win_clone = main_window.clone();
            main_window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = win_clone.hide();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_all_media,
            import_files,
            download_from_url,
            delete_media,
            select_and_paste,
            get_settings,
            update_settings,
            get_storage_path,
            get_media_asset_path,
            update_shortcut,
            scan_media,
            change_storage_path,
            is_silent_video,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
