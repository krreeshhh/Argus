import React, { useEffect, useState } from 'react';
import { useArgusStore } from '../store/useArgusStore';
import { safeListen } from '../utils/tauri';
import { invoke } from '@tauri-apps/api/core';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { FiRefreshCw } from 'react-icons/fi';

export const CommandBar: React.FC = () => {
  const {
    activeProject,
    nodes,
    recentProjects,
    diffMode,
    diffResult,
    loadSelectedGraphs,
    triggerStatsFlash,
    exitDiffMode,
    selectedGraphIds,
    createProject,
    openProject,
    importFolder,
    toggleStation,
    toggleScope,
    toggleCommandBar,
    toggleMinimap,
    toggleGrid,
    setLayout,
    setFilters,
    clearFilters,
    setShortcutOverlayOpen,
    setSettingsModalOpen,
    saveProject,
    exportProject,
    importProject,
    selectNode,
  } = useArgusStore();

  const [highlightNum, setHighlightNum] = useState(false);

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    safeListen('graph://refresh', () => {
      triggerStatsFlash();
      loadSelectedGraphs();
    }).then((unlisten) => {
      unlistenFn = unlisten;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // Trigger brief highlighting flash when nodes count changes (e.g. after import)
  useEffect(() => {
    if (nodes.length > 0) {
      setHighlightNum(true);
      const timer = setTimeout(() => setHighlightNum(false), 800);
      return () => clearTimeout(timer);
    }
  }, [nodes.length]);

  const subdomainsCount = nodes.filter((n) => n.type === 'subdomain').length;
  const endpointsCount = nodes.filter((n) => n.type === 'endpoint').length;
  const findingsCount = nodes.filter((n) => n.type === 'finding').length;
  const ipsCount = nodes.filter((n) => n.type === 'ip').length;
  const techCount = nodes.filter((n) => n.type === 'technology').length;

  const currentSummary = recentProjects.find((p) => p.id === activeProject?.id);
  const totalDbNodes = currentSummary ? currentSummary.node_count : nodes.length;

  // Search Palette State
  const [searchQuery, setSearchQuery] = useState('');
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Debounced search for endpoints from DB
  useEffect(() => {
    if (!activeProject || !searchQuery.trim()) {
      setEndpoints([]);
      return;
    }
    const timer = setTimeout(() => {
      invoke<{ endpoints: any[]; total_count: number }>('project_get_all_endpoints', {
        projectId: activeProject.id,
        searchQuery: searchQuery,
        offset: 0,
        limit: 10,
      })
      .then(res => {
        setEndpoints(res?.endpoints || []);
      })
      .catch(err => {
        console.error('Error fetching endpoints:', err);
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery, activeProject]);

  // Helper handlers for command palette features
  const handleNewProject = async () => {
    const name = prompt("Enter Project Name:");
    if (!name) return;
    const rootDomain = prompt("Enter Root Domain (e.g. example.com):");
    if (!rootDomain) return;
    try {
      await createProject(name, rootDomain);
    } catch (err) {
      alert("Failed to create project: " + String(err));
    }
  };

  const handleOpenProject = async () => {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: 'Argus Database', extensions: ['argus'] }],
      });
      if (selected && typeof selected === 'string') {
        const filename = selected.split(/[\\/]/).pop() || '';
        const id = filename.replace(/\.argus$/, '');
        if (id) {
          await openProject(id);
        }
      }
    } catch (err) {
      alert("Failed to open project: " + String(err));
    }
  };

  const handleImport = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === 'string') {
        await importFolder(selected);
      }
    } catch (err) {
      alert("Import failed: " + String(err));
    }
  };

  const handleSaveProject = async () => {
    if (!activeProject) return;
    try {
      await saveProject();
      alert("Project saved successfully.");
    } catch (err) {
      alert("Save failed: " + String(err));
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
        const importedProj = await importProject(selected);
        alert(`Imported project "${importedProj.name}" successfully!`);
        openProject(importedProj.id);
      }
    } catch (err) {
      alert('Import failed: ' + String(err));
    }
  };

  const handleQuit = async () => {
    try {
      await getCurrentWindow().close();
    } catch {
      window.close();
    }
  };

  const handleZoom = (type: 'in' | 'out') => {
    const cy = (window as any).cy;
    if (cy) {
      const scale = type === 'in' ? 1.1 : 0.9;
      cy.zoom(cy.zoom() * scale);
    }
  };

  const handleFit = () => {
    const cy = (window as any).cy;
    if (cy) {
      cy.fit(cy.elements(':visible'), 60);
    }
  };

  const handleFullscreen = async () => {
    try {
      const win = getCurrentWindow();
      const isFS = await win.isFullscreen();
      await win.setFullscreen(!isFS);
    } catch {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const handleExportMenu = async (format: string) => {
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
        filters: [
          {
            name: format,
            extensions: [ext],
          },
        ],
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

  const handleCopyTool = (type: 'alive' | 'favorites' | 'root') => {
    if (!activeProject) return;
    let text = '';
    if (type === 'alive') {
      text = nodes
        .filter((n) => n.type === 'subdomain' && n.status_code !== null && n.status_code !== undefined && n.status_code >= 100 && n.status_code < 500)
        .map((n) => n.label)
        .join('\n');
    } else if (type === 'favorites') {
      text = nodes
        .filter((n) => n.is_favorite === 1 || n.score > 0.7)
        .map((n) => n.label)
        .join('\n');
    } else if (type === 'root') {
      text = activeProject.root_domain;
    }
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const featuresList = [
    { label: 'New Project', action: handleNewProject },
    { label: 'Open Project...', action: handleOpenProject },
    { label: 'Save Project', action: handleSaveProject },
    { label: 'Export Project (.argus)', action: handleExportProject },
    { label: 'Import Scan Folder', action: handleImport },
    { label: 'Import Project (.argus)', action: handleImportProject },
    { label: 'Quit Argus', action: handleQuit },
    { label: 'Toggle Control Station', action: toggleStation },
    { label: 'Toggle Scope Inspector', action: toggleScope },
    { label: 'Toggle Command/Status Bar', action: toggleCommandBar },
    { label: 'Toggle Minimap', action: toggleMinimap },
    { label: 'Toggle Grid', action: toggleGrid },
    { label: 'Zoom In', action: () => handleZoom('in') },
    { label: 'Zoom Out', action: () => handleZoom('out') },
    { label: 'Fit to Screen', action: handleFit },
    { label: 'Toggle Full Screen', action: handleFullscreen },
    { label: 'Layout: Cola (force-directed)', action: () => setLayout('cola') },
    { label: 'Layout: Tree (hierarchical)', action: () => setLayout('dagre') },
    { label: 'Layout: Circle', action: () => setLayout('circle') },
    { label: 'Layout: Grid', action: () => setLayout('grid') },
    { label: 'Filter: Show Only Alive', action: () => setFilters({ only_alive: true }) },
    { label: 'Filter: Show Only Dead', action: () => setFilters({ only_dead: true }) },
    { label: 'Filter: Show Only Findings', action: () => setFilters({ only_findings: true }) },
    { label: 'Filter: Show Only Favorites', action: () => setFilters({ only_favorites: true }) },
    { label: 'Clear All Filters', action: clearFilters },
    { label: 'Export PNG Image', action: () => handleExportMenu('PNG') },
    { label: 'Export SVG Vector', action: () => handleExportMenu('SVG') },
    { label: 'Export Nodes CSV', action: () => handleExportMenu('CSV') },
    { label: 'Export Subdomains TXT', action: () => handleExportMenu('TXT') },
    { label: 'Export Active Subdomains TXT', action: () => handleExportMenu('ACTIVE_TXT') },
    { label: 'Export Favorites CSV', action: () => handleExportMenu('FAVORITES_CSV') },
    { label: 'Export Full Report (Markdown)', action: () => handleExportMenu('MD') },
    { label: 'Copy All Alive Subdomains', action: () => handleCopyTool('alive') },
    { label: 'Copy All Favorites', action: () => handleCopyTool('favorites') },
    { label: 'Copy Root Domain', action: () => handleCopyTool('root') },
    { label: 'Keyboard Shortcuts', action: () => setShortcutOverlayOpen(true) },
    { label: 'Open Settings', action: () => setSettingsModalOpen(true) },
  ];

  const matchedFeatures = searchQuery.trim()
    ? featuresList.filter(f => f.label.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
    : [];

  const matchedSubdomains = searchQuery.trim()
    ? nodes.filter(n => n.type === 'subdomain' && n.label.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 5)
    : [];

  const matchedEndpoints = endpoints.slice(0, 5);

  const allItems = [
    ...matchedSubdomains.map(s => ({ type: 'subdomain', label: s.label, item: s })),
    ...matchedEndpoints.map(e => ({ type: 'endpoint', label: e.label, item: e })),
    ...matchedFeatures.map(f => ({ type: 'feature', label: f.label, item: f })),
  ];

  const handleSelectResult = (selected: { type: string; label: string; item: any }) => {
    if (selected.type === 'subdomain') {
      selectNode(selected.item);
      const cy = (window as any).cy;
      if (cy) {
        const el = cy.getElementById(selected.item.id);
        if (el.length > 0) {
          cy.animate({
            center: { eles: el },
            zoom: 1.5,
            duration: 300
          });
        }
      }
    } else if (selected.type === 'endpoint') {
      selectNode(selected.item);
      const store = useArgusStore.getState();
      if (!store.scopeOpen) {
        store.toggleScope();
      }
    } else if (selected.type === 'feature') {
      selected.item.action();
    }
    setSearchQuery('');
    setSearchFocused(false);
  };

  const numberStyle = (originalColor: string): React.CSSProperties => ({
    color: highlightNum ? '#89b4fa' : originalColor,
    fontWeight: 'bold',
    transition: 'color 0.4s ease',
  });

  const dividerStyle: React.CSSProperties = {
    color: '#313244',
    margin: '0 8px',
  };

  const labelStyle: React.CSSProperties = {
    color: '#6c7086',
  };

  if (diffMode && diffResult) {
    return (
      <div
        style={{
          height: '22px',
          backgroundColor: '#181825',
          borderTop: '1px solid #313244',
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          fontSize: '11px',
          color: '#fab387',
          gap: '4px',
          fontFamily: 'monospace',
        }}
      >
        <span style={{ fontWeight: 'bold' }}>SCAN DIFF MODE</span>
        <span style={dividerStyle}>|</span>
        <span style={{ color: '#a6e3a1' }}>+{diffResult.added.length} new</span>
        <span style={dividerStyle}>|</span>
        <span style={{ color: '#6c7086' }}>-{diffResult.removed.length} removed</span>
        <span style={dividerStyle}>|</span>
        <span style={{ color: '#f9e2af' }}>~{diffResult.changed.length} changed</span>

        <button
          onClick={exitDiffMode}
          style={{
            marginLeft: 'auto',
            padding: '1px 6px',
            fontSize: '9px',
            color: '#f38ba8',
            backgroundColor: 'transparent',
            border: '1px solid #f38ba8',
            fontFamily: 'monospace',
            cursor: 'pointer',
          }}
        >
          [EXIT DIFF MODE]
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '22px',
        backgroundColor: '#181825',
        borderTop: '1px solid #313244',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        fontSize: '11px',
        color: '#6c7086',
        gap: '2px',
        fontFamily: 'monospace',
      }}
    >
      <span style={labelStyle}>project: </span>
      <span style={{ color: '#cdd6f4', marginRight: '4px' }}>
        {activeProject ? activeProject.name : 'none'}
      </span>

      <span style={dividerStyle}>|</span>

      <span style={labelStyle}>domains: </span>
      <span style={numberStyle('#cdd6f4')}>{subdomainsCount}</span>

      <span style={dividerStyle}>|</span>

      <span style={labelStyle}>endpoints: </span>
      <span style={numberStyle('#cdd6f4')}>{endpointsCount}</span>

      <span style={dividerStyle}>|</span>

      <span style={labelStyle}>findings: </span>
      <span style={numberStyle('#cdd6f4')}>{findingsCount}</span>

      <span style={dividerStyle}>|</span>

      <span style={labelStyle}>ips: </span>
      <span style={numberStyle('#cdd6f4')}>{ipsCount}</span>

      <span style={dividerStyle}>|</span>

      <span style={labelStyle}>tech: </span>
      <span style={numberStyle('#cdd6f4')}>{techCount}</span>

      <span style={dividerStyle}>|</span>

      <span style={labelStyle}>nodes: </span>
      <span style={numberStyle('#cdd6f4')}>{nodes.length}</span>
      <span style={labelStyle}> visible / </span>
      <span style={numberStyle('#cdd6f4')}>{totalDbNodes}</span>
      <span style={labelStyle}> total</span>

      {activeProject && (
        <div
          style={{
            marginLeft: 'auto',
            marginRight: '8px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            zIndex: 600,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            placeholder="Search subdomain, endpoint, feature..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => {
              setTimeout(() => setSearchFocused(false), 200);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % Math.max(1, allItems.length));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + allItems.length) % Math.max(1, allItems.length));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                const selected = allItems[selectedIndex];
                if (selected) {
                  handleSelectResult(selected);
                }
              } else if (e.key === 'Escape') {
                setSearchQuery('');
                e.currentTarget.blur();
              }
            }}
            style={{
              width: '240px',
              height: '16px',
              backgroundColor: '#1e1e2e',
              border: searchFocused ? '1px solid #89b4fa' : '1px solid #313244',
              color: '#cdd6f4',
              fontSize: '10px',
              fontFamily: 'monospace',
              padding: '0 18px 0 6px',
              transition: 'border-color 0.15s ease',
              outline: 'none',
              borderRadius: 0,
            }}
          />
          {searchQuery && (
            <span
              onClick={() => {
                setSearchQuery('');
                setSelectedIndex(0);
              }}
              style={{
                position: 'absolute',
                right: '6px',
                cursor: 'pointer',
                color: '#6c7086',
                fontSize: '9px',
                fontWeight: 'bold',
              }}
            >
              ×
            </span>
          )}

          {searchFocused && (searchQuery.trim() || allItems.length > 0) && (
            <div
              style={{
                position: 'absolute',
                bottom: '22px',
                right: 0,
                width: '440px',
                backgroundColor: '#181825',
                border: '1px solid #313244',
                maxHeight: '320px',
                overflowY: 'auto',
                zIndex: 1000,
                fontFamily: 'monospace',
                fontSize: '11px',
                boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.5)',
              }}
            >
              {allItems.length === 0 ? (
                <div style={{ padding: '8px 12px', color: '#585b70' }}>
                  No matching results
                </div>
              ) : (
                <div>
                  {matchedSubdomains.length > 0 && (
                    <div>
                      <div style={{ padding: '4px 8px', backgroundColor: '#11111b', color: '#89b4fa', fontWeight: 'bold', fontSize: '9px', borderBottom: '1px solid #313244' }}>
                        🌐 SUBDOMAINS
                      </div>
                      {matchedSubdomains.map((sub) => {
                        const globalIdx = allItems.findIndex(x => x.item.id === sub.id && x.type === 'subdomain');
                        const isSelected = globalIdx === selectedIndex;
                        return (
                          <div
                            key={sub.id}
                            onMouseDown={() => handleSelectResult({ type: 'subdomain', label: sub.label, item: sub })}
                            style={{
                              padding: '6px 12px',
                              cursor: 'pointer',
                              backgroundColor: isSelected ? '#313244' : 'transparent',
                              color: isSelected ? '#89b4fa' : '#cdd6f4',
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' }}>
                              {sub.label}
                            </span>
                            {sub.status_code !== null && (
                              <span style={{ color: '#a6e3a1', marginLeft: '8px' }}>
                                [{sub.status_code}]
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {matchedEndpoints.length > 0 && (
                    <div>
                      <div style={{ padding: '4px 8px', backgroundColor: '#11111b', color: '#cba6f7', fontWeight: 'bold', fontSize: '9px', borderBottom: '1px solid #313244' }}>
                        🔗 ENDPOINTS
                      </div>
                      {matchedEndpoints.map((ep) => {
                        const globalIdx = allItems.findIndex(x => x.item.id === ep.id && x.type === 'endpoint');
                        const isSelected = globalIdx === selectedIndex;
                        return (
                          <div
                            key={ep.id}
                            onMouseDown={() => handleSelectResult({ type: 'endpoint', label: ep.label, item: ep })}
                            style={{
                              padding: '6px 12px',
                              cursor: 'pointer',
                              backgroundColor: isSelected ? '#313244' : 'transparent',
                              color: isSelected ? '#cba6f7' : '#cdd6f4',
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' }} title={ep.label}>
                              {ep.label}
                            </span>
                            {ep.status_code !== null && (
                              <span style={{ color: '#a6e3a1', marginLeft: '8px' }}>
                                [{ep.status_code}]
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {matchedFeatures.length > 0 && (
                    <div>
                      <div style={{ padding: '4px 8px', backgroundColor: '#11111b', color: '#f9e2af', fontWeight: 'bold', fontSize: '9px', borderBottom: '1px solid #313244' }}>
                        ⚙️ APPLICATION FEATURES
                      </div>
                      {matchedFeatures.map((feat) => {
                        const globalIdx = allItems.findIndex(x => x.label === feat.label && x.type === 'feature');
                        const isSelected = globalIdx === selectedIndex;
                        return (
                          <div
                            key={feat.label}
                            onMouseDown={() => handleSelectResult({ type: 'feature', label: feat.label, item: feat })}
                            style={{
                              padding: '6px 12px',
                              cursor: 'pointer',
                              backgroundColor: isSelected ? '#313244' : 'transparent',
                              color: isSelected ? '#f9e2af' : '#cdd6f4',
                            }}
                          >
                            {feat.label}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => window.location.reload()}
        title="Refresh application"
        style={{
          marginLeft: activeProject ? '0' : 'auto',
          padding: '0',
          width: '18px',
          height: '16px',
          border: '1px solid #45475a',
          backgroundColor: 'transparent',
          color: '#6c7086',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#cdd6f4';
          e.currentTarget.style.borderColor = '#6c7086';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = '#6c7086';
          e.currentTarget.style.borderColor = '#45475a';
        }}
      >
        <FiRefreshCw style={{ fontSize: '9px' }} />
      </button>
    </div>
  );
};
