use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub root_domain: String,
    pub schema_version: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub root_domain: String,
    pub node_count: i64,
    pub finding_count: i64,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Graph {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub root_domain: String,
    pub source_scan_label: String,
    pub node_count: i64,
    pub edge_count: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Node {
    pub id: String,
    pub graph_id: String,
    pub r#type: String, // 'root' | 'subdomain' | 'endpoint' | 'ip' | 'technology' | 'finding'
    pub label: String,
    pub status_code: Option<i64>,
    pub ip: Option<String>,
    pub cdn: Option<String>,
    pub title: Option<String>,
    pub page_size: Option<i64>,
    pub found_by: Option<String>,
    pub score: f64,
    pub is_favorite: i64,
    pub is_pinned: i64,
    pub is_collapsed: i64,
    pub parent_id: Option<String>,
    pub pos_x: Option<f64>,
    pub pos_y: Option<f64>,
    pub created_at: String,

    #[sqlx(default)]
    pub child_count: Option<i64>,
    #[sqlx(default)]
    pub max_hidden_severity: Option<String>, // 'critical' | 'high' | 'medium' | 'low' | 'info'
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Edge {
    pub id: String,
    pub graph_id: String,
    pub source_node_id: String,
    pub target_node_id: String,
    pub relation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Finding {
    pub id: String,
    pub node_id: String,
    pub severity: String, // 'critical' | 'high' | 'medium' | 'low' | 'info'
    pub title: String,
    pub description: String,
    pub source_tool: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Tag {
    pub id: String,
    pub node_id: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Note {
    pub id: String,
    pub node_id: String,
    pub body: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct FilterPreset {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub filter_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterSpec {
    pub only_alive: Option<bool>,
    pub only_dead: Option<bool>,
    pub only_findings: Option<bool>,
    pub only_favorites: Option<bool>,
    pub status_codes: Option<Vec<i64>>,
    pub search_query: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ReconTool {
    Auto,
    Subfinder,
    Httpx,
    Katana,
    Nuclei,
    Nmap,
    Gau,
    Js,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportSummary {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderImportSummary {
    pub files_processed: usize,
    pub imported_nodes: usize,
    pub subdomains_count: usize,
    pub endpoints_count: usize,
    pub findings_count: usize,
    pub ips_count: usize,
    pub tech_count: usize,
    pub skipped: usize,
    pub errors: Vec<String>,
    pub detected_target_domain: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeChange {
    pub node_id: String,
    pub label: String,
    pub old_status: Option<i64>,
    pub new_status: Option<i64>,
    pub new_findings: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffResult {
    pub added: Vec<Node>,
    pub removed: Vec<Node>,
    pub changed: Vec<NodeChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateStatus {
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
}
