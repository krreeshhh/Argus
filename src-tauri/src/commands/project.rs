use std::fs;
use std::path::PathBuf;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteJournalMode, SqliteSynchronous};
use sqlx::SqlitePool;
use uuid::Uuid;
use chrono::Utc;
use std::str::FromStr;

use serde::{Serialize, Deserialize};
use crate::error::ArgusError;
use crate::models::{Project, ProjectSummary, Graph};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ViewportState {
    pub project_id: String,
    pub filters_json: String,
    pub focus_node_id: Option<String>,
    pub active_layout: String,
    pub station_open: i32,
    pub scope_open: i32,
    pub command_bar_open: i32,
    pub minimap_open: i32,
    pub grid_open: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectOpenResponse {
    pub project: Project,
    pub viewport_state: Option<ViewportState>,
}

pub fn get_app_dir() -> PathBuf {
    let mut dir = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("Argus");
    fs::create_dir_all(&dir).ok();
    dir
}

pub async fn get_db_pool(state: &AppState, project_id: &str) -> Result<SqlitePool, ArgusError> {
    {
        let pools = state.db_pools.lock().await;
        if let Some(pool) = pools.get(project_id) {
            return Ok(pool.clone());
        }
    }

    let db_path = get_app_dir().join(format!("{}.argus", project_id));
    if !db_path.exists() {
        return Err(ArgusError::NotFound(format!("Project file not found: {:?}", db_path)));
    }

    let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.to_str().unwrap()))?
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    let mut pools = state.db_pools.lock().await;
    if let Some(existing_pool) = pools.get(project_id) {
        return Ok(existing_pool.clone());
    }
    pools.insert(project_id.to_string(), pool.clone());

    Ok(pool)
}

