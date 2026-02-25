use crate::errors::AppError;
use crate::models::{classify_media, is_allowed_extension, is_blocked_extension, MediaItem};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub struct MediaManager {
    storage_dir: PathBuf,
}

impl MediaManager {
    pub fn new(storage_dir: PathBuf) -> Result<Self, AppError> {
        fs::create_dir_all(&storage_dir)?;
        Ok(Self { storage_dir })
    }

    pub fn storage_path(&self) -> &Path {
        &self.storage_dir
    }

    pub fn import_file(&self, source_path: &Path) -> Result<MediaItem, AppError> {
        let extension = source_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        if is_blocked_extension(&extension) {
            return Err(AppError::InvalidFileType(format!(
                "Executable files (.{}) are not allowed",
                extension
            )));
        }

        if !is_allowed_extension(&extension) {
            return Err(AppError::InvalidFileType(format!(
                "Unsupported file type: .{}",
                extension
            )));
        }

        let media_type = classify_media(&extension).ok_or_else(|| {
            AppError::InvalidFileType(format!("Cannot classify file type: .{}", extension))
        })?;

        let original_name = source_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let unique_id = Uuid::new_v4().to_string();
        let dest_filename = format!("{}.{}", unique_id, extension);
        let dest_path = self.storage_dir.join(&dest_filename);

        fs::copy(source_path, &dest_path)?;

        let metadata = fs::metadata(&dest_path)?;
        let created_at = metadata
            .created()
            .unwrap_or(std::time::SystemTime::now())
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Ok(MediaItem {
            id: unique_id,
            filename: dest_filename,
            original_name,
            media_type,
            file_size: metadata.len(),
            created_at,
        })
    }

    pub fn list_media(&self) -> Result<Vec<MediaItem>, AppError> {
        let manifest_path = self.storage_dir.join("manifest.json");
        if !manifest_path.exists() {
            return Ok(Vec::new());
        }
        let content = fs::read_to_string(&manifest_path)?;
        let items: Vec<MediaItem> =
            serde_json::from_str(&content).map_err(|e| AppError::Serialization(e.to_string()))?;
        Ok(items)
    }

    pub fn save_manifest(&self, items: &[MediaItem]) -> Result<(), AppError> {
        let manifest_path = self.storage_dir.join("manifest.json");
        let content =
            serde_json::to_string_pretty(items).map_err(|e| AppError::Serialization(e.to_string()))?;
        fs::write(&manifest_path, content)?;
        Ok(())
    }

    pub fn delete_media(&self, filename: &str) -> Result<(), AppError> {
        let file_path = self.storage_dir.join(filename);
        if file_path.exists() {
            fs::remove_file(&file_path)?;
        }
        Ok(())
    }

    pub fn get_absolute_path(&self, filename: &str) -> PathBuf {
        self.storage_dir.join(filename)
    }
}
