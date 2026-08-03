use serde::Deserialize;
use thiserror::Error;

#[derive(Debug, Error, Deserialize)]
pub enum ArgusError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("I/O error: {0}")]
    Io(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Project error: {0}")]
    Project(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Export error: {0}")]
    Export(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl serde::Serialize for ArgusError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<sqlx::Error> for ArgusError {
    fn from(err: sqlx::Error) -> Self {
        ArgusError::Database(err.to_string())
    }
}

impl From<std::io::Error> for ArgusError {
    fn from(err: std::io::Error) -> Self {
        ArgusError::Io(err.to_string())
    }
}

impl From<serde_json::Error> for ArgusError {
    fn from(err: serde_json::Error) -> Self {
        ArgusError::Parse(err.to_string())
    }
}
