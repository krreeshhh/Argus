export interface Project {
  id: string;
  name: string;
  root_domain: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  root_domain: string;
  node_count: number;
  finding_count: number;
  updated_at: string;
}

export interface Graph {
  id: string;
  project_id: string;
  name: string;
  root_domain: string;
  source_scan_label: string;
  node_count: number;
  edge_count: number;
  created_at: string;
}

export type NodeType = 'root' | 'subdomain' | 'endpoint' | 'ip' | 'technology' | 'finding' | 'port' | 'jsfile';

export interface Node {
  id: string;
  graph_id: string;
  type: NodeType;
  label: string;
  status_code: number | null;
  ip: string | null;
  cdn: string | null;
  title: string | null;
  page_size: number | null;
  found_by: string | null;
  score: number;
  is_favorite: number;
  is_pinned: number;
  is_collapsed: number;
  parent_id: string | null;
  pos_x: number | null;
  pos_y: number | null;
  created_at: string;
  child_count?: number;
  max_hidden_severity?: 'critical' | 'high' | 'medium' | 'low' | 'info';
}

export interface Edge {
  id: string;
  graph_id: string;
  source_node_id: string;
  target_node_id: string;
  relation: string;
}

export interface Finding {
  id: string;
  node_id: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  source_tool: string;
  created_at: string;
}

export interface Tag {
  id: string;
  node_id: string;
  label: string;
}

export interface Note {
  id: string;
  node_id: string;
  body: string;
  updated_at: string;
}

export interface FilterSpec {
  only_alive?: boolean;
  only_dead?: boolean;
  only_findings?: boolean;
  only_favorites?: boolean;
  status_codes?: number[];
  search_query?: string;
  tags?: string[];
}

export type ReconTool = 'Auto' | 'Subfinder' | 'Httpx' | 'Katana' | 'Nuclei' | 'Nmap' | 'Gau' | 'Js';

export interface ImportSummary {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface FolderImportSummary {
  files_processed: number;
  imported_nodes: number;
  subdomains_count: number;
  endpoints_count: number;
  findings_count: number;
  ips_count: number;
  tech_count: number;
  skipped: number;
  errors: string[];
  detected_target_domain?: string | null;
}

export interface NodeChange {
  node_id: string;
  label: string;
  old_status: number | null;
  new_status: number | null;
  new_findings: number;
}

export interface DiffResult {
  added: Node[];
  removed: Node[];
  changed: NodeChange[];
}

export type GraphLayout = 'cola' | 'breadthfirst' | 'circle' | 'grid' | 'dagre' | 'preset';
