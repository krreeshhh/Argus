import React from 'react';
import { useArgusStore } from '../store/useArgusStore';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { FiSliders, FiFile, FiEye, FiGrid, FiDownload, FiX } from 'react-icons/fi';
import type { ReconTool } from '../types';

export const SettingsModal: React.FC = () => {
  const {
    settingsModalOpen,
    setSettingsModalOpen,
    activeProject,
    stationOpen,
    scopeOpen,
    commandBarOpen,
    minimapOpen,
    gridOpen,
    activeLayout,
    selectedGraphIds,
    toggleStation,
    toggleScope,
    toggleCommandBar,
    toggleMinimap,
    toggleGrid,
    setLayout,
    clearFilters,
    importFile,
    importFolder,
    openProject,
    exportProject,
    importProject,
  } = useArgusStore();

  if (!settingsModalOpen) return null;

  // Custom Toggle Switch Component
  const ToggleSwitch: React.FC<{ checked: boolean; onChange: () => void }> = ({ checked, onChange }) => (
    <div
      onClick={onChange}
      style={{
        width: '34px',
        height: '18px',
        backgroundColor: checked ? '#a6e3a1' : '#313244',
        borderRadius: '9px',
        position: 'relative',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      }}
    >
      <div
        style={{
          width: '14px',
          height: '14px',
          backgroundColor: '#11111b',
          borderRadius: '50%',
          position: 'absolute',
          top: '2px',
          left: checked ? '18px' : '2px',
          transition: 'left 0.15s ease',
        }}
      />
    </div>
  );

  const handleImportFile = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Recon JSON/XML/TXT/CSV', extensions: ['json', 'xml', 'txt', 'csv'] }],
      });
      if (selected && typeof selected === 'string') {
        setSettingsModalOpen(false);
        // Deduce tool type
        let tool: ReconTool = 'Auto';
        const fileLower = selected.toLowerCase();
        if (fileLower.includes('httpx')) tool = 'Httpx';
        else if (fileLower.includes('subfinder')) tool = 'Subfinder';
        else if (fileLower.includes('nmap')) tool = 'Nmap';
        
        await importFile(selected, tool);
        alert('File imported successfully!');
      }
    } catch (err) {
      alert('Import failed: ' + String(err));
    }
  };

  const handleImportFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        setSettingsModalOpen(false);
        await importFolder(selected);
        alert('Folder scan data imported successfully!');
      }
    } catch (err) {
      alert('Import failed: ' + String(err));
    }
  };

  const handleExportProject = async () => {
    if (!activeProject) return;
    try {
      const target = await saveDialog({
        defaultPath: `${activeProject.name}.argus`,
        filters: [{ name: 'Argus Database', extensions: ['argus'] }],
      });
      if (target && typeof target === 'string') {
        await exportProject(target);
        alert('Project exported successfully!');
      }
    } catch (err) {
      alert('Export failed: ' + String(err));
    }
  };

  const handleImportProject = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Argus Database', extensions: ['argus'] }],
      });
      if (selected && typeof selected === 'string') {
        setSettingsModalOpen(false);
        const importedProj = await importProject(selected);
        alert(`Imported project "${importedProj.name}" successfully!`);
        await openProject(importedProj.id);
      }
    } catch (err) {
      alert('Import failed: ' + String(err));
    }
  };

  const handleExport = async (format: string) => {
    if (!activeProject) return;
    try {
      const ext = (format === 'ACTIVE_TXT' || format === 'TXT')
        ? 'txt'
        : (format === 'FAVORITES_CSV' || format === 'CSV')
        ? 'csv'
        : format.toLowerCase();
      const projectNameClean = activeProject.name;
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');
      const second = String(now.getSeconds()).padStart(2, '0');
      const timestamp = `${year}-${month}-${day} ${hour}-${minute}-${second}`;
      const defaultFilename = `${projectNameClean} Export ${timestamp}.${ext}`;

      const filePath = await saveDialog({
        defaultPath: defaultFilename,
        filters: [{ name: format, extensions: [ext] }],
      });
      if (!filePath) return;

      const gIds = selectedGraphIds.length > 0 ? selectedGraphIds : [activeProject.id];

      if (format === 'PNG') {
        const cy = (window as any).cy;
        const dataUrl = cy ? cy.png({ full: true }) : '';
        await invoke('export_png', { path: filePath, dataUrl });
      } else if (format === 'SVG') {
        const cy = (window as any).cy;
        const svgContent = cy ? cy.svg({ full: true }) : '<svg></svg>';
        await invoke('export_svg', { path: filePath, svgContent });
      } else if (format === 'CSV') {
        await invoke('export_nodes_csv', { projectId: activeProject.id, graphIds: gIds, path: filePath });
      } else if (format === 'TXT') {
        await invoke('export_subdomains_txt', { projectId: activeProject.id, graphIds: gIds, path: filePath });
      } else if (format === 'ACTIVE_TXT') {
        await invoke('export_active_subdomains_txt', { projectId: activeProject.id, graphIds: gIds, path: filePath });
      } else if (format === 'FAVORITES_CSV') {
        await invoke('export_favorites_csv', { projectId: activeProject.id, graphIds: gIds, path: filePath });
      } else if (format === 'MD') {
        await invoke('export_markdown_report', { projectId: activeProject.id, graphIds: gIds, path: filePath });
      }
      alert(`Exported successfully to ${filePath}`);
    } catch (err) {
      alert('Export failed: ' + String(err));
    }
  };

  // Styles
  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#cba6f7',
    borderBottom: '1px solid #313244',
    paddingBottom: '4px',
    marginTop: '6px',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: '11px',
    color: '#a6adc8',
  };

  const btnStyle: React.CSSProperties = {
    padding: '4px 10px',
    backgroundColor: '#313244',
    border: '1px solid #45475a',
    borderRadius: '4px',
    color: '#cdd6f4',
    fontSize: '10px',
    cursor: 'pointer',
    fontFamily: 'monospace',
    transition: 'background-color 0.15s ease',
  };

  const dangerBtnStyle: React.CSSProperties = {
    ...btnStyle,
    borderColor: 'rgba(243,139,168,0.3)',
    color: '#f38ba8',
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 550,
      }}
      onClick={() => setSettingsModalOpen(false)}
    >
      <div
        style={{
          width: '500px',
          backgroundColor: '#181825',
          border: '1px solid #313244',
          borderRadius: '6px',
          padding: '20px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          maxHeight: '85vh',
          overflowY: 'auto',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 'bold', color: '#89b4fa', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FiSliders size={14} />
            ARGUS SYSTEM SETTINGS
          </div>
          <button
            onClick={() => setSettingsModalOpen(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#6c7086',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '4px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#cdd6f4')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6c7086')}
          >
            <FiX size={16} />
          </button>
        </div>

        {/* FILE SETTINGS */}
        <div>
          <div style={sectionTitleStyle}>
            <FiFile size={12} /> FILE & DATA CONFIGURATIONS
          </div>
          <div style={rowStyle}>
            <span>Active Project:</span>
            <span style={{ color: '#89b4fa', fontWeight: 'bold' }}>
              {activeProject ? `${activeProject.name} (${activeProject.root_domain})` : 'None Opened'}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
            {activeProject && (
              <>
                <button
                  onClick={handleImportFile}
                  style={btnStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                >
                  Import Scan File
                </button>
                <button
                  onClick={handleImportFolder}
                  style={btnStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                >
                  Import Scan Folder
                </button>
                <button
                  onClick={handleExportProject}
                  style={btnStyle}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                >
                  Backup/Export Project (.argus)
                </button>
              </>
            )}
            <button
              onClick={handleImportProject}
              style={btnStyle}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
            >
              Import Project (.argus)
            </button>
          </div>
        </div>

        {/* VIEWPORT CONTROLS */}
        <div>
          <div style={sectionTitleStyle}>
            <FiEye size={12} /> VIEWPORT PANEL VISIBILITY
          </div>
          <div style={rowStyle}>
            <span>Show Left Station Sidebar</span>
            <ToggleSwitch checked={stationOpen} onChange={toggleStation} />
          </div>
          <div style={rowStyle}>
            <span>Show Right Scope Sidebar</span>
            <ToggleSwitch checked={scopeOpen} onChange={toggleScope} />
          </div>
          <div style={rowStyle}>
            <span>Show Bottom Command Bar</span>
            <ToggleSwitch checked={commandBarOpen} onChange={toggleCommandBar} />
          </div>
          <div style={rowStyle}>
            <span>Enable Cytoscape Minimap</span>
            <ToggleSwitch checked={minimapOpen} onChange={toggleMinimap} />
          </div>
          <div style={rowStyle}>
            <span>Display Grid Pattern Background</span>
            <ToggleSwitch checked={gridOpen} onChange={toggleGrid} />
          </div>
        </div>

        {/* GRAPH ALGORITHMS */}
        <div>
          <div style={sectionTitleStyle}>
            <FiGrid size={12} /> GRAPH & FILTER SYSTEM
          </div>
          <div style={rowStyle}>
            <span>Layout Rendering Algorithm:</span>
            <select
              value={activeLayout}
              onChange={(e) => setLayout(e.target.value as any)}
              style={{
                backgroundColor: '#1e1e2e',
                border: '1px solid #313244',
                color: '#cdd6f4',
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '4px',
                fontFamily: 'monospace',
                outline: 'none',
              }}
            >
              <option value="cola">Cola (Force-Directed)</option>
              <option value="dagre">Dagre (Hierarchical Tree)</option>
              <option value="breadthfirst">Breadth-First</option>
              <option value="circle">Circle</option>
              <option value="grid">Grid</option>
              <option value="preset">Preset Positions</option>
            </select>
          </div>
          {activeProject && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
              <button
                onClick={() => {
                  setSettingsModalOpen(false);
                  clearFilters();
                }}
                style={dangerBtnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(243,139,168,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Reset Graph & Filters
              </button>
            </div>
          )}
        </div>

        {/* EXPORTS */}
        {activeProject && (
          <div>
            <div style={sectionTitleStyle}>
              <FiDownload size={12} /> EXPORT DATASETS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <button
                onClick={() => handleExport('PNG')}
                style={btnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
              >
                PNG
              </button>
              <button
                onClick={() => handleExport('SVG')}
                style={btnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
              >
                SVG
              </button>
              <button
                onClick={() => handleExport('CSV')}
                style={btnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
              >
                Nodes CSV
              </button>
              <button
                onClick={() => handleExport('TXT')}
                style={btnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
              >
                Subdomains TXT
              </button>
              <button
                onClick={() => handleExport('MD')}
                style={btnStyle}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
              >
                Markdown Report
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
