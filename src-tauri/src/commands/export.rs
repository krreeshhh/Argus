use std::fs::File;
use std::io::Write;
use crate::error::ArgusError;
use crate::models::{Finding, Node};
use crate::state::AppState;
use crate::commands::project::get_db_pool;

#[tauri::command]
pub async fn export_png(path: String, data_url: String) -> Result<(), ArgusError> {
    let base64_str = data_url.split(',').nth(1).unwrap_or(&data_url);
    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_str)
        .map_err(|e| ArgusError::Export(e.to_string()))?;
    let mut file = File::create(path)?;
    file.write_all(&bytes)?;
    Ok(())
}

#[tauri::command]
pub async fn export_svg(path: String, svg_content: String) -> Result<(), ArgusError> {
    let mut file = File::create(path)?;
    file.write_all(svg_content.as_bytes())?;
    Ok(())
}

#[tauri::command]
pub async fn export_nodes_csv(
    project_id: String,
    graph_ids: Vec<String>,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let placeholders = graph_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query_str = format!(
        "SELECT id, graph_id, type, label, status_code, ip, cdn, title, page_size, found_by, score, is_favorite, is_pinned, is_collapsed, parent_id, pos_x, pos_y, created_at FROM nodes WHERE graph_id IN ({})",
        placeholders
    );

    let mut query = sqlx::query_as::<_, Node>(&query_str);
    for gid in &graph_ids {
        query = query.bind(gid);
    }
    let nodes = query.fetch_all(&pool).await?;

    let mut wtr = csv::Writer::from_path(path).map_err(|e| ArgusError::Export(e.to_string()))?;
    wtr.write_record(["ID", "Type", "Label", "Status Code", "Title", "Page Size", "Found By", "Score", "Favorite"])
        .map_err(|e| ArgusError::Export(e.to_string()))?;

    for n in nodes {
        wtr.write_record([
            &n.id,
            &n.r#type,
            &n.label,
            &n.status_code.map(|s| s.to_string()).unwrap_or_default(),
            n.title.as_deref().unwrap_or(""),
            &n.page_size.map(|s| s.to_string()).unwrap_or_default(),
            n.found_by.as_deref().unwrap_or(""),
            &n.score.to_string(),
            &n.is_favorite.to_string(),
        ])
        .map_err(|e| ArgusError::Export(e.to_string()))?;
    }
    wtr.flush().map_err(|e| ArgusError::Export(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn export_subdomains_txt(
    project_id: String,
    graph_ids: Vec<String>,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let placeholders = graph_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query_str = format!(
        "SELECT label FROM nodes WHERE graph_id IN ({}) AND type = 'subdomain' ORDER BY label ASC",
        placeholders
    );

    let mut query = sqlx::query_scalar::<_, String>(&query_str);
    for gid in &graph_ids {
        query = query.bind(gid);
    }
    let labels = query.fetch_all(&pool).await?;

    let mut file = File::create(path)?;
    for l in labels {
        writeln!(file, "{}", l)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn export_active_subdomains_txt(
    project_id: String,
    graph_ids: Vec<String>,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let placeholders = graph_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query_str = format!(
        "SELECT label FROM nodes WHERE graph_id IN ({}) AND type = 'subdomain' AND status_code >= 200 AND status_code < 400 ORDER BY label ASC",
        placeholders
    );

    let mut query = sqlx::query_scalar::<_, String>(&query_str);
    for gid in &graph_ids {
        query = query.bind(gid);
    }
    let labels = query.fetch_all(&pool).await?;

    let mut file = File::create(path)?;
    for l in labels {
        writeln!(file, "{}", l)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn export_favorites_csv(
    project_id: String,
    graph_ids: Vec<String>,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let placeholders = graph_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let query_str = format!(
        "SELECT id, graph_id, type, label, status_code, ip, cdn, title, page_size, found_by, score, is_favorite, is_pinned, is_collapsed, parent_id, pos_x, pos_y, created_at FROM nodes WHERE graph_id IN ({}) AND (is_favorite = 1 OR score > 0.7)",
        placeholders
    );

    let mut query = sqlx::query_as::<_, Node>(&query_str);
    for gid in &graph_ids {
        query = query.bind(gid);
    }
    let nodes = query.fetch_all(&pool).await?;

    let mut wtr = csv::Writer::from_path(path).map_err(|e| ArgusError::Export(e.to_string()))?;
    wtr.write_record(["ID", "Type", "Label", "Status Code", "Title", "Score"])
        .map_err(|e| ArgusError::Export(e.to_string()))?;

    for n in nodes {
        wtr.write_record([
            &n.id,
            &n.r#type,
            &n.label,
            &n.status_code.map(|s| s.to_string()).unwrap_or_default(),
            n.title.as_deref().unwrap_or(""),
            &n.score.to_string(),
        ])
        .map_err(|e| ArgusError::Export(e.to_string()))?;
    }
    wtr.flush().map_err(|e| ArgusError::Export(e.to_string()))?;
    Ok(())
}

#[tauri::command]
pub async fn export_markdown_report(
    project_id: String,
    graph_ids: Vec<String>,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let placeholders = graph_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");

    let n_count: i64 = sqlx::query_scalar(&format!("SELECT COUNT(*) FROM nodes WHERE graph_id IN ({})", placeholders))
        .bind(&graph_ids[0])
        .fetch_one(&pool).await.unwrap_or(0);

    let findings_query = format!(
        "SELECT f.id, f.node_id, f.severity, f.title, f.description, f.source_tool, f.created_at FROM findings f JOIN nodes n ON f.node_id = n.id WHERE n.graph_id IN ({}) ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END ASC",
        placeholders
    );
    let mut f_q = sqlx::query_as::<_, Finding>(&findings_query);
    for gid in &graph_ids {
        f_q = f_q.bind(gid);
    }
    let findings = f_q.fetch_all(&pool).await.unwrap_or_default();

    let mut md = String::new();
    md.push_str("# Argus Attack Surface Recon Report\n\n");
    md.push_str(&format!("- Total Visible Nodes: {}\n", n_count));
    md.push_str(&format!("- Total Findings: {}\n\n", findings.len()));

    md.push_str("## High Severity Findings\n\n");
    for f in findings {
        md.push_str(&format!("### [{}] {}\n", f.severity.to_uppercase(), f.title));
        md.push_str(&format!("- Source Tool: {}\n", f.source_tool));
        md.push_str(&format!("- Target Node/URL: {}\n", f.description));
        md.push_str("\n---\n\n");
    }

    let mut file = File::create(path)?;
    file.write_all(md.as_bytes())?;
    Ok(())
}
