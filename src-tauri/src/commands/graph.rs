use crate::error::ArgusError;
use crate::models::{DiffResult, Edge, FilterSpec, Graph, Node, NodeChange};
use crate::state::AppState;
use crate::commands::project::get_db_pool;

#[tauri::command]
pub async fn graph_list_available(
    project_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Graph>, ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let graphs = sqlx::query_as::<_, Graph>(
        "SELECT id, project_id, name, root_domain, source_scan_label, node_count, edge_count, created_at FROM graphs WHERE project_id = ?"
    )
    .bind(&project_id)
    .fetch_all(&pool)
    .await?;
    Ok(graphs)
}

#[tauri::command]
pub async fn graph_get_nodes(
    project_id: String,
    graph_ids: Vec<String>,
    filters: Option<FilterSpec>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Node>, ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;

    let (query_str, bind_ids) = if graph_ids.is_empty() {
        (
            "SELECT id, graph_id, type, label, status_code, ip, cdn, title, page_size, found_by, score, is_favorite, is_pinned, is_collapsed, parent_id, pos_x, pos_y, created_at FROM nodes WHERE type NOT IN ('endpoint', 'jsfile')".to_string(),
            vec![]
        )
    } else {
        let placeholders = graph_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        (
            format!(
                "SELECT id, graph_id, type, label, status_code, ip, cdn, title, page_size, found_by, score, is_favorite, is_pinned, is_collapsed, parent_id, pos_x, pos_y, created_at FROM nodes WHERE graph_id IN ({}) AND type NOT IN ('endpoint', 'jsfile')",
                placeholders
            ),
            graph_ids.clone()
        )
    };

    let mut query = sqlx::query_as::<_, Node>(&query_str);
    for gid in &bind_ids {
        query = query.bind(gid);
    }

    let mut nodes = query.fetch_all(&pool).await?;

    let mut matching_node_ids = None;
    if let Some(ref f) = &filters {
        if let Some(ref filter_tags) = f.tags {
            if !filter_tags.is_empty() {
                use std::collections::HashSet;
                use sqlx::Row;
                let placeholders = filter_tags.iter().map(|_| "?").collect::<Vec<_>>().join(",");
                let sql = format!("SELECT DISTINCT node_id FROM tags WHERE label IN ({})", placeholders);
                let mut q = sqlx::query(&sql);
                for tag in filter_tags {
                    q = q.bind(tag);
                }
                if let Ok(rows) = q.fetch_all(&pool).await {
                    let ids: HashSet<String> = rows.into_iter().map(|r| r.get::<String, _>(0)).collect();
                    matching_node_ids = Some(ids);
                }
            }
        }
    }

    // Apply Filters if provided
    if let Some(f) = filters {
        nodes.retain(|n| {
            if let Some(ref ids) = matching_node_ids {
                if !ids.contains(&n.id) {
                    return false;
                }
            }
            if let Some(true) = f.only_alive {
                match n.status_code {
                    Some(sc) => {
                        if sc < 100 || sc >= 500 {
                            return false;
                        }
                    }
                    None => {}
                }
            }
            if let Some(true) = f.only_dead {
                match n.status_code {
                    Some(sc) => {
                        if sc >= 100 && sc < 500 {
                            return false;
                        }
                    }
                    None => return false,
                }
            }
            if let Some(true) = f.only_favorites {
                if n.is_favorite == 0 && n.score <= 0.7 {
                    return false;
                }
            }
            if let Some(true) = f.only_findings {
                if n.r#type != "finding" {
                    return false;
                }
            }
            if let Some(ref codes) = f.status_codes {
                if !codes.is_empty() {
                    match n.status_code {
                        Some(sc) => {
                            if !codes.contains(&sc) {
                                return false;
                            }
                        }
                        None => return false,
                    }
                }
            }
            if let Some(ref q) = f.search_query {
                if !q.is_empty() {
                    let lq = q.to_lowercase();
                    let matches_label = n.label.to_lowercase().contains(&lq);
                    let matches_title = n.title.as_deref().unwrap_or("").to_lowercase().contains(&lq);
                    if !matches_label && !matches_title {
                        return false;
                    }
                }
            }
            true
        });
    }

    // Auto-collapse subdomains if total node count > 300
    let auto_collapse = nodes.len() > 300;

    // Bulk query child counts to avoid N+1 queries loop
    use std::collections::HashMap;
    let mut child_counts = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT parent_id, COUNT(*) as cnt FROM nodes WHERE parent_id IS NOT NULL GROUP BY parent_id"
    )
    .fetch_all(&pool)
    .await {
        for row in rows {
            use sqlx::Row;
            if let (Ok(p_id), Ok(cnt)) = (row.try_get::<String, _>("parent_id"), row.try_get::<i64, _>("cnt")) {
                child_counts.insert(p_id, cnt);
            }
        }
    }

    // Bulk query highest severities rollup to avoid N+1 queries loop
    let mut highest_sevs = HashMap::new();
    if let Ok(rows) = sqlx::query(
        "SELECT subdomain_id, severity FROM (
            SELECT 
                CASE WHEN n.type = 'subdomain' THEN n.id ELSE n.parent_id END as subdomain_id,
                f.severity,
                ROW_NUMBER() OVER (
                    PARTITION BY CASE WHEN n.type = 'subdomain' THEN n.id ELSE n.parent_id END 
                    ORDER BY CASE f.severity 
                        WHEN 'critical' THEN 1 
                        WHEN 'high' THEN 2 
                        WHEN 'medium' THEN 3 
                        WHEN 'low' THEN 4 
                        ELSE 5 END ASC
                ) as rn
            FROM findings f
            JOIN nodes n ON f.node_id = n.id
        ) WHERE rn = 1 AND subdomain_id IS NOT NULL"
    )
    .fetch_all(&pool)
    .await {
        for row in rows {
            use sqlx::Row;
            if let (Ok(sub_id), Ok(sev)) = (row.try_get::<String, _>("subdomain_id"), row.try_get::<String, _>("severity")) {
                highest_sevs.insert(sub_id, sev);
            }
        }
    }

    for node in &mut nodes {
        if node.r#type == "subdomain" {
            if auto_collapse && node.is_collapsed == 0 {
                node.is_collapsed = 1;
            }
            node.child_count = Some(*child_counts.get(&node.id).unwrap_or(&0));
            node.max_hidden_severity = highest_sevs.get(&node.id).cloned();
        }
    }

    // Exclude 'endpoint' and 'jsfile' nodes from the main graph canvas
    nodes.retain(|n| n.r#type != "endpoint" && n.r#type != "jsfile");

    // Limit returned nodes to 3000 to keep UI responsive with up to 500,000 nodes, prioritizing important targets
    if nodes.len() > 3000 {
        nodes.sort_by(|a, b| {
            let priority_a = if a.r#type == "root" { 4 } else if a.is_favorite == 1 { 3 } else if a.is_pinned == 1 { 2 } else if a.r#type == "finding" { 1 } else { 0 };
            let priority_b = if b.r#type == "root" { 4 } else if b.is_favorite == 1 { 3 } else if b.is_pinned == 1 { 2 } else if b.r#type == "finding" { 1 } else { 0 };
            
            if priority_a != priority_b {
                priority_b.cmp(&priority_a)
            } else {
                b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal)
            }
        });
        nodes.truncate(3000);
    }

    Ok(nodes)
}

