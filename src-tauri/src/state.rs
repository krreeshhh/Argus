use std::sync::Arc;
use tokio::sync::Mutex;
use sqlx::SqlitePool;
use std::collections::HashMap;

pub struct AppState {
    pub db_pools: Arc<Mutex<HashMap<String, SqlitePool>>>,
    pub active_project_id: Arc<Mutex<Option<String>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            db_pools: Arc::new(Mutex::new(HashMap::new())),
            active_project_id: Arc::new(Mutex::new(None)),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
