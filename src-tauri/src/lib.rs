mod clipboard;
mod commands;
mod errors;
mod media;
mod models;

use commands::*;
use media::MediaManager;
use models::AppSettings;
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter,
    Manager,
    WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

fn toggle_window(app: &tauri::AppHandle, source: &str) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            position_window_at_cursor(&window);
            let _ = window.show();
            let _ = window.set_focus();
            // Tell the frontend how the window was opened
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
                // Get the monitor the cursor is on
                let hmonitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
                let mut monitor_info = MONITORINFO {
                    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                    ..Default::default()
                };

                let (mon_left, mon_top, mon_right, mon_bottom) =
                    if GetMonitorInfoW(hmonitor, &mut monitor_info).as_bool() {
                        let rc = monitor_info.rcWork; // usable area (excludes taskbar)
                        (rc.left, rc.top, rc.right, rc.bottom)
                    } else {
                        (0, 0, 1920, 1080) // fallback
                    };

                let win_w = 480i32;
                let win_h = 560i32;

                // X: center on cursor, Y: bottom edge slightly above cursor
                let mut x = cursor.x - win_w / 2;
                let mut y = cursor.y - win_h + 20; // bottom edge 20px above cursor

                // Clamp so the window stays within the monitor work area
                if x + win_w > mon_right {
                    x = mon_right - win_w;
                }
                if y + win_h > mon_bottom {
                    y = mon_bottom - win_h;
                }
                if x < mon_left {
                    x = mon_left;
                }
                if y < mon_top {
                    y = mon_top;
                }

                let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = window.center();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let end_shortcut = Shortcut::new(None, Code::End);
                        if shortcut == &end_shortcut {
                            toggle_window(app, "hotkey");
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::new().build())
        .setup(|app| {
            // Determine storage directory
            let app_data = app
                .path()
                .app_local_data_dir()
                .expect("Failed to resolve app local data dir");
            let media_dir = app_data.join("media");

            // Initialize MediaManager
            let media_mgr =
                MediaManager::new(media_dir).expect("Failed to initialize media storage");

            // Load existing media items from manifest
            let existing_items = media_mgr.list_media().unwrap_or_default();

            // Load or initialize settings
            let settings = AppSettings {
                storage_path: media_mgr.storage_path().to_string_lossy().to_string(),
                ..AppSettings::default()
            };

            // Manage state
            app.manage(Mutex::new(media_mgr));
            app.manage(Mutex::new(existing_items));
            app.manage(Mutex::new(settings));

            // --- Register Global Shortcut (End key) ---
            let shortcut = Shortcut::new(None, Code::End);
            app.global_shortcut()
                .register(shortcut)
                .expect("Failed to register global shortcut");

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
            delete_media,
            select_and_paste,
            get_settings,
            update_settings,
            get_storage_path,
            get_media_asset_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