#[derive(Debug, serde::Serialize)]
pub struct NodeEndpointsResponse {
    pub endpoints: Vec<Node>,
    pub total_count: i64,
}

#[tauri::command]
pub async fn node_get_endpoints(
    project_id: String,
    node_id: String,
    search_query: Option<String>,
    offset: Option<i64>,
    limit: Option<i64>,
    state: tauri::State<'_, AppState>,
) -> Result<NodeEndpointsResponse, ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    let q_str = search_query.as_deref().unwrap_or("").trim().to_lowercase();
    
    // 1. Query total count matching filters
    let mut count_sql = "SELECT COUNT(*) FROM nodes WHERE (parent_id = ? OR id = ?) AND type IN ('endpoint', 'jsfile')".to_string();
    if !q_str.is_empty() {
        count_sql.push_str(" AND (lower(label) LIKE ? OR lower(title) LIKE ?)");
    }
    
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql)
        .bind(&node_id)
        .bind(&node_id);
        
    if !q_str.is_empty() {
        count_query = count_query
            .bind(format!("%{}%", q_str))
            .bind(format!("%{}%", q_str));
    }
    let total_count = count_query.fetch_one(&pool).await?;

    // 2. Query paginated endpoints
    let mut select_sql = "SELECT id, graph_id, type, label, status_code, ip, cdn, title, page_size, found_by, score, is_favorite, is_pinned, is_collapsed, parent_id, pos_x, pos_y, created_at FROM nodes WHERE (parent_id = ? OR id = ?) AND type IN ('endpoint', 'jsfile')".to_string();
    
    if !q_str.is_empty() {
        select_sql.push_str(" AND (lower(label) LIKE ? OR lower(title) LIKE ?)");
    }
    
    select_sql.push_str(" ORDER BY score DESC, label ASC LIMIT ? OFFSET ?");
    
    let limit_val = limit.unwrap_or(500);
    let offset_val = offset.unwrap_or(0);
    
    let mut select_query = sqlx::query_as::<_, Node>(&select_sql)
        .bind(&node_id)
        .bind(&node_id);
        
    if !q_str.is_empty() {
        select_query = select_query
            .bind(format!("%{}%", q_str))
            .bind(format!("%{}%", q_str));
    }
    
    select_query = select_query
        .bind(limit_val)
        .bind(offset_val);
        
    let endpoints = select_query.fetch_all(&pool).await?;

    Ok(NodeEndpointsResponse {
        endpoints,
        total_count,
    })
}

