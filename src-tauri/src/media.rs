use crate::errors::AppError;
use crate::models::{classify_media, is_allowed_extension, is_blocked_extension, MediaItem, MediaType, MAX_FILE_SIZE};
use std::fs;
use std::path::{Path, PathBuf};

pub fn has_audio_stream(path: &Path) -> bool {
    let extension = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if extension != "mp4" {
        return true; // Assume videos like .webm have audio for safety unless we parse them too
    }
    
    if let Ok(file) = fs::File::open(path) {
        if let Ok(mp4) = mp4::read_mp4(file) {
            for track in mp4.tracks().values() {
                if let Ok(track_type) = track.track_type() {
                    if track_type == mp4::TrackType::Audio {
                        return true;
                    }
                }
            }
            return false; // No audio track found
        }
    }
    true // Default to true if parsing fails
}

pub struct MediaManager {
    storage_dir: PathBuf,
}

impl MediaManager {
    pub fn new(storage_dir: PathBuf) -> Result<Self, AppError> {
        Ok(Self { storage_dir })
    }

    pub fn ensure_storage_dir(&self) -> Result<(), AppError> {
        fs::create_dir_all(&self.storage_dir)?;
        Ok(())
    }

    pub fn storage_path(&self) -> &Path {
        &self.storage_dir
    }

    /// Scan the storage folder and return all valid media items.
    /// This replaces the manifest-based approach entirely.
    pub fn scan_folder(&self) -> Result<Vec<MediaItem>, AppError> {
        let mut items = Vec::new();

        let entries = fs::read_dir(&self.storage_dir)?;
        for entry in entries {
            let entry = entry?;
            let path = entry.path();

            // Skip directories, symlinks, hidden files, and manifest.json
            if !path.is_file() {
                continue;
            }
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with('.') || name == "manifest.json" {
                    continue;
                }
            }

            // Validate extension
            let extension = match path.extension().and_then(|e| e.to_str()) {
                Some(ext) => ext.to_lowercase(),
                None => continue,
            };

            if is_blocked_extension(&extension) || !is_allowed_extension(&extension) {
                continue;
            }

            let mut media_type = match classify_media(&extension) {
                Some(mt) => mt,
                None => continue,
            };

            if media_type == MediaType::Video && !has_audio_stream(&path) {
                media_type = MediaType::Gif;
            }

            // Check file size
            let metadata = match fs::metadata(&path) {
                Ok(m) => m,
                Err(_) => continue,
            };

            if metadata.len() > MAX_FILE_SIZE {
                continue;
            }

            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            let created_at = metadata
                .created()
                .unwrap_or(std::time::SystemTime::now())
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            items.push(MediaItem {
                id: filename.clone(),
                filename: filename.clone(),
                original_name: filename,
                media_type,
                file_size: metadata.len(),
                created_at,
            });
        }

        // Sort by created_at descending (newest first)
        items.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        Ok(items)
    }

    /// Import a file into the storage folder. Preserves original filename.
    /// If a file with the same name exists, appends a suffix like " (2)".
    pub fn import_file(&self, source_path: &Path) -> Result<MediaItem, AppError> {
        self.ensure_storage_dir()?;

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

        let mut media_type = classify_media(&extension).ok_or_else(|| {
            AppError::InvalidFileType(format!("Cannot classify file type: .{}", extension))
        })?;

        if media_type == MediaType::Video && !has_audio_stream(source_path) {
            media_type = MediaType::Gif;
        }

        // Check source file size
        let source_meta = fs::metadata(source_path)?;
        if source_meta.len() > MAX_FILE_SIZE {
            return Err(AppError::InvalidFileType(format!(
                "File too large (max {}MB)",
                MAX_FILE_SIZE / 1024 / 1024
            )));
        }

        let original_name = source_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Determine destination filename with dedup
        let dest_filename = self.deduplicate_filename(&original_name);
        let dest_path = self.storage_dir.join(&dest_filename);

        // Skip if source is already inside our storage dir
        if let Ok(canonical_src) = source_path.canonicalize() {
            if let Ok(canonical_dir) = self.storage_dir.canonicalize() {
                if canonical_src.starts_with(&canonical_dir) {
                    // File is already in our storage, just build the item
                    let metadata = fs::metadata(&canonical_src)?;
                    let created_at = metadata
                        .created()
                        .unwrap_or(std::time::SystemTime::now())
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    return Ok(MediaItem {
                        id: dest_filename.clone(),
                        filename: dest_filename,
                        original_name,
                        media_type,
                        file_size: metadata.len(),
                        created_at,
                    });
                }
            }
        }

        fs::copy(source_path, &dest_path)?;

        let metadata = fs::metadata(&dest_path)?;
        let created_at = metadata
            .created()
            .unwrap_or(std::time::SystemTime::now())
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        Ok(MediaItem {
            id: dest_filename.clone(),
            filename: dest_filename,
            original_name,
            media_type,
            file_size: metadata.len(),
            created_at,
        })
    }

    /// Delete a media file from storage.
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

    /// Change the storage directory. Moves all valid files from old to new,
    /// then deletes the old directory.
    pub fn change_storage_dir(&mut self, new_dir: PathBuf) -> Result<(), AppError> {
        if new_dir == self.storage_dir {
            return Ok(());
        }

        fs::create_dir_all(&new_dir)?;

        // Move existing media files to new dir
        if let Ok(entries) = fs::read_dir(&self.storage_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if !path.is_file() {
                    continue;
                }
                let filename = match path.file_name().and_then(|n| n.to_str()) {
                    Some(name) => name.to_string(),
                    None => continue,
                };

                // Skip manifest (no longer needed)
                if filename == "manifest.json" {
                    continue;
                }

                let dest = new_dir.join(&filename);
                if !dest.exists() {
                    let _ = fs::copy(&path, &dest);
                }
            }
        }

        // Try to remove old directory
        let _ = fs::remove_dir_all(&self.storage_dir);

        self.storage_dir = new_dir;
        Ok(())
    }

    /// Generate a unique filename if a file with the same name already exists.
    fn deduplicate_filename(&self, name: &str) -> String {
        let path = self.storage_dir.join(name);
        if !path.exists() {
            return name.to_string();
        }

        let stem = Path::new(name)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(name);
        let ext = Path::new(name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");

        let mut counter = 2u32;
        loop {
            let candidate = if ext.is_empty() {
                format!("{} ({})", stem, counter)
            } else {
                format!("{} ({}).{}", stem, counter, ext)
            };
            if !self.storage_dir.join(&candidate).exists() {
                return candidate;
            }
            counter += 1;
        }
    }
}
