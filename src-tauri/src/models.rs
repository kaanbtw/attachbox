use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItem {
    pub id: String,
    pub filename: String,
    pub original_name: String,
    pub media_type: MediaType,
    pub file_size: u64,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MediaType {
    Image,
    Gif,
    Video,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub shortcut_key: String,
    pub storage_path: String,
    pub auto_paste_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            shortcut_key: "End".to_string(),
            storage_path: String::new(),
            auto_paste_enabled: true,
        }
    }
}

const ALLOWED_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "mp4", "webm",
];

const BLOCKED_EXTENSIONS: &[&str] = &[
    "exe", "sh", "bat", "cmd", "ps1", "msi", "com", "scr", "pif", "vbs", "js",
    "dll", "sys", "lnk", "url",
];

/// Maximum file size: 100 MB
pub const MAX_FILE_SIZE: u64 = 100 * 1024 * 1024;

pub fn classify_media(extension: &str) -> Option<MediaType> {
    match extension.to_lowercase().as_str() {
        "png" | "jpg" | "jpeg" | "webp" | "bmp" => Some(MediaType::Image),
        "gif" => Some(MediaType::Gif),
        "mp4" | "webm" => Some(MediaType::Video),
        _ => None,
    }
}

pub fn is_allowed_extension(extension: &str) -> bool {
    let lower = extension.to_lowercase();
    ALLOWED_EXTENSIONS.contains(&lower.as_str())
}

pub fn is_blocked_extension(extension: &str) -> bool {
    let lower = extension.to_lowercase();
    BLOCKED_EXTENSIONS.contains(&lower.as_str())
}