#[tauri::command]
pub async fn project_get_all_endpoints(
    project_id: String,
    search_query: Option<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Node>, ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;
    
    let mut sql = "SELECT id, graph_id, type, label, status_code, ip, cdn, title, page_size, found_by, score, is_favorite, is_pinned, is_collapsed, parent_id, pos_x, pos_y, created_at FROM nodes WHERE type IN ('endpoint', 'jsfile')".to_string();
    
    let q_str = search_query.as_deref().unwrap_or("").trim().to_lowercase();
    let endpoints = if !q_str.is_empty() {
        sql.push_str(" AND (lower(label) LIKE ? OR lower(title) LIKE ?)");
        sql.push_str(" ORDER BY score DESC, label ASC LIMIT 1000");
        sqlx::query_as::<_, Node>(&sql)
            .bind(format!("%{}%", q_str))
            .bind(format!("%{}%", q_str))
            .fetch_all(&pool)
            .await?
    } else {
        sql.push_str(" ORDER BY score DESC, label ASC LIMIT 1000");
        sqlx::query_as::<_, Node>(&sql)
            .fetch_all(&pool)
            .await?
    };
    
    Ok(endpoints)
}

#[tauri::command]
pub async fn graph_get_edges(
    project_id: String,
    graph_ids: Vec<String>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Edge>, ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;

    let (query_str, bind_ids) = if graph_ids.is_empty() {
        (
            "SELECT e.id, e.graph_id, e.source_node_id, e.target_node_id, e.relation FROM edges e \
             WHERE e.source_node_id IN (SELECT id FROM nodes WHERE type NOT IN ('endpoint', 'jsfile')) \
             AND e.target_node_id IN (SELECT id FROM nodes WHERE type NOT IN ('endpoint', 'jsfile'))".to_string(),
            vec![]
        )
    } else {
        let placeholders = graph_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        (
            format!(
                "SELECT e.id, e.graph_id, e.source_node_id, e.target_node_id, e.relation FROM edges e \
                 WHERE e.graph_id IN ({0}) \
                 AND e.source_node_id IN (SELECT id FROM nodes WHERE graph_id IN ({0}) AND type NOT IN ('endpoint', 'jsfile')) \
                 AND e.target_node_id IN (SELECT id FROM nodes WHERE graph_id IN ({0}) AND type NOT IN ('endpoint', 'jsfile'))",
                placeholders
            ),
            [graph_ids.clone(), graph_ids.clone(), graph_ids.clone()].concat()
        )
    };

    let mut query = sqlx::query_as::<_, Edge>(&query_str);
    for gid in &bind_ids {
        query = query.bind(gid);
    }

    let edges = query.fetch_all(&pool).await?;
    Ok(edges)
}

#[tauri::command]
pub async fn graph_diff(
    project_id: String,
    graph_id_a: String,
    graph_id_b: String,
    state: tauri::State<'_, AppState>,
) -> Result<DiffResult, ArgusError> {
    let pool = get_db_pool(&state, &project_id).await?;

    let nodes_a: Vec<Node> = sqlx::query_as("SELECT id, graph_id, type, label, status_code, ip, cdn, title, page_size, found_by, score, is_favorite, is_pinned, is_collapsed, parent_id, pos_x, pos_y, created_at FROM nodes WHERE graph_id = ? AND type NOT IN ('endpoint', 'jsfile')")
        .bind(&graph_id_a)
        .fetch_all(&pool)
        .await?;

    let nodes_b: Vec<Node> = sqlx::query_as("SELECT id, graph_id, type, label, status_code, ip, cdn, title, page_size, found_by, score, is_favorite, is_pinned, is_collapsed, parent_id, pos_x, pos_y, created_at FROM nodes WHERE graph_id = ? AND type NOT IN ('endpoint', 'jsfile')")
        .bind(&graph_id_b)
        .fetch_all(&pool)
        .await?;

    // CPU-bound comparison off-thread
    let res = tokio::task::spawn_blocking(move || {
        let mut added = Vec::new();
        let mut removed = Vec::new();
        let mut changed = Vec::new();

        use std::collections::HashMap;
        let map_a: HashMap<String, Node> = nodes_a.into_iter().map(|n| (n.label.clone(), n)).collect();
        let map_b: HashMap<String, Node> = nodes_b.into_iter().map(|n| (n.label.clone(), n)).collect();

        for (label, node_b) in &map_b {
            if let Some(node_a) = map_a.get(label) {
                if node_a.status_code != node_b.status_code {
                    changed.push(NodeChange {
                        node_id: node_b.id.clone(),
                        label: label.clone(),
                        old_status: node_a.status_code,
                        new_status: node_b.status_code,
                        new_findings: 0,
                    });
                }
            } else {
                added.push(node_b.clone());
            }
        }

        for (label, node_a) in &map_a {
            if !map_b.contains_key(label) {
                removed.push(node_a.clone());
            }
        }

        DiffResult { added, removed, changed }
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?;

    Ok(res)
}
