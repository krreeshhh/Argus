-- Initial Schema Migration for Argus

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_domain TEXT NOT NULL,
    schema_version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS graphs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    root_domain TEXT NOT NULL,
    source_scan_label TEXT NOT NULL,
    node_count INTEGER NOT NULL DEFAULT 0,
    edge_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    graph_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'root' | 'subdomain' | 'endpoint' | 'ip' | 'technology' | 'finding'
    label TEXT NOT NULL,
    status_code INTEGER,
    ip TEXT,
    cdn TEXT,
    title TEXT,
    page_size INTEGER,
    found_by TEXT,
    score REAL NOT NULL DEFAULT 0.0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_collapsed INTEGER NOT NULL DEFAULT 0,
    parent_id TEXT,
    pos_x REAL,
    pos_y REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(graph_id) REFERENCES graphs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_nodes_graph_id ON nodes(graph_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type);
CREATE INDEX IF NOT EXISTS idx_nodes_label ON nodes(label);
CREATE INDEX IF NOT EXISTS idx_nodes_status_code ON nodes(status_code);

CREATE TABLE IF NOT EXISTS edges (
    id TEXT PRIMARY KEY,
    graph_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    relation TEXT NOT NULL,
    FOREIGN KEY(graph_id) REFERENCES graphs(id) ON DELETE CASCADE,
    FOREIGN KEY(source_node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY(target_node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_edges_graph_id ON edges(graph_id);

CREATE TABLE IF NOT EXISTS findings (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    severity TEXT NOT NULL, -- 'critical' | 'high' | 'medium' | 'low' | 'info'
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    source_tool TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_findings_node_id ON findings(node_id);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    label TEXT NOT NULL,
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL UNIQUE,
    body TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS filter_presets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    filter_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS screenshots (
    id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    FOREIGN KEY(node_id) REFERENCES nodes(id) ON DELETE CASCADE
);
