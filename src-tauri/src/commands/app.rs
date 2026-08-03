use crate::error::ArgusError;
use crate::models::UpdateStatus;

#[tauri::command]
pub async fn app_get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
pub async fn app_check_for_update() -> Result<UpdateStatus, ArgusError> {
    Ok(UpdateStatus {
        available: false,
        version: Some(env!("CARGO_PKG_VERSION").to_string()),
        notes: Some("You are running the latest version of Argus.".into()),
    })
}
