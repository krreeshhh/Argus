-- Migration to add project viewport settings state persistence
CREATE TABLE IF NOT EXISTS viewport_state (
    project_id TEXT PRIMARY KEY,
    filters_json TEXT NOT NULL DEFAULT '{}',
    focus_node_id TEXT,
    active_layout TEXT NOT NULL DEFAULT 'cola',
    station_open INTEGER NOT NULL DEFAULT 1,
    scope_open INTEGER NOT NULL DEFAULT 1,
    command_bar_open INTEGER NOT NULL DEFAULT 1,
    minimap_open INTEGER NOT NULL DEFAULT 1,
    grid_open INTEGER NOT NULL DEFAULT 1
);