#[tauri::command]
pub async fn project_new(
    name: String,
    root_domain: String,
    state: tauri::State<'_, AppState>,
) -> Result<Project, ArgusError> {
    let project_id = Uuid::new_v4().to_string();
    let db_path = get_app_dir().join(format!("{}.argus", project_id));

    let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.to_str().unwrap()))?
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Run migrations
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| ArgusError::Database(format!("Migration failed: {}", e)))?;

    let now = Utc::now().to_rfc3339();
    let project = Project {
        id: project_id.clone(),
        name: name.clone(),
        root_domain: root_domain.clone(),
        schema_version: 1,
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    sqlx::query(
        "INSERT INTO projects (id, name, root_domain, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&project.id)
    .bind(&project.name)
    .bind(&project.root_domain)
    .bind(project.schema_version)
    .bind(&project.created_at)
    .bind(&project.updated_at)
    .execute(&pool)
    .await?;

    // Create default graph
    let graph_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO graphs (id, project_id, name, root_domain, source_scan_label, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&graph_id)
    .bind(&project.id)
    .bind("Default Graph")
    .bind(&project.root_domain)
    .bind("Initial")
    .bind(&now)
    .execute(&pool)
    .await?;

    // Insert Root node
    let root_node_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO nodes (id, graph_id, type, label, score, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&root_node_id)
    .bind(&graph_id)
    .bind("root")
    .bind(&project.root_domain)
    .bind(1.0)
    .bind(&now)
    .execute(&pool)
    .await?;

    let mut pools = state.db_pools.lock().await;
    pools.insert(project_id.clone(), pool);
    *state.active_project_id.lock().await = Some(project_id.clone());

    Ok(project)
}

#[tauri::command]
pub async fn project_open(
    project_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<ProjectOpenResponse, ArgusError> {
    let db_path = get_app_dir().join(format!("{}.argus", project_id));
    if !db_path.exists() {
        return Err(ArgusError::NotFound("Project file does not exist".into()));
    }

    // Auto timestamped backup before open/migration
    let backup_path = get_app_dir().join(format!("{}_{}.argus.bak", project_id, Utc::now().timestamp()));
    fs::copy(&db_path, &backup_path).ok();

    let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", db_path.to_str().unwrap()))?
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;

    // Run migrations safely
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .map_err(|e| ArgusError::Database(format!("Migration failed: {}", e)))?;

    let project = sqlx::query_as::<_, Project>(
        "SELECT id, name, root_domain, schema_version, created_at, updated_at FROM projects WHERE id = ?"
    )
    .bind(&project_id)
    .fetch_one(&pool)
    .await?;

    let viewport_state = sqlx::query_as::<_, ViewportState>(
        "SELECT project_id, filters_json, focus_node_id, active_layout, station_open, scope_open, command_bar_open, minimap_open, grid_open FROM viewport_state WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten();

    let mut pools = state.db_pools.lock().await;
    pools.insert(project_id.clone(), pool);
    *state.active_project_id.lock().await = Some(project_id);

    Ok(ProjectOpenResponse { project, viewport_state })
}

#[tauri::command]
pub async fn project_save(
    project_id: String,
    viewport_state: Option<ViewportState>,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE projects SET updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&project_id)
        .execute(&pool)
        .await?;

    if let Some(vs) = viewport_state {
        sqlx::query(
            "INSERT OR REPLACE INTO viewport_state (project_id, filters_json, focus_node_id, active_layout, station_open, scope_open, command_bar_open, minimap_open, grid_open) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&project_id)
        .bind(&vs.filters_json)
        .bind(&vs.focus_node_id)
        .bind(&vs.active_layout)
        .bind(vs.station_open)
        .bind(vs.scope_open)
        .bind(vs.command_bar_open)
        .bind(vs.minimap_open)
        .bind(vs.grid_open)
        .execute(&pool)
        .await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn project_close(project_id: String, state: tauri::State<'_, AppState>) -> Result<(), ArgusError> {
    let mut pools = state.db_pools.lock().await;
    pools.remove(&project_id);
    let mut active = state.active_project_id.lock().await;
    if active.as_deref() == Some(&project_id) {
        *active = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn project_list_recent() -> Result<Vec<ProjectSummary>, ArgusError> {
    let dir = get_app_dir();
    let mut recent = Vec::new();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("argus") {
                let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", path.to_str().unwrap()))?;
                if let Ok(pool) = SqlitePoolOptions::new().connect_with(options).await {
                    if let Ok(proj) = sqlx::query_as::<_, Project>(
                        "SELECT id, name, root_domain, schema_version, created_at, updated_at FROM projects LIMIT 1"
                    )
                    .fetch_one(&pool)
                    .await
                    {
                        let node_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM nodes")
                            .fetch_one(&pool)
                            .await
                            .unwrap_or(0);
                        let finding_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM findings")
                            .fetch_one(&pool)
                            .await
                            .unwrap_or(0);

                        recent.push(ProjectSummary {
                            id: proj.id,
                            name: proj.name,
                            root_domain: proj.root_domain,
                            node_count,
                            finding_count,
                            updated_at: proj.updated_at,
                        });
                    }
                }
            }
        }
    }

    recent.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(recent)
}

#[tauri::command]
pub async fn project_delete(project_id: String, state: tauri::State<'_, AppState>) -> Result<(), ArgusError> {
    project_close(project_id.clone(), state).await.ok();
    let db_path = get_app_dir().join(format!("{}.argus", project_id));
    if db_path.exists() {
        fs::remove_file(db_path)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn project_export(
    project_id: String,
    target_path: String,
    _state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let db_path = get_app_dir().join(format!("{}.argus", project_id));
    if !db_path.exists() {
        return Err(ArgusError::NotFound("Project database not found".into()));
    }
    fs::copy(&db_path, &target_path)?;
    Ok(())
}

#[tauri::command]
pub async fn project_import(
    source_path: String,
    _state: tauri::State<'_, AppState>,
) -> Result<Project, ArgusError> {
    let source_path_buf = PathBuf::from(&source_path);
    if !source_path_buf.exists() {
        return Err(ArgusError::NotFound("Source file does not exist".into()));
    }
    
    let options = SqliteConnectOptions::from_str(&format!("sqlite://{}", source_path))?
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await?;
    let project = sqlx::query_as::<_, Project>(
        "SELECT id, name, root_domain, schema_version, created_at, updated_at FROM projects LIMIT 1"
    )
    .fetch_one(&pool)
    .await?;
    
    pool.close().await;

    let target_path = get_app_dir().join(format!("{}.argus", project.id));
    fs::copy(&source_path_buf, &target_path)?;
    Ok(project)
}

#[tauri::command]
pub async fn project_add_domain(
    project_id: String,
    domain: String,
    state: tauri::State<'_, AppState>,
) -> Result<Graph, ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let domain_trimmed = domain.trim();
    if domain_trimmed.is_empty() {
        return Err(ArgusError::Validation("Domain name cannot be empty".into()));
    }

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM graphs WHERE project_id = ? AND root_domain = ?")
        .bind(&project_id)
        .bind(domain_trimmed)
        .fetch_one(&pool)
        .await?;
    if count > 0 {
        return Err(ArgusError::Validation(format!("Domain '{}' already exists in this project", domain_trimmed)));
    }

    let now = Utc::now().to_rfc3339();
    let graph_id = Uuid::new_v4().to_string();

    // Insert new graph row
    sqlx::query(
        "INSERT INTO graphs (id, project_id, name, root_domain, source_scan_label, node_count, edge_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&graph_id)
    .bind(&project_id)
    .bind(format!("{} Graph", domain_trimmed))
    .bind(domain_trimmed)
    .bind("Initial")
    .bind(1) // node_count is 1 because of root node
    .bind(0)
    .bind(&now)
    .execute(&pool)
    .await?;

    // Insert Root node for this domain
    let root_node_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO nodes (id, graph_id, type, label, score, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&root_node_id)
    .bind(&graph_id)
    .bind("root")
    .bind(domain_trimmed)
    .bind(1.0)
    .bind(&now)
    .execute(&pool)
    .await?;

    // Fetch and return the newly created graph
    let graph = sqlx::query_as::<_, Graph>(
        "SELECT id, project_id, name, root_domain, source_scan_label, node_count, edge_count, created_at FROM graphs WHERE id = ?"
    )
    .bind(&graph_id)
    .fetch_one(&pool)
    .await?;

    Ok(graph)
}
