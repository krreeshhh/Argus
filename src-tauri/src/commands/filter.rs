use uuid::Uuid;
use chrono::Utc;
use crate::error::ArgusError;
use crate::models::{FilterPreset, FilterSpec};
use crate::state::AppState;
use crate::commands::project::get_db_pool;

#[tauri::command]
pub async fn filter_save_preset(
    project_id: String,
    name: String,
    spec: FilterSpec,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let preset_id = Uuid::new_v4().to_string();
    let filter_json = serde_json::to_string(&spec)?;
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO filter_presets (id, project_id, name, filter_json, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(&preset_id)
    .bind(&project_id)
    .bind(&name)
    .bind(&filter_json)
    .bind(&now)
    .execute(&pool)
    .await?;

    Ok(())
}

#[tauri::command]
pub async fn filter_list_presets(
    project_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<FilterPreset>, ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let presets = sqlx::query_as::<_, FilterPreset>(
        "SELECT id, project_id, name, filter_json, created_at FROM filter_presets WHERE project_id = ? ORDER BY created_at DESC"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await?;
    Ok(presets)
}

#[tauri::command]
pub async fn filter_delete_preset(
    preset_id: String,
    project_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    sqlx::query("DELETE FROM filter_presets WHERE id = ?")
        .bind(&preset_id)
        .execute(&pool)
        .await?;
    Ok(())
}
