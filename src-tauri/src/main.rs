// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod error;
pub mod models;
pub mod state;
pub mod commands;

use state::AppState;

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Fix for NVIDIA + WebKitGTK DMA-BUF / GBM buffer failure and blank screen on Linux
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    tauri::Builder::default()
        .manage(AppState::new())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            // Project
            commands::project::project_new,
            commands::project::project_open,
            commands::project::project_save,
            commands::project::project_close,
            commands::project::project_list_recent,
            commands::project::project_delete,
            commands::project::project_export,
            commands::project::project_import,
            commands::project::project_add_domain,
            // Import
            commands::import::import_parse_file,
            commands::import::import_parse_folder,
            commands::import::import_create_project_from_folder,
            // Graph
            commands::graph::graph_list_available,
            commands::graph::graph_get_nodes,
            commands::graph::node_get_endpoints,
            commands::graph::project_get_all_endpoints,
            commands::graph::graph_get_edges,
            commands::graph::graph_diff,
            // Node Mutation
            commands::mutation::node_set_favorite,
            commands::mutation::node_add_tag,
            commands::mutation::node_remove_tag,
            commands::mutation::node_add_note,
            commands::mutation::node_hide,
            commands::mutation::node_unhide_all,
            commands::mutation::node_delete,
            commands::mutation::node_pin,
            commands::mutation::node_collapse,
            commands::mutation::node_set_position,
            commands::mutation::node_get_note,
            commands::mutation::node_get_tags,
            commands::mutation::project_get_all_tags,
            // Filter
            commands::filter::filter_save_preset,
            commands::filter::filter_list_presets,
            commands::filter::filter_delete_preset,
            // Export
            commands::export::export_png,
            commands::export::export_svg,
            commands::export::export_nodes_csv,
            commands::export::export_subdomains_txt,
            commands::export::export_active_subdomains_txt,
            commands::export::export_favorites_csv,
            commands::export::export_markdown_report,
            // App
            commands::app::app_get_version,
            commands::app::app_check_for_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
