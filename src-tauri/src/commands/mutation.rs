use uuid::Uuid;
use chrono::Utc;
use crate::error::ArgusError;
use crate::state::AppState;
use crate::commands::project::get_db_pool;

async fn validate_node_belongs_to_project(
    pool: &sqlx::SqlitePool,
    node_id: &str,
) -> Result<(), ArgusError> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM nodes WHERE id = ?)")
        .bind(node_id)
        .fetch_one(pool)
        .await?;
    if !exists {
        return Err(ArgusError::NotFound(format!("Node {} not found in project database", node_id)));
    }
    Ok(())
}

#[tauri::command]
pub async fn node_set_favorite(
    project_id: String,
    node_id: String,
    value: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            validate_node_belongs_to_project(&pool, &node_id).await?;
            let val = if value { 1 } else { 0 };
            sqlx::query("UPDATE nodes SET is_favorite = ? WHERE id = ?")
                .bind(val)
                .bind(&node_id)
                .execute(&pool)
                .await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn node_add_tag(
    project_id: String,
    node_id: String,
    label: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            validate_node_belongs_to_project(&pool, &node_id).await?;
            let tag_id = Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO tags (id, node_id, label) VALUES (?, ?, ?)")
                .bind(&tag_id)
                .bind(&node_id)
                .bind(&label)
                .execute(&pool)
                .await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn node_remove_tag(
    project_id: String,
    node_id: String,
    label: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            validate_node_belongs_to_project(&pool, &node_id).await?;
            sqlx::query("DELETE FROM tags WHERE node_id = ? AND label = ?")
                .bind(&node_id)
                .bind(&label)
                .execute(&pool)
                .await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn node_add_note(
    project_id: String,
    node_id: String,
    body: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            validate_node_belongs_to_project(&pool, &node_id).await?;
            let now = Utc::now().to_rfc3339();
            let note_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO notes (id, node_id, body, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(node_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at"
            )
            .bind(&note_id)
            .bind(&node_id)
            .bind(&body)
            .bind(&now)
            .execute(&pool)
            .await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn node_hide(
    project_id: String,
    node_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            validate_node_belongs_to_project(&pool, &node_id).await?;
            sqlx::query("UPDATE nodes SET is_pinned = -1 WHERE id = ?")
                .bind(&node_id)
                .execute(&pool)
                .await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn node_delete(
    project_id: String,
    node_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            validate_node_belongs_to_project(&pool, &node_id).await?;
            sqlx::query("DELETE FROM nodes WHERE id = ?")
                .bind(&node_id)
                .execute(&pool)
                .await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn node_pin(
    project_id: String,
    node_id: String,
    pinned: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            validate_node_belongs_to_project(&pool, &node_id).await?;
            let val = if pinned { 1 } else { 0 };
            sqlx::query("UPDATE nodes SET is_pinned = ? WHERE id = ?")
                .bind(val)
                .bind(&node_id)
                .execute(&pool)
                .await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn node_collapse(
    project_id: String,
    node_id: String,
    collapsed: bool,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            validate_node_belongs_to_project(&pool, &node_id).await?;
            let val = if collapsed { 1 } else { 0 };
            sqlx::query("UPDATE nodes SET is_collapsed = ? WHERE id = ?")
                .bind(val)
                .bind(&node_id)
                .execute(&pool)
                .await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn node_set_position(
    project_id: String,
    node_id: String,
    pos_x: f64,
    pos_y: f64,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            validate_node_belongs_to_project(&pool, &node_id).await?;
            sqlx::query("UPDATE nodes SET pos_x = ?, pos_y = ? WHERE id = ?")
                .bind(pos_x)
                .bind(pos_y)
                .bind(&node_id)
                .execute(&pool)
                .await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn node_get_note(
    project_id: String,
    node_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<crate::models::Note>, ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            validate_node_belongs_to_project(&pool, &node_id).await?;
            let note = sqlx::query_as::<_, crate::models::Note>("SELECT id, node_id, body, updated_at FROM notes WHERE node_id = ?")
                .bind(&node_id)
                .fetch_optional(&pool)
                .await?;
            Ok(note)
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn node_get_tags(
    project_id: String,
    node_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<crate::models::Tag>, ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            validate_node_belongs_to_project(&pool, &node_id).await?;
            let tags = sqlx::query_as::<_, crate::models::Tag>("SELECT id, node_id, label FROM tags WHERE node_id = ?")
                .bind(&node_id)
                .fetch_all(&pool)
                .await?;
            Ok(tags)
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn project_get_all_tags(
    project_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            let tags = sqlx::query_scalar::<_, String>("SELECT DISTINCT label FROM tags ORDER BY label ASC")
                .fetch_all(&pool)
                .await?;
            Ok(tags)
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

#[tauri::command]
pub async fn node_unhide_all(
    project_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let handle = tokio::runtime::Handle::current();
    
    tokio::task::spawn_blocking(move || {
        handle.block_on(async {
            sqlx::query("UPDATE nodes SET is_pinned = 0 WHERE is_pinned = -1")
                .execute(&pool)
                .await?;
            Ok(())
        })
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?
}

