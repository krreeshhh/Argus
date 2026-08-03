use std::path::{Path, PathBuf};
use tokio::fs::{self, File};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tauri::Emitter;
use uuid::Uuid;
use chrono::Utc;
use serde_json::Value;
use regex::Regex;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteJournalMode, SqliteSynchronous};
use std::str::FromStr;

use crate::error::ArgusError;
use crate::models::{FolderImportSummary, ImportSummary, ReconTool};
use crate::state::AppState;
use crate::commands::project::{get_db_pool, project_new};

#[tauri::command]
pub async fn import_parse_file(
    path: String,
    tool: ReconTool,
    project_id: String,
    graph_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ImportSummary, ArgusError> {
    match import_parse_file_inner(path, tool, project_id, graph_id, &app_handle, state).await {
        Ok(res) => Ok(res),
        Err(e) => {
            app_handle.emit("import://error", e.to_string()).ok();
            Err(e)
        }
    }
}

async fn import_parse_file_inner(
    path: String,
    tool: ReconTool,
    project_id: String,
    graph_id: Option<String>,
    app_handle: &tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ImportSummary, ArgusError> {
    let file_path = Path::new(&path);
    if !file_path.exists() {
        return Err(ArgusError::NotFound(format!("Import file not found: {}", path)));
    }

    if file_path.is_dir() {
        let folder_summary = import_parse_folder_inner(path, project_id, graph_id, app_handle, state).await?;
        return Ok(ImportSummary {
            imported: folder_summary.imported_nodes,
            skipped: folder_summary.skipped,
            errors: folder_summary.errors,
        });
    }

    let pool = get_db_pool(&state, &project_id).await?;

    let target_graph_id = match graph_id {
        Some(gid) => gid,
        None => {
            let gid: String = sqlx::query_scalar("SELECT id FROM graphs WHERE project_id = ? ORDER BY created_at ASC LIMIT 1")
                .bind(&project_id)
                .fetch_one(&pool)
                .await?;
            gid
        }
    };

    let effective_tool = match tool {
        ReconTool::Auto => auto_detect_tool_from_file(file_path).await,
        other => other,
    };

    let file_name = file_path.file_name().and_then(|s| s.to_str()).unwrap_or("file").to_string();

    let (records, skipped, errors) = match parse_file_to_records(file_path, &effective_tool, app_handle, &file_name, 0, 1).await {
        Ok(res) => res,
        Err(e) => {
            app_handle.emit("import://error", serde_json::json!({
                "phase": "parsing",
                "message": e.to_string(),
            })).ok();
            return Err(e);
        }
    };

    let imported = match insert_records_into_graph(&state, &pool, &target_graph_id, records, app_handle, &file_name, 0, 1).await {
        Ok(res) => res,
        Err(e) => {
            app_handle.emit("import://error", serde_json::json!({
                "phase": "indexing",
                "message": e.to_string(),
            })).ok();
            return Err(e);
        }
    };

    app_handle.emit("import://progress", serde_json::json!({
        "phase": "loading",
        "percent": 70.0,
        "current_file": file_name,
        "records_processed": 0,
        "records_total": 0,
    })).ok();

    let n_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM nodes WHERE graph_id = ?")
        .bind(&target_graph_id)
        .fetch_one(&pool)
        .await?;
    let e_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM edges WHERE graph_id = ?")
        .bind(&target_graph_id)
        .fetch_one(&pool)
        .await?;

    sqlx::query("UPDATE graphs SET node_count = ?, edge_count = ? WHERE id = ?")
        .bind(n_count)
        .bind(e_count)
        .bind(&target_graph_id)
        .execute(&pool)
        .await?;

    app_handle.emit("import://progress", serde_json::json!({
        "phase": "loading",
        "percent": 85.0,
        "current_file": file_name,
        "records_processed": 0,
        "records_total": 0,
    })).ok();

    app_handle.emit("graph://refresh", ()).ok();

    Ok(ImportSummary {
        imported,
        skipped,
        errors,
    })
}

#[tauri::command]
pub async fn import_parse_folder(
    folder_path: String,
    project_id: String,
    graph_id: Option<String>,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<FolderImportSummary, ArgusError> {
    match import_parse_folder_inner(folder_path, project_id, graph_id, &app_handle, state).await {
        Ok(res) => Ok(res),
        Err(e) => {
            app_handle.emit("import://error", e.to_string()).ok();
            Err(e)
        }
    }
}

async fn import_parse_folder_inner(
    folder_path: String,
    project_id: String,
    graph_id: Option<String>,
    app_handle: &tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<FolderImportSummary, ArgusError> {
    let root_path = Path::new(&folder_path);
    if !root_path.exists() || !root_path.is_dir() {
        return Err(ArgusError::NotFound(format!("Import folder not found: {}", folder_path)));
    }

    let pool = get_db_pool(&state, &project_id).await?;
    let target_graph_id = match graph_id {
        Some(gid) => gid,
        None => {
            let gid: String = sqlx::query_scalar("SELECT id FROM graphs WHERE project_id = ? ORDER BY created_at ASC LIMIT 1")
                .bind(&project_id)
                .fetch_one(&pool)
                .await?;
            gid
        }
    };

    let files = collect_files_recursively(root_path).await?;
    let total_files = files.len();
    let mut files_processed = 0;
    let mut total_imported = 0;
    let mut total_skipped = 0;
    let mut all_errors = Vec::new();

    let mut subdomains_count = 0;
    let mut endpoints_count = 0;
    let mut findings_count = 0;
    let mut ips_count = 0;
    let mut tech_count = 0;

    for (file_index, file_p) in files.iter().enumerate() {
        files_processed += 1;
        let file_name = file_p.file_name().and_then(|s| s.to_str()).unwrap_or("file").to_string();
        let detected = auto_detect_tool_from_file(file_p).await;
        match parse_file_to_records(file_p, &detected, app_handle, &file_name, file_index, total_files).await {
            Ok((recs, skipped, errs)) => {
                total_skipped += skipped;
                all_errors.extend(errs);

                for r in &recs {
                    match r {
                        ParsedRecord::Subdomain { .. } => subdomains_count += 1,
                        ParsedRecord::Httpx { tech, .. } => {
                            endpoints_count += 1;
                            tech_count += tech.len();
                        }
                        ParsedRecord::Katana { .. } => endpoints_count += 1,
                        ParsedRecord::Nuclei { .. } => findings_count += 1,
                        ParsedRecord::NmapHost { ports, .. } => {
                            ips_count += 1;
                            tech_count += ports.len();
                        }
                        ParsedRecord::JsAsset { extracted_endpoints, .. } => {
                            endpoints_count += extracted_endpoints.len();
                        }
                        ParsedRecord::IpAddress { .. } => ips_count += 1,
                    }
                }

                match insert_records_into_graph(&state, &pool, &target_graph_id, recs, app_handle, &file_name, file_index, total_files).await {
                    Ok(count) => total_imported += count,
                    Err(e) => {
                        if all_errors.len() < 50 {
                            all_errors.push(format!("File {:?}: {}", file_p.file_name(), e));
                        }
                    }
                }
            }
            Err(e) => {
                if all_errors.len() < 50 {
                    all_errors.push(format!("Error reading {:?}: {}", file_p.file_name(), e));
                }
            }
        }
    }

    app_handle.emit("import://progress", serde_json::json!({
        "phase": "loading",
        "percent": 70.0,
        "current_file": "",
        "records_processed": 0,
        "records_total": 0,
    })).ok();

    let n_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM nodes WHERE graph_id = ?")
        .bind(&target_graph_id)
        .fetch_one(&pool)
        .await?;
    let e_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM edges WHERE graph_id = ?")
        .bind(&target_graph_id)
        .fetch_one(&pool)
        .await?;

    sqlx::query("UPDATE graphs SET node_count = ?, edge_count = ? WHERE id = ?")
        .bind(n_count)
        .bind(e_count)
        .bind(&target_graph_id)
        .execute(&pool)
        .await?;

    app_handle.emit("import://progress", serde_json::json!({
        "phase": "loading",
        "percent": 85.0,
        "current_file": "",
        "records_processed": 0,
        "records_total": 0,
    })).ok();

    app_handle.emit("graph://refresh", ()).ok();

    let detected_domain = extract_target_domain_from_folder_name(root_path);

    Ok(FolderImportSummary {
        files_processed,
        imported_nodes: total_imported,
        subdomains_count,
        endpoints_count,
        findings_count,
        ips_count,
        tech_count,
        skipped: total_skipped,
        errors: all_errors,
        detected_target_domain: detected_domain,
    })
}

#[tauri::command]
pub async fn import_create_project_from_folder(
    folder_path: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<FolderImportSummary, ArgusError> {
    match import_create_project_from_folder_inner(folder_path, &app_handle, state).await {
        Ok(res) => Ok(res),
        Err(e) => {
            app_handle.emit("import://error", e.to_string()).ok();
            Err(e)
        }
    }
}

async fn import_create_project_from_folder_inner(
    folder_path: String,
    app_handle: &tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<FolderImportSummary, ArgusError> {
    let p_path = Path::new(&folder_path);
    if !p_path.exists() || !p_path.is_dir() {
        return Err(ArgusError::NotFound(format!("Folder not found: {}", folder_path)));
    }

    let folder_name = p_path.file_name().and_then(|s| s.to_str()).unwrap_or("Imported Project");
    let (project_name, root_domain) = parse_project_and_domain_from_folder_name(folder_name);

    let proj = project_new(project_name, root_domain, state.clone()).await?;

    import_parse_folder_inner(folder_path, proj.id, None, app_handle, state).await
}

fn parse_project_and_domain_from_folder_name(folder_name: &str) -> (String, String) {
    let clean = folder_name.trim();
    if clean.to_lowercase().starts_with("test data - ") {
        let domain_part = &clean[12..].trim();
        return (domain_part.to_string(), domain_part.to_lowercase());
    }
    if let Some(pos) = clean.rfind('-') {
        let domain_part = clean[pos + 1..].trim();
        if domain_part.contains('.') {
            return (clean.to_string(), domain_part.to_lowercase());
        }
    }
    if clean.contains('.') {
        return (clean.to_string(), clean.to_lowercase());
    }
    (clean.to_string(), format!("{}.com", clean.to_lowercase().replace(' ', "")))
}

fn extract_target_domain_from_folder_name(folder_path: &Path) -> Option<String> {
    let fname = folder_path.file_name()?.to_str()?;
    let (_, domain) = parse_project_and_domain_from_folder_name(fname);
    Some(domain)
}

fn normalize_hostname(raw: &str) -> String {
    let trimmed = raw.trim();
    let lower = trimmed.to_lowercase();
    lower.trim_end_matches('.').to_string()
}

fn is_valid_hostname(s: &str) -> bool {
    let trimmed = s.trim();
    if trimmed.is_empty() || trimmed.len() > 253 {
        return false;
    }
    let mut has_dot = false;
    for c in trimmed.chars() {
        if c == '.' {
            has_dot = true;
        } else if !c.is_ascii_alphanumeric() && c != '-' && c != '_' {
            return false;
        }
    }
    has_dot
}

fn extract_host_from_url(url: &str) -> String {
    let clean = url.trim();
    let without_scheme = clean.trim_start_matches("http://").trim_start_matches("https://");
    without_scheme.split('/').next().unwrap_or("").to_string()
}

#[derive(Debug)]
pub enum ParsedRecord {
    Subdomain { hostname: String, status_code: Option<i64> },
    Httpx {
        url: String,
        host: Option<String>,
        status_code: Option<i64>,
        title: Option<String>,
        content_length: Option<i64>,
        tech: Vec<String>,
        ip: Option<String>,
        cdn: Option<String>,
    },
    Katana { url: String },
    Nuclei {
        severity: String,
        matched_at: String,
        name: String,
        description: Option<String>,
    },
    NmapHost {
        ip: String,
        hostname: Option<String>,
        ports: Vec<NmapPortInfo>,
    },
    JsAsset {
        url_or_name: String,
        extracted_endpoints: Vec<String>,
    },
    IpAddress { ip: String, host: Option<String> },
}

#[derive(Debug, Clone)]
pub struct NmapPortInfo {
    pub port: u16,
    pub protocol: String,
    pub service: String,
    pub product: Option<String>,
}

async fn collect_files_recursively(dir: &Path) -> Result<Vec<PathBuf>, ArgusError> {
    let mut files = Vec::new();
    let mut read_dir = fs::read_dir(dir).await?;

    while let Ok(Some(entry)) = read_dir.next_entry().await {
        let path = entry.path();
        if path.is_dir() {
            if let Some(fname) = path.file_name().and_then(|s| s.to_str()) {
                if fname.starts_with('.') || fname == "node_modules" || fname == "target" {
                    continue;
                }
            }
            let mut sub = Box::pin(collect_files_recursively(&path)).await?;
            files.append(&mut sub);
        } else if path.is_file() {
            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                let ext_lower = ext.to_lowercase();
                if ["png", "jpg", "jpeg", "gif", "ico", "exe", "zip", "tar", "gz", "db", "sqlite", "argus", "bak", "html", "htm"].contains(&ext_lower.as_str()) {
                    continue;
                }
            }
            files.push(path);
        }
    }
    Ok(files)
}

async fn auto_detect_tool_from_file(file_path: &Path) -> ReconTool {
    if let Some(ext) = file_path.extension().and_then(|s| s.to_str()) {
        let ext_l = ext.to_lowercase();
        if ext_l == "xml" {
            return ReconTool::Nmap;
        }
        if ext_l == "js" {
            return ReconTool::Js;
        }
    }

    let fname = file_path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
    if fname.contains("nmap") {
        return ReconTool::Nmap;
    }
    if fname.contains("gau") || fname.contains("wayback") || fname.contains("urls") {
        return ReconTool::Gau;
    }

    if let Ok(file) = File::open(file_path).await {
        let mut reader = BufReader::new(file);
        let mut sample = String::new();
        let mut buf = String::new();
        let mut line_count = 0;

        while line_count < 30 && reader.read_line(&mut buf).await.unwrap_or(0) > 0 {
            sample.push_str(&buf);
            buf.clear();
            line_count += 1;
        }

        if sample.contains("<nmaprun") || sample.contains("nmap") && sample.contains("<host>") {
            return ReconTool::Nmap;
        }
        if sample.contains("\"template-id\"") || sample.contains("\"template_id\"") || sample.contains("\"matched-at\"") {
            return ReconTool::Nuclei;
        }
        if sample.contains("\"status_code\"") || sample.contains("\"status-code\"") || sample.contains("\"cdn_name\"") || sample.contains("\"content_length\"") {
            return ReconTool::Httpx;
        }
        if sample.contains("\"request\":") && sample.contains("\"endpoint\"") {
            return ReconTool::Katana;
        }
        if sample.contains("\"host\":") || sample.contains("\"subdomain\":") {
            return ReconTool::Subfinder;
        }
    }

    ReconTool::Subfinder
}

async fn parse_file_to_records(
    file_path: &Path,
    tool: &ReconTool,
    app_handle: &tauri::AppHandle,
    file_name: &str,
    file_index: usize,
    total_files: usize,
) -> Result<(Vec<ParsedRecord>, usize, Vec<String>), ArgusError> {
    let total_files_f = total_files as f32;
    let file_index_f = file_index as f32;

    // Importing files phase (0-20% range overall)
    let importing_start = file_index_f * (20.0 / total_files_f);
    let importing_end = (file_index_f + 1.0) * (20.0 / total_files_f);

    app_handle.emit("import://progress", serde_json::json!({
        "phase": "importing",
        "percent": importing_start,
        "current_file": file_name,
        "records_processed": 0,
        "records_total": 0,
    })).ok();

    if let ReconTool::Nmap = tool {
        let mut content = String::new();
        let mut file = File::open(file_path).await?;
        file.read_to_string(&mut content).await?;

        app_handle.emit("import://progress", serde_json::json!({
            "phase": "importing",
            "percent": importing_end,
            "current_file": file_name,
            "records_processed": 0,
            "records_total": 0,
        })).ok();

        let parsing_start = 20.0 + file_index_f * (30.0 / total_files_f);
        let parsing_end = 20.0 + (file_index_f + 1.0) * (30.0 / total_files_f);

        app_handle.emit("import://progress", serde_json::json!({
            "phase": "parsing",
            "percent": parsing_start,
            "current_file": file_name,
            "records_processed": 0,
            "records_total": 1,
        })).ok();

        let res = parse_nmap_xml_content(&content);

        app_handle.emit("import://progress", serde_json::json!({
            "phase": "parsing",
            "percent": parsing_end,
            "current_file": file_name,
            "records_processed": 1,
            "records_total": 1,
        })).ok();

        return Ok(res);
    }

    if let ReconTool::Js = tool {
        let mut content = String::new();
        let mut file = File::open(file_path).await?;
        file.read_to_string(&mut content).await?;

        app_handle.emit("import://progress", serde_json::json!({
            "phase": "importing",
            "percent": importing_end,
            "current_file": file_name,
            "records_processed": 0,
            "records_total": 0,
        })).ok();

        let parsing_start = 20.0 + file_index_f * (30.0 / total_files_f);
        let parsing_end = 20.0 + (file_index_f + 1.0) * (30.0 / total_files_f);

        app_handle.emit("import://progress", serde_json::json!({
            "phase": "parsing",
            "percent": parsing_start,
            "current_file": file_name,
            "records_processed": 0,
            "records_total": 1,
        })).ok();

        let fname = file_path.file_name().and_then(|s| s.to_str()).unwrap_or("script.js");
        let res = parse_js_content(fname, &content);

        app_handle.emit("import://progress", serde_json::json!({
            "phase": "parsing",
            "percent": parsing_end,
            "current_file": file_name,
            "records_processed": 1,
            "records_total": 1,
        })).ok();

        return Ok(res);
    }

    let file = File::open(file_path).await?;
    let mut reader = BufReader::new(file);

    let mut lines = Vec::new();
    let mut line_buf = String::new();
    while reader.read_line(&mut line_buf).await? > 0 {
        lines.push(line_buf.trim().to_string());
        line_buf.clear();
    }

    app_handle.emit("import://progress", serde_json::json!({
        "phase": "importing",
        "percent": importing_end,
        "current_file": file_name,
        "records_processed": 0,
        "records_total": 0,
    })).ok();

    let tool_type = tool.clone();
    let app_handle_clone = app_handle.clone();
    let file_name_clone = file_name.to_string();

    let parsing_start = 20.0 + file_index_f * (30.0 / total_files_f);
    let parsing_range = 30.0 / total_files_f;

    let parsed_records = tokio::task::spawn_blocking(move || {
        let mut valid = Vec::new();
        let mut skipped = 0;
        let mut errors = Vec::new();
        let total_lines = lines.len();

        let mut last_emit = std::time::Instant::now();

        for (idx, line) in lines.into_iter().enumerate() {
            if line.is_empty() {
                continue;
            }
            match parse_line(&line, &tool_type) {
                Ok(Some(rec)) => valid.push(rec),
                Ok(None) => skipped += 1,
                Err(err) => {
                    skipped += 1;
                    if errors.len() < 50 {
                        errors.push(format!("Line {}: {}", idx + 1, err));
                    }
                }
            }

            let now = std::time::Instant::now();
            if total_lines > 0 && (now.duration_since(last_emit).as_millis() >= 200 || idx == total_lines - 1) {
                last_emit = now;
                let parse_fraction = (idx as f32) / (total_lines as f32);
                let percent = parsing_start + parse_fraction * parsing_range;
                app_handle_clone.emit("import://progress", serde_json::json!({
                    "phase": "parsing",
                    "percent": percent,
                    "current_file": file_name_clone,
                    "records_processed": idx as u64 + 1,
                    "records_total": total_lines as u64,
                })).ok();
            }
        }

        (valid, skipped, errors)
    })
    .await
    .map_err(|e| ArgusError::Internal(e.to_string()))?;

    Ok(parsed_records)
}

fn parse_nmap_xml_content(xml: &str) -> (Vec<ParsedRecord>, usize, Vec<String>) {
    let mut records = Vec::new();
    let mut skipped = 0;
    let mut errors = Vec::new();

    let host_re = Regex::new(r"(?s)<host\b[^>]*>(.*?)</host>").unwrap();
    let addr_re = Regex::new(r#"<address\s+addr="([^"]+)"\s+addrtype="ipv4""#).unwrap();
    let hostname_re = Regex::new(r#"<hostname\s+name="([^"]+)""#).unwrap();
    let port_re = Regex::new(r#"(?s)<port\s+protocol="([^"]+)"\s+portid="(\d+)"[^>]*>(.*?)</port>"#).unwrap();
    let service_re = Regex::new(r#"<service\s+name="([^"]+)"(?:\s+product="([^"]+)")?"#).unwrap();

    for cap in host_re.captures_iter(xml) {
        let host_block = &cap[1];
        let ip = addr_re.captures(host_block).map(|c| c[1].to_string());
        let hostname = hostname_re.captures(host_block).map(|c| c[1].to_string());

        if let Some(ip_addr) = ip {
            let mut ports = Vec::new();
            for pcap in port_re.captures_iter(host_block) {
                let proto = pcap[1].to_string();
                let port_num: u16 = pcap[2].parse().unwrap_or(0);
                let p_block = &pcap[3];

                if p_block.contains("state=\"open\"") {
                    let mut s_name = "unknown".to_string();
                    let mut s_prod = None;
                    if let Some(scap) = service_re.captures(p_block) {
                        s_name = scap[1].to_string();
                        s_prod = scap.get(2).map(|m| m.as_str().to_string());
                    }
                    ports.push(NmapPortInfo {
                        port: port_num,
                        protocol: proto,
                        service: s_name,
                        product: s_prod,
                    });
                }
            }

            records.push(ParsedRecord::NmapHost {
                ip: ip_addr,
                hostname,
                ports,
            });
        } else {
            skipped += 1;
        }
    }

    if records.is_empty() && !xml.contains("<nmaprun") {
        errors.push("Invalid Nmap XML structure".to_string());
    }

    (records, skipped, errors)
}

fn parse_js_content(filename: &str, content: &str) -> (Vec<ParsedRecord>, usize, Vec<String>) {
    let mut endpoints = Vec::new();
    let url_re = Regex::new(r#"https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s"'<>`]*"#).unwrap();
    let ep_re = Regex::new(r#"['"]/(?:api|v[0-9]+|auth|user|admin|login|graphql|dashboard|wp-[a-z]+)/[a-zA-Z0-9_/\-?=&.%]+['"]"#).unwrap();

    for cap in url_re.captures_iter(content) {
        let found = cap[0].to_string();
        if !endpoints.contains(&found) {
            endpoints.push(found);
        }
    }
    for cap in ep_re.captures_iter(content) {
        let raw = &cap[0];
        let clean = raw.trim_matches('\'').trim_matches('"').to_string();
        if !endpoints.contains(&clean) {
            endpoints.push(clean);
        }
    }

    let rec = ParsedRecord::JsAsset {
        url_or_name: filename.to_string(),
        extracted_endpoints: endpoints,
    };

    (vec![rec], 0, vec![])
}

fn parse_line(line: &str, tool: &ReconTool) -> Result<Option<ParsedRecord>, String> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed.starts_with('#') {
        return Ok(None);
    }

    match tool {
        ReconTool::Subfinder | ReconTool::Auto => {
            if trimmed.starts_with('{') {
                let v: Value = serde_json::from_str(trimmed).map_err(|e| format!("Invalid JSON line: {}", e))?;
                let host_val = v["host"]
                    .as_str()
                    .or_else(|| v["subdomain"].as_str())
                    .unwrap_or("")
                    .to_string();

                let host = if host_val.is_empty() {
                    v["input"].as_str().unwrap_or("").to_string()
                } else if !host_val.contains('.') {
                    if let Some(input_val) = v["input"].as_str() {
                        if !input_val.is_empty() {
                            format!("{}.{}", host_val, input_val)
                        } else {
                            host_val
                        }
                    } else {
                        host_val
                    }
                } else {
                    host_val
                };

                let mut status_code = None;
                let mut clean_host = host.clone();
                let host_parts: Vec<&str> = host.split_whitespace().collect();
                if !host_parts.is_empty() {
                    clean_host = host_parts[0].to_string();
                    if host_parts.len() > 1 {
                        let p1 = host_parts[1];
                        if p1.starts_with('[') && p1.ends_with(']') {
                            if let Ok(code) = p1[1..p1.len() - 1].parse::<i64>() {
                                status_code = Some(code);
                            }
                        }
                    }
                }

                if clean_host.is_empty() || !is_valid_hostname(&clean_host) {
                    return Ok(None);
                }
                Ok(Some(ParsedRecord::Subdomain { hostname: clean_host, status_code }))
            } else if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                let url = parts[0];
                let host = extract_host_from_url(url);

                let mut status_code = None;
                if parts.len() > 1 {
                    let p1 = parts[1];
                    if p1.starts_with('[') && p1.ends_with(']') {
                        if let Ok(code) = p1[1..p1.len() - 1].parse::<i64>() {
                            status_code = Some(code);
                        }
                    } else if let Some(http_idx) = parts.iter().position(|p| p.starts_with("HTTP/")) {
                        if parts.len() > http_idx + 1 {
                            if let Ok(code) = parts[http_idx + 1].parse::<i64>() {
                                status_code = Some(code);
                            }
                        }
                    }
                }

                if !host.is_empty() {
                    if url.ends_with(".js") || url.contains(".js?") {
                        Ok(Some(ParsedRecord::JsAsset {
                            url_or_name: url.to_string(),
                            extracted_endpoints: vec![],
                        }))
                    } else if url.contains('/') && url.len() > host.len() + 9 {
                        Ok(Some(ParsedRecord::Katana { url: url.to_string() }))
                    } else {
                        if is_valid_hostname(&host) {
                            Ok(Some(ParsedRecord::Subdomain { hostname: host, status_code }))
                        } else {
                            Ok(None)
                        }
                    }
                } else {
                    Ok(None)
                }
            } else {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                let raw_host = parts[0];
                let clean_host = normalize_hostname(raw_host);

                let mut status_code = None;
                if parts.len() > 1 {
                    let p1 = parts[1];
                    if p1.starts_with('[') && p1.ends_with(']') {
                        if let Ok(code) = p1[1..p1.len() - 1].parse::<i64>() {
                            status_code = Some(code);
                        }
                    }
                }

                if !clean_host.is_empty() && is_valid_hostname(&clean_host) {
                    Ok(Some(ParsedRecord::Subdomain { hostname: clean_host, status_code }))
                } else {
                    Ok(None)
                }
            }
        }
        ReconTool::Httpx => {
            if trimmed.starts_with('{') {
                let v: Value = serde_json::from_str(trimmed).map_err(|e| format!("Invalid Httpx JSON: {}", e))?;
                let url = v["url"].as_str().or_else(|| v["input"].as_str()).unwrap_or("").to_string();
                let host = v["host"].as_str().map(|s| s.to_string());
                let status_code = v["status_code"].as_i64()
                    .or_else(|| v["status-code"].as_i64())
                    .or(Some(0));
                let title = v["title"].as_str().map(|s| s.to_string());
                let content_length = v["content_length"].as_i64().or_else(|| v["content-length"].as_i64()).or_else(|| v["bytes"].as_i64());
                let ip = v["ip"].as_str().or_else(|| v["host_ip"].as_str()).map(|s| s.to_string());
                let cdn = v["cdn_name"].as_str().or_else(|| v["cdn-name"].as_str()).or_else(|| v["cdn"].as_str()).map(|s| s.to_string());

                let mut tech = Vec::new();
                if let Some(arr) = v["tech"].as_array() {
                    for item in arr {
                        if let Some(t) = item.as_str() {
                            tech.push(t.to_string());
                        }
                    }
                }

                if url.is_empty() && host.is_none() {
                    return Ok(None);
                }

                Ok(Some(ParsedRecord::Httpx {
                    url,
                    host,
                    status_code,
                    title,
                    content_length,
                    tech,
                    ip,
                    cdn,
                }))
            } else {
                Ok(Some(ParsedRecord::Httpx {
                    url: trimmed.to_string(),
                    host: None,
                    status_code: None,
                    title: None,
                    content_length: None,
                    tech: vec![],
                    ip: None,
                    cdn: None,
                }))
            }
        }
        ReconTool::Katana | ReconTool::Gau => {
            if trimmed.starts_with('{') {
                let v: Value = serde_json::from_str(trimmed).map_err(|e| format!("Invalid Katana JSON: {}", e))?;
                let url = v["request"]["endpoint"]
                    .as_str()
                    .or_else(|| v["endpoint"].as_str())
                    .or_else(|| v["url"].as_str())
                    .unwrap_or("")
                    .to_string();

                if url.is_empty() {
                    return Ok(None);
                }
                Ok(Some(ParsedRecord::Katana { url }))
            } else {
                Ok(Some(ParsedRecord::Katana { url: trimmed.to_string() }))
            }
        }
        ReconTool::Nuclei => {
            if trimmed.starts_with('{') {
                let v: Value = serde_json::from_str(trimmed).map_err(|e| format!("Invalid Nuclei JSON: {}", e))?;
                let template_id = v["template-id"].as_str().or_else(|| v["template_id"].as_str()).unwrap_or("").to_string();
                let severity = v["info"]["severity"]
                    .as_str()
                    .or_else(|| v["severity"].as_str())
                    .unwrap_or("info")
                    .to_string();
                let matched_at = v["matched-at"]
                    .as_str()
                    .or_else(|| v["matched_at"].as_str())
                    .or_else(|| v["matched"].as_str())
                    .unwrap_or("")
                    .to_string();
                let name = v["info"]["name"]
                    .as_str()
                    .or_else(|| v["name"].as_str())
                    .unwrap_or(&template_id)
                    .to_string();
                let description = v["info"]["description"]
                    .as_str()
                    .or_else(|| v["description"].as_str())
                    .map(|s| s.to_string());

                if matched_at.is_empty() {
                    return Ok(None);
                }
                Ok(Some(ParsedRecord::Nuclei {
                    severity,
                    matched_at,
                    name,
                    description,
                }))
            } else {
                Err("Nuclei record must be a JSON line".to_string())
            }
        }
        ReconTool::Nmap | ReconTool::Js => Ok(None),
    }
}

fn is_ip_address(s: &str) -> bool {
    s.parse::<std::net::IpAddr>().is_ok()
}

fn get_root_domain(hostname: &str) -> String {
    let hostname = hostname.trim().to_lowercase();
    let hostname = hostname.split(':').next().unwrap_or(&hostname);
    let parts: Vec<&str> = hostname.split('.').collect();
    if parts.len() <= 2 {
        return hostname.to_string();
    }
    let len = parts.len();
    let tld = parts[len - 1];
    let sld = parts[len - 2];
    if tld.len() == 2 && ["co", "com", "net", "org", "edu", "gov", "asn", "mil"].contains(&sld) {
        if len >= 3 {
            return parts[len - 3..].join(".");
        }
    }
    parts[len - 2..].join(".")
}

fn matches_root_domain(hostname: &str, root_domain: &str) -> bool {
    let h = hostname.trim().to_lowercase();
    let r = root_domain.trim().to_lowercase();
    h == r || h.ends_with(&format!(".{}", r))
}

fn get_record_host(rec: &ParsedRecord) -> Option<String> {
    match rec {
        ParsedRecord::Subdomain { hostname, .. } => Some(hostname.clone()),
        ParsedRecord::Httpx { host, url, .. } => {
            if let Some(ref h) = host {
                if !h.is_empty() {
                    return Some(h.clone());
                }
            }
            Some(extract_host_from_url(url))
        }
        ParsedRecord::Katana { url } => Some(extract_host_from_url(url)),
        ParsedRecord::Nuclei { matched_at, .. } => {
            if matched_at.starts_with("http://") || matched_at.starts_with("https://") {
                Some(extract_host_from_url(matched_at))
            } else {
                let host_only = matched_at.split(':').next().unwrap_or(matched_at);
                Some(host_only.to_string())
            }
        }
        ParsedRecord::NmapHost { hostname, .. } => hostname.clone(),
        ParsedRecord::JsAsset { url_or_name, .. } => {
            if url_or_name.starts_with("http://") || url_or_name.starts_with("https://") {
                Some(extract_host_from_url(url_or_name))
            } else {
                None
            }
        }
        ParsedRecord::IpAddress { host, .. } => host.clone(),
    }
}

async fn find_or_create_project_by_domain(
    state: &AppState,
    root_domain: &str,
) -> Result<(String, sqlx::SqlitePool, String), ArgusError> {
    let root_domain = root_domain.trim().to_lowercase();
    let app_dir = crate::commands::project::get_app_dir();
    
    // 1. Scan directory for existing project
    if let Ok(entries) = std::fs::read_dir(&app_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("argus") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    if let Ok(pool) = crate::commands::project::get_db_pool(state, stem).await {
                        let proj_domain: Option<String> = sqlx::query_scalar("SELECT root_domain FROM projects LIMIT 1")
                            .fetch_one(&pool)
                            .await
                            .ok();
                        if let Some(d) = proj_domain {
                            if d.to_lowercase() == root_domain {
                                // Find graph_id
                                let graph_id: Option<String> = sqlx::query_scalar("SELECT id FROM graphs WHERE project_id = ? ORDER BY created_at ASC LIMIT 1")
                                    .bind(stem)
                                    .fetch_one(&pool)
                                    .await
                                    .ok();
                                if let Some(gid) = graph_id {
                                    return Ok((stem.to_string(), pool, gid));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. If not found, create new project
    let project_id = Uuid::new_v4().to_string();
    let db_path = app_dir.join(format!("{}.argus", project_id));

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
    let name = root_domain.clone();
    
    sqlx::query(
        "INSERT INTO projects (id, name, root_domain, schema_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&project_id)
    .bind(&name)
    .bind(&root_domain)
    .bind(1)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await?;

    // Create default graph
    let graph_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO graphs (id, project_id, name, root_domain, source_scan_label, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(&graph_id)
    .bind(&project_id)
    .bind("Default Graph")
    .bind(&root_domain)
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
    .bind(&root_domain)
    .bind(1.0)
    .bind(&now)
    .execute(&pool)
    .await?;

    let mut pools = state.db_pools.lock().await;
    pools.insert(project_id.clone(), pool.clone());

    Ok((project_id, pool, graph_id))
}

async fn insert_records_single_project(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
    target_graph_id: &str,
    records: Vec<ParsedRecord>,
    now: &str,
    subdomains_count: &mut i64,
    status_codes_count: &mut i64,
    total_records: usize,
    processed_records: &mut usize,
    last_emit: &mut std::time::Instant,
    indexing_start: f32,
    indexing_range: f32,
    app_handle: &tauri::AppHandle,
    file_name: &str,
    global_subdomains_count: &i64,
    global_status_codes_count: &i64,
) -> Result<usize, ArgusError> {
    let root_node_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM nodes WHERE graph_id = ? AND type = 'root' LIMIT 1"
    )
    .bind(target_graph_id)
    .fetch_optional(&mut **tx)
    .await?;

    let existing_subdomains: Vec<(String, String, f64)> = sqlx::query_as(
        "SELECT label, id, score FROM nodes WHERE graph_id = ? AND type = 'subdomain'"
    )
    .bind(target_graph_id)
    .fetch_all(&mut **tx)
    .await?;

    let mut subdomain_cache: std::collections::HashMap<String, (String, f64)> = existing_subdomains
        .into_iter()
        .map(|(label, id, score)| (label, (id, score)))
        .collect();

    let existing_technologies: Vec<(String, String)> = sqlx::query_as(
        "SELECT label, id FROM nodes WHERE graph_id = ? AND type = 'technology'"
    )
    .bind(target_graph_id)
    .fetch_all(&mut **tx)
    .await?;

    let mut tech_cache: std::collections::HashMap<String, String> = existing_technologies
        .into_iter()
        .map(|(label, id)| (label.to_lowercase(), id))
        .collect();

    let mut imported = 0;

    for rec in records {
        match rec {
            ParsedRecord::Subdomain { hostname, status_code } => {
                *subdomains_count += 1;
                if status_code.is_some() {
                    *status_codes_count += 1;
                }

                let norm = normalize_hostname(&hostname);
                if norm.is_empty() {
                    continue;
                }
                let existing_id = subdomain_cache.get(&norm).map(|(id, _)| id.clone());

                if existing_id.is_none() {
                    let nid = Uuid::new_v4().to_string();
                    let score = if status_code.unwrap_or(0) == 200 { 0.8 } else { 0.5 };
                    sqlx::query(
                        "INSERT INTO nodes (id, graph_id, type, label, status_code, found_by, score, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
                    )
                    .bind(&nid)
                    .bind(target_graph_id)
                    .bind("subdomain")
                    .bind(&norm)
                    .bind(status_code)
                    .bind("subfinder")
                    .bind(score)
                    .bind(&root_node_id)
                    .bind(now)
                    .execute(&mut **tx)
                    .await?;

                    if let Some(ref r_id) = root_node_id {
                        let edge_id = Uuid::new_v4().to_string();
                        sqlx::query(
                            "INSERT INTO edges (id, graph_id, source_node_id, target_node_id, relation) VALUES (?, ?, ?, ?, ?)"
                        )
                        .bind(&edge_id)
                        .bind(target_graph_id)
                        .bind(r_id)
                        .bind(&nid)
                        .bind("subdomain_of")
                        .execute(&mut **tx)
                        .await?;
                    }
                    subdomain_cache.insert(norm.clone(), (nid, score));
                } else if let Some((eid, old_score)) = subdomain_cache.get(&norm).cloned() {
                    if let Some(code) = status_code {
                        let new_score = if code == 200 { 0.8 } else { old_score };
                        sqlx::query(
                            "UPDATE nodes SET status_code = ?, score = ? WHERE id = ?"
                        )
                        .bind(code)
                        .bind(new_score)
                        .bind(&eid)
                        .execute(&mut **tx)
                        .await?;
                        subdomain_cache.insert(norm.clone(), (eid, new_score));
                    }
                }
                imported += 1;
            }
            ParsedRecord::Httpx {
                url,
                host,
                status_code,
                title,
                content_length,
                tech,
                ip,
                cdn,
            } => {
                *subdomains_count += 1;
                if status_code.is_some() {
                    *status_codes_count += 1;
                }
                let raw_host = host.unwrap_or_else(|| extract_host_from_url(&url));
                let norm_host = normalize_hostname(&raw_host);

                if norm_host.is_empty() {
                    continue;
                }

                let existing = subdomain_cache.get(&norm_host).cloned();

                let node_id = if let Some((eid, old_score)) = existing {
                    let new_score = if status_code.unwrap_or(0) == 200 { 0.8 } else { old_score };
                    sqlx::query(
                        "UPDATE nodes SET status_code = ?, title = ?, page_size = ?, ip = COALESCE(?, ip), cdn = COALESCE(?, cdn), score = ? WHERE id = ?"
                    )
                    .bind(status_code)
                    .bind(&title)
                    .bind(content_length)
                    .bind(&ip)
                    .bind(&cdn)
                    .bind(new_score)
                    .bind(&eid)
                    .execute(&mut **tx)
                    .await?;
                    subdomain_cache.insert(norm_host.clone(), (eid.clone(), new_score));
                    eid
                } else {
                    let nid = Uuid::new_v4().to_string();
                    let score = if status_code.unwrap_or(0) == 200 { 0.8 } else { 0.5 };
                    sqlx::query(
                        "INSERT INTO nodes (id, graph_id, type, label, status_code, title, page_size, ip, cdn, found_by, score, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                    )
                    .bind(&nid)
                    .bind(target_graph_id)
                    .bind("subdomain")
                    .bind(&norm_host)
                    .bind(status_code)
                    .bind(&title)
                    .bind(content_length)
                    .bind(&ip)
                    .bind(&cdn)
                    .bind("httpx")
                    .bind(score)
                    .bind(&root_node_id)
                    .bind(now)
                    .execute(&mut **tx)
                    .await?;
                    subdomain_cache.insert(norm_host.clone(), (nid.clone(), score));
                    nid
                };

                for t in tech {
                    let tech_id = Uuid::new_v4().to_string();
                    let t_lower = t.to_lowercase();

                    let target_tech_id = if let Some(tid) = tech_cache.get(&t_lower) {
                        tid.clone()
                    } else {
                        sqlx::query(
                            "INSERT INTO nodes (id, graph_id, type, label, found_by, score, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
                        )
                        .bind(&tech_id)
                        .bind(target_graph_id)
                        .bind("technology")
                        .bind(&t)
                        .bind("httpx")
                        .bind(0.3)
                        .bind(now)
                        .execute(&mut **tx)
                        .await?;
                        tech_cache.insert(t_lower, tech_id.clone());
                        tech_id
                    };

                    let edge_id = Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT OR IGNORE INTO edges (id, graph_id, source_node_id, target_node_id, relation) VALUES (?, ?, ?, ?, ?)"
                    )
                    .bind(&edge_id)
                    .bind(target_graph_id)
                    .bind(&node_id)
                    .bind(&target_tech_id)
                    .bind("uses_tech")
                    .execute(&mut **tx)
                    .await?;
                }

                imported += 1;
            }
            ParsedRecord::Katana { url } => {
                let parsed_host = extract_host_from_url(&url);
                let norm_host = normalize_hostname(&parsed_host);

                let parent = if !norm_host.is_empty() {
                    subdomain_cache.get(&norm_host).map(|(id, _)| id.clone())
                } else {
                    None
                };

                let endpoint_id = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO nodes (id, graph_id, type, label, found_by, score, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(&endpoint_id)
                .bind(target_graph_id)
                .bind("endpoint")
                .bind(&url)
                .bind("katana")
                .bind(0.4)
                .bind(&parent)
                .bind(now)
                .execute(&mut **tx)
                .await?;

                if let Some(p_id) = parent {
                    let edge_id = Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO edges (id, graph_id, source_node_id, target_node_id, relation) VALUES (?, ?, ?, ?, ?)"
                    )
                    .bind(&edge_id)
                    .bind(target_graph_id)
                    .bind(&p_id)
                    .bind(&endpoint_id)
                    .bind("has_endpoint")
                    .execute(&mut **tx)
                    .await?;
                }

                imported += 1;
            }
            ParsedRecord::Nuclei {
                severity,
                matched_at,
                name,
                description,
            } => {
                let parsed_host = extract_host_from_url(&matched_at);
                let norm_host = normalize_hostname(&parsed_host);

                let parent_id = if let Some((sid, _)) = subdomain_cache.get(&norm_host) {
                    sid.clone()
                } else if let Some((sid, _)) = subdomain_cache.get(&matched_at) {
                    sid.clone()
                } else {
                    let parent_node: Option<String> = sqlx::query_scalar(
                        "SELECT id FROM nodes WHERE graph_id = ? AND (label = ? OR label = ?) LIMIT 1"
                    )
                    .bind(target_graph_id)
                    .bind(&matched_at)
                    .bind(&norm_host)
                    .fetch_optional(&mut **tx)
                    .await?;
                    parent_node.unwrap_or_else(|| root_node_id.clone().unwrap_or_default())
                };

                let finding_id = Uuid::new_v4().to_string();
                let desc = description.unwrap_or_else(|| matched_at.clone());
                sqlx::query(
                    "INSERT INTO findings (id, node_id, severity, title, description, source_tool, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(&finding_id)
                .bind(&parent_id)
                .bind(&severity)
                .bind(&name)
                .bind(&desc)
                .bind("nuclei")
                .bind(now)
                .execute(&mut **tx)
                .await?;

                let add_score = match severity.to_lowercase().as_str() {
                    "critical" => 0.9,
                    "high" => 0.8,
                    "medium" => 0.6,
                    _ => 0.4,
                };
                sqlx::query("UPDATE nodes SET score = MAX(score, ?) WHERE id = ?")
                    .bind(add_score)
                    .bind(&parent_id)
                    .execute(&mut **tx)
                    .await?;

                imported += 1;
            }
            ParsedRecord::NmapHost { ip, hostname, ports } => {
                let ip_id = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO nodes (id, graph_id, type, label, ip, found_by, score, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(&ip_id)
                .bind(target_graph_id)
                .bind("ip")
                .bind(&ip)
                .bind(&ip)
                .bind("nmap")
                .bind(0.6)
                .bind(&root_node_id)
                .bind(now)
                .execute(&mut **tx)
                .await?;

                if let Some(h) = hostname {
                    let sub_norm = normalize_hostname(&h);
                    if !sub_norm.is_empty() {
                        let sub_id = subdomain_cache.get(&sub_norm).map(|(id, _)| id.clone());

                        let target_sub_id = if let Some(sid) = sub_id {
                            sid
                        } else {
                            let nid = Uuid::new_v4().to_string();
                            sqlx::query(
                                "INSERT INTO nodes (id, graph_id, type, label, ip, found_by, score, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
                            )
                            .bind(&nid)
                            .bind(target_graph_id)
                            .bind("subdomain")
                            .bind(&sub_norm)
                            .bind(&ip)
                            .bind("nmap")
                            .bind(0.6)
                            .bind(&root_node_id)
                            .bind(now)
                            .execute(&mut **tx)
                            .await?;
                            subdomain_cache.insert(sub_norm.clone(), (nid.clone(), 0.6));
                            nid
                        };

                        let edge_id = Uuid::new_v4().to_string();
                        sqlx::query(
                            "INSERT OR IGNORE INTO edges (id, graph_id, source_node_id, target_node_id, relation) VALUES (?, ?, ?, ?, ?)"
                        )
                        .bind(&edge_id)
                        .bind(target_graph_id)
                        .bind(&target_sub_id)
                        .bind(&ip_id)
                        .bind("resolves_to")
                        .execute(&mut **tx)
                        .await?;
                    }
                }

                for p in ports {
                    let port_node_id = Uuid::new_v4().to_string();
                    let port_label = format!("{}/{} ({})", p.port, p.protocol, p.service);
                    sqlx::query(
                        "INSERT INTO nodes (id, graph_id, type, label, found_by, score, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                    )
                    .bind(&port_node_id)
                    .bind(target_graph_id)
                    .bind("port")
                    .bind(&port_label)
                    .bind("nmap")
                    .bind(0.4)
                    .bind(&ip_id)
                    .bind(now)
                    .execute(&mut **tx)
                    .await?;

                    let edge_id = Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO edges (id, graph_id, source_node_id, target_node_id, relation) VALUES (?, ?, ?, ?, ?)"
                    )
                    .bind(&edge_id)
                    .bind(target_graph_id)
                    .bind(&ip_id)
                    .bind(&port_node_id)
                    .bind("open_port")
                    .execute(&mut **tx)
                    .await?;
                }

                imported += 1;
            }
            ParsedRecord::JsAsset { url_or_name, extracted_endpoints } => {
                let js_id = Uuid::new_v4().to_string();
                let parsed_host = extract_host_from_url(&url_or_name);
                let norm_host = normalize_hostname(&parsed_host);

                let parent = if !norm_host.is_empty() {
                    subdomain_cache.get(&norm_host).map(|(id, _)| id.clone())
                } else {
                    None
                };

                sqlx::query(
                    "INSERT INTO nodes (id, graph_id, type, label, found_by, score, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(&js_id)
                .bind(target_graph_id)
                .bind("jsfile")
                .bind(&url_or_name)
                .bind("js_scanner")
                .bind(0.5)
                .bind(&parent)
                .bind(now)
                .execute(&mut **tx)
                .await?;

                if let Some(ref p_id) = parent {
                    let edge_id = Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO edges (id, graph_id, source_node_id, target_node_id, relation) VALUES (?, ?, ?, ?, ?)"
                    )
                    .bind(&edge_id)
                    .bind(target_graph_id)
                    .bind(p_id)
                    .bind(&js_id)
                    .bind("includes_js")
                    .execute(&mut **tx)
                    .await?;
                }

                for ep in extracted_endpoints {
                    let ep_id = Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO nodes (id, graph_id, type, label, found_by, score, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
                    )
                    .bind(&ep_id)
                    .bind(target_graph_id)
                    .bind("endpoint")
                    .bind(&ep)
                    .bind("js_scanner")
                    .bind(0.4)
                    .bind(&js_id)
                    .bind(now)
                    .execute(&mut **tx)
                    .await?;

                    let edge_id = Uuid::new_v4().to_string();
                    sqlx::query(
                        "INSERT INTO edges (id, graph_id, source_node_id, target_node_id, relation) VALUES (?, ?, ?, ?, ?)"
                    )
                    .bind(&edge_id)
                    .bind(target_graph_id)
                    .bind(&js_id)
                    .bind(&ep_id)
                    .bind("defines_endpoint")
                    .execute(&mut **tx)
                    .await?;
                }

                imported += 1;
            }
            ParsedRecord::IpAddress { ip, host } => {
                let ip_id = Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO nodes (id, graph_id, type, label, ip, found_by, score, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
                )
                .bind(&ip_id)
                .bind(target_graph_id)
                .bind("ip")
                .bind(&ip)
                .bind(&ip)
                .bind("discovery")
                .bind(0.5)
                .bind(&root_node_id)
                .bind(now)
                .execute(&mut **tx)
                .await?;

                if let Some(h) = host {
                    let sub_norm = normalize_hostname(&h);
                    if !sub_norm.is_empty() {
                        let sub_id = subdomain_cache.get(&sub_norm).map(|(id, _)| id.clone());

                        if let Some(sid) = sub_id {
                            let edge_id = Uuid::new_v4().to_string();
                            sqlx::query(
                                "INSERT OR IGNORE INTO edges (id, graph_id, source_node_id, target_node_id, relation) VALUES (?, ?, ?, ?, ?)"
                            )
                            .bind(&edge_id)
                            .bind(target_graph_id)
                            .bind(&sid)
                            .bind(&ip_id)
                            .bind("resolves_to")
                            .execute(&mut **tx)
                            .await?;
                        }
                    }
                }

                imported += 1;
            }
        }

        *processed_records += 1;
        let idx = *processed_records;
        let now_time = std::time::Instant::now();
        if total_records > 0 && (now_time.duration_since(*last_emit).as_millis() >= 200 || idx == total_records) {
            *last_emit = now_time;
            let write_fraction = (idx as f32) / (total_records as f32);
            let percent = indexing_start + write_fraction * indexing_range;
            app_handle.emit("import://progress", serde_json::json!({
                "phase": "indexing",
                "percent": percent,
                "current_file": file_name,
                "records_processed": idx as u64,
                "records_total": total_records as u64,
                "subdomains_count": *global_subdomains_count + *subdomains_count,
                "status_codes_count": *global_status_codes_count + *status_codes_count,
            })).ok();
        }
    }

    Ok(imported)
}

fn validate_records_domain(
    project_domains: &[String],
    records: &[ParsedRecord],
) -> Result<(), ArgusError> {
    let project_domains_lower: Vec<String> = project_domains.iter().map(|d| d.to_lowercase()).collect();
    let any_matches = records.iter().any(|rec| {
        if let Some(host) = get_record_host(rec) {
            let clean_host = normalize_hostname(&host);
            if !clean_host.is_empty() && !is_ip_address(&clean_host) {
                return project_domains_lower.iter().any(|domain| matches_root_domain(&clean_host, domain));
            }
        }
        false
    });

    let has_any_host = records.iter().any(|rec| {
        if let Some(host) = get_record_host(rec) {
            let clean_host = normalize_hostname(&host);
            !clean_host.is_empty() && !is_ip_address(&clean_host)
        } else {
            false
        }
    });

    if has_any_host && !any_matches {
        return Err(ArgusError::Validation("import reports of the projects domain".to_string()));
    }

    Ok(())
}

fn determine_target_domains(
    project_domains: &[String],
    records: &[ParsedRecord],
) -> Vec<String> {
    let project_domains_lower: Vec<String> = project_domains.iter().map(|d| d.to_lowercase()).collect();
    let default_domain = project_domains_lower.first().cloned().unwrap_or_default();
    let any_matches = records.iter().any(|rec| {
        if let Some(host) = get_record_host(rec) {
            let clean_host = normalize_hostname(&host);
            if !clean_host.is_empty() && !is_ip_address(&clean_host) {
                return project_domains_lower.iter().any(|domain| matches_root_domain(&clean_host, domain));
            }
        }
        false
    });

    records.iter().map(|rec| {
        if any_matches {
            if let Some(host) = get_record_host(rec) {
                let clean_host = normalize_hostname(&host);
                for domain in &project_domains_lower {
                    if matches_root_domain(&clean_host, domain) {
                        return domain.clone();
                    }
                }
            }
            default_domain.clone()
        } else if let Some(host) = get_record_host(rec) {
            let clean_host = normalize_hostname(&host);
            if !clean_host.is_empty() && !is_ip_address(&clean_host) {
                let mut matched = None;
                for domain in &project_domains_lower {
                    if matches_root_domain(&clean_host, domain) {
                        matched = Some(domain.clone());
                        break;
                    }
                }
                if let Some(m) = matched {
                    m
                } else {
                    get_root_domain(&clean_host)
                }
            } else {
                default_domain.clone()
            }
        } else {
            default_domain.clone()
        }
    }).collect()
}

async fn insert_records_into_graph(
    state: &AppState,
    pool: &sqlx::SqlitePool,
    _target_graph_id: &str,
    records: Vec<ParsedRecord>,
    app_handle: &tauri::AppHandle,
    file_name: &str,
    file_index: usize,
    total_files: usize,
) -> Result<usize, ArgusError> {
    let now = Utc::now().to_rfc3339();

    // Fetch all graphs in this project database file to know our valid domains
    let graphs: Vec<(String, String)> = sqlx::query_as::<_, (String, String)>(
        "SELECT root_domain, id FROM graphs"
    )
    .fetch_all(pool)
    .await?;

    let project_domains: Vec<String> = graphs.iter().map(|g| g.0.clone()).collect();

    validate_records_domain(&project_domains, &records)?;

    let total_files_f = total_files as f32;
    let file_index_f = file_index as f32;
    let indexing_start = 50.0 + file_index_f * (20.0 / total_files_f);
    let indexing_range = 20.0 / total_files_f;
    let total_records = records.len();
    let mut last_emit = std::time::Instant::now();

    app_handle.emit("import://progress", serde_json::json!({
        "phase": "indexing",
        "percent": indexing_start,
        "current_file": file_name,
        "records_processed": 0,
        "records_total": total_records as u64,
    })).ok();

    // Group records by project/domain
    let mut project_groups: std::collections::HashMap<String, (sqlx::SqlitePool, String, Vec<ParsedRecord>)> = std::collections::HashMap::new();
    for (domain, gid) in &graphs {
        project_groups.insert(
            domain.to_lowercase(),
            (pool.clone(), gid.clone(), Vec::new()),
        );
    }

    let target_domains = determine_target_domains(&project_domains, &records);

    for (rec, target_domain) in records.into_iter().zip(target_domains) {
        let mut final_target_domain = target_domain;
        if !project_groups.contains_key(&final_target_domain) {
            match find_or_create_project_by_domain(state, &final_target_domain).await {
                Ok((_pid, other_pool, other_gid)) => {
                    project_groups.insert(final_target_domain.clone(), (other_pool, other_gid, Vec::new()));
                }
                Err(e) => {
                    eprintln!("Failed to find/create project for domain {}: {}", final_target_domain, e);
                    if let Some(first_domain) = project_domains.first() {
                        final_target_domain = first_domain.to_lowercase();
                    }
                }
            }
        }

        if let Some(group) = project_groups.get_mut(&final_target_domain) {
            group.2.push(rec);
        }
    }

    let mut total_imported = 0;
    let mut subdomains_count = 0;
    let mut status_codes_count = 0;
    let mut processed_records = 0;

    for (_domain, (target_pool, target_gid, group_records)) in project_groups {
        if group_records.is_empty() {
            continue;
        }

        let mut tx = target_pool.begin().await?;
        let mut group_subdomains = 0;
        let mut group_status_codes = 0;

        let imported = insert_records_single_project(
            &mut tx,
            &target_gid,
            group_records,
            &now,
            &mut group_subdomains,
            &mut group_status_codes,
            total_records,
            &mut processed_records,
            &mut last_emit,
            indexing_start,
            indexing_range,
            app_handle,
            file_name,
            &subdomains_count,
            &status_codes_count,
        ).await?;

        tx.commit().await?;
        total_imported += imported;
        subdomains_count += group_subdomains;
        status_codes_count += group_status_codes;

        // Update counts in target database
        let n_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM nodes WHERE graph_id = ?")
            .bind(&target_gid)
            .fetch_one(&target_pool)
            .await?;
        let e_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM edges WHERE graph_id = ?")
            .bind(&target_gid)
            .fetch_one(&target_pool)
            .await?;

        sqlx::query("UPDATE graphs SET node_count = ?, edge_count = ? WHERE id = ?")
            .bind(n_count)
            .bind(e_count)
            .bind(&target_gid)
            .execute(&target_pool)
            .await?;
    }

    Ok(total_imported)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_root_domain() {
        assert_eq!(get_root_domain("sub.target.com"), "target.com");
        assert_eq!(get_root_domain("sub.target.co.uk"), "target.co.uk");
        assert_eq!(get_root_domain("target.com"), "target.com");
        assert_eq!(get_root_domain("target.co.uk"), "target.co.uk");
        assert_eq!(get_root_domain("sub.sub.target.com"), "target.com");
        assert_eq!(get_root_domain("a.b.c.target.com:443"), "target.com");
    }

    #[test]
    fn test_matches_root_domain() {
        assert!(matches_root_domain("sub.target.com", "target.com"));
        assert!(matches_root_domain("target.com", "target.com"));
        assert!(matches_root_domain("sub.sub.target.com", "target.com"));
        assert!(!matches_root_domain("target.com.au", "target.com"));
        assert!(!matches_root_domain("othertarget.com", "target.com"));
    }

    #[test]
    fn test_determine_target_domains() {
        let current_root = vec!["target.com".to_string()];

        // Scenario 1: One matches, so all get mapped to current project
        let records = vec![
            ParsedRecord::Subdomain { hostname: "sub.target.com".to_string(), status_code: None },
            ParsedRecord::Subdomain { hostname: "other.com".to_string(), status_code: None },
        ];
        let domains = determine_target_domains(&current_root, &records);
        assert_eq!(domains, vec!["target.com".to_string(), "target.com".to_string()]);

        // Scenario 2: None match, so they get routed normally
        let records2 = vec![
            ParsedRecord::Subdomain { hostname: "other.com".to_string(), status_code: None },
            ParsedRecord::Subdomain { hostname: "sub.another.com".to_string(), status_code: None },
        ];
        let domains2 = determine_target_domains(&current_root, &records2);
        assert_eq!(domains2, vec!["other.com".to_string(), "another.com".to_string()]);
    }

    #[test]
    fn test_validate_records_domain() {
        let current_root = vec!["stripchat.com".to_string()];

        // Case 1: Matching domain subdomain -> Ok
        let recs1 = vec![
            ParsedRecord::Subdomain { hostname: "sub.stripchat.com".to_string(), status_code: None },
            ParsedRecord::Subdomain { hostname: "skybriz.com".to_string(), status_code: None },
        ];
        assert!(validate_records_domain(&current_root, &recs1).is_ok());

        // Case 2: Completely non-matching domain -> Error
        let recs2 = vec![
            ParsedRecord::Subdomain { hostname: "skybriz.com".to_string(), status_code: None },
            ParsedRecord::Subdomain { hostname: "sub.skybriz.com".to_string(), status_code: None },
        ];
        let err = validate_records_domain(&current_root, &recs2).unwrap_err();
        if let ArgusError::Validation(msg) = err {
            assert_eq!(msg, "import reports of the projects domain");
        } else {
            panic!("Expected Validation error");
        }

        // Case 3: Empty records -> Ok
        let recs3 = vec![];
        assert!(validate_records_domain(&current_root, &recs3).is_ok());

        // Case 4: Only IPs -> Ok (generic)
        let recs4 = vec![
            ParsedRecord::IpAddress { ip: "1.1.1.1".to_string(), host: None },
        ];
        assert!(validate_records_domain(&current_root, &recs4).is_ok());
    }

    #[test]
    fn test_subfinder_plain_and_json() {
        let plain = "API.Target.COM.";
        let res1 = parse_line(plain, &ReconTool::Subfinder).unwrap().unwrap();
        if let ParsedRecord::Subdomain { hostname, .. } = res1 {
            assert_eq!(normalize_hostname(&hostname), "api.target.com");
        } else {
            panic!("Expected Subdomain");
        }

        let json_line = r#"{"host":"api.target.com","port":"443","input":"target.com","source":"certspotter"}"#;
        let res2 = parse_line(json_line, &ReconTool::Subfinder).unwrap().unwrap();
        if let ParsedRecord::Subdomain { hostname, .. } = res2 {
            assert_eq!(normalize_hostname(&hostname), "api.target.com");
        } else {
            panic!("Expected Subdomain");
        }
    }

    #[test]
    fn test_httpx_json_parsing_real_fixture() {
        let line = r#"{"url":"https://api.target.com","status_code":200,"content_length":4821,"title":"API Gateway","tech":["nginx","Go"],"cdn_name":"cloudflare","host":"api.target.com","ip":"104.21.3.142"}"#;
        let res = parse_line(line, &ReconTool::Httpx).unwrap().unwrap();
        if let ParsedRecord::Httpx { url, status_code, title, tech, ip, cdn, .. } = res {
            assert_eq!(url, "https://api.target.com");
            assert_eq!(status_code, Some(200));
            assert_eq!(title, Some("API Gateway".to_string()));
            assert_eq!(tech, vec!["nginx", "Go"]);
            assert_eq!(ip, Some("104.21.3.142".to_string()));
            assert_eq!(cdn, Some("cloudflare".to_string()));
        } else {
            panic!("Expected Httpx record");
        }
    }

    #[test]
    fn test_nmap_xml_parser() {
        let xml = r#"<?xml version="1.0"?>
        <nmaprun scanner="nmap">
          <host>
            <address addr="93.184.216.34" addrtype="ipv4"/>
            <hostnames><hostname name="mail.target.com"/></hostnames>
            <ports>
              <port protocol="tcp" portid="443">
                <state state="open"/>
                <service name="https" product="nginx"/>
              </port>
            </ports>
          </host>
        </nmaprun>"#;

        let (recs, skipped, errs) = parse_nmap_xml_content(xml);
        assert_eq!(skipped, 0);
        assert!(errs.is_empty());
        assert_eq!(recs.len(), 1);
        if let ParsedRecord::NmapHost { ip, hostname, ports } = &recs[0] {
            assert_eq!(ip, "93.184.216.34");
            assert_eq!(hostname.as_deref(), Some("mail.target.com"));
            assert_eq!(ports.len(), 1);
            assert_eq!(ports[0].port, 443);
            assert_eq!(ports[0].service, "https");
            assert_eq!(ports[0].product.as_deref(), Some("nginx"));
        } else {
            panic!("Expected NmapHost record");
        }
    }

    #[test]
    fn test_folder_name_domain_parsing() {
        let (name1, dom1) = parse_project_and_domain_from_folder_name("Test Data - Stripchat.com");
        assert_eq!(name1, "Stripchat.com");
        assert_eq!(dom1, "stripchat.com");

        let (name2, dom2) = parse_project_and_domain_from_folder_name("Test Data - 0din.ai");
        assert_eq!(name2, "0din.ai");
        assert_eq!(dom2, "0din.ai");

        let (name3, dom3) = parse_project_and_domain_from_folder_name("Test Data - skybriz.com");
        assert_eq!(name3, "skybriz.com");
        assert_eq!(dom3, "skybriz.com");
    }

    #[tokio::test]
    async fn test_real_target_folder_file_collection() {
        let target_dir = Path::new(r"X:\Develop\Projects\Passion\Argus\Argus-tauri\Test Data\Test Data - Target.com");
        if target_dir.exists() {
            let files = collect_files_recursively(target_dir).await.unwrap();
            assert!(files.len() >= 6, "Expected at least 6 files collected in Target.com");
        }
    }

    #[tokio::test]
    async fn test_db_inspect() {
        let db_path = "C:\\Users\\Krish\\AppData\\Roaming\\Argus\\a8735518-29b6-4089-be15-e318efdd062f.argus";
        if !std::path::Path::new(db_path).exists() {
            return;
        }
        let temp_path = "C:\\Users\\Krish\\AppData\\Roaming\\Argus\\temp_inspect.argus";
        std::fs::copy(db_path, temp_path).unwrap();
        println!("--- INSPECTING TARGET DATABASE ROOT & SKYBRIZ NODES ---");
        let pool = sqlx::SqlitePool::connect(&format!("sqlite:{}", temp_path)).await.unwrap();
        let nodes: Vec<(String, String, String, f64, i64)> = sqlx::query_as("SELECT id, type, label, score, is_favorite FROM nodes WHERE type = 'root' OR label = 'skybriz.com'")
            .fetch_all(&pool)
            .await
            .unwrap();
        for (id, t, l, s, f) in nodes {
            println!("id: {}, type: {}, label: {}, score: {}, is_favorite: {}", id, t, l, s, f);
        }
        std::fs::remove_file(temp_path).ok();
    }
}
