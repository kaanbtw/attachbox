use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid file type: {0}")]
    InvalidFileType(String),
    #[error("File not found: {0}")]
    NotFound(String),
    #[error("Clipboard error: {0}")]
    Clipboard(String),
    #[error("Serialization error: {0}")]
    Serialization(String),
}

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
