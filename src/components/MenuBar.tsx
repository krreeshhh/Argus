import React, { useState, useEffect, useRef } from 'react';
import { useArgusStore } from '../store/useArgusStore';
import { invoke } from '@tauri-apps/api/core';
import { open as openShell } from '@tauri-apps/plugin-shell';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const MenuBar: React.FC = () => {
  const {
    activeProject,
    recentProjects,
    selectedGraphIds,
    nodes,
    filters,
    createProject,
    openProject,
    closeProject,
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
    exportProject,
    importProject,
    endpointsModalOpen,
    setEndpointsModalOpen,
  } = useArgusStore();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [isMaximized, setIsMaximized] = useState(false);
  const [projectTags, setProjectTags] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  // Synchronize window maximized state
  useEffect(() => {
    const checkMax = async () => {
      try {
        const win = getCurrentWindow();
        const max = await win.isMaximized();
        setIsMaximized(max);
      } catch {}
    };
    checkMax();
    window.addEventListener('resize', checkMax);
    return () => window.removeEventListener('resize', checkMax);
  }, []);

  useEffect(() => {
    if (activeProject && openMenu === 'filter') {
      invoke<string[]>('project_get_all_tags', { projectId: activeProject.id })
        .then((tags) => setProjectTags(tags || []))
        .catch((err) => console.error('Failed to fetch tags for filtering:', err));
    }
  }, [activeProject, openMenu]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



  const handleMenuClick = (menuName: string) => {
    if (openMenu === menuName) {
      setOpenMenu(null);
    } else {
      setOpenMenu(menuName);
    }
  };

  const handleMenuHover = (menuName: string) => {
    if (openMenu !== null) {
      setOpenMenu(menuName);
    }
  };

  const handleNewProject = async () => {
    setOpenMenu(null);
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
    setOpenMenu(null);
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
    setOpenMenu(null);
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



  const handleExportProject = async () => {
    setOpenMenu(null);
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
    setOpenMenu(null);
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
    setOpenMenu(null);
    try {
      await getCurrentWindow().close();
    } catch {
      window.close();
    }
  };

  const handleZoom = (type: 'in' | 'out') => {
    setOpenMenu(null);
    const cy = (window as any).cy;
    if (cy) {
      const scale = type === 'in' ? 1.1 : 0.9;
      cy.zoom(cy.zoom() * scale);
    }
  };

  const handleFit = () => {
    setOpenMenu(null);
    const cy = (window as any).cy;
    if (cy) {
      cy.fit(cy.elements(':visible'), 60);
    }
  };

  const handleFullscreen = async () => {
    setOpenMenu(null);
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
    setOpenMenu(null);
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
    setOpenMenu(null);
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

  const handleExternalLink = (url: string) => {
    setOpenMenu(null);
    openShell(url).catch(() => window.open(url, '_blank'));
  };

  // Window control triggers
  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {}
  };

  const handleMaximize = async () => {
    try {
      const win = getCurrentWindow();
      if (await win.isMaximized()) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
      setIsMaximized(await win.isMaximized());
    } catch {}
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().close();
    } catch {}
  };

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button === 0) {
      try {
        await getCurrentWindow().startDragging();
      } catch {}
    }
  };

  const menuStyle = (name: string): React.CSSProperties => ({
    padding: '4px 8px',
    cursor: 'pointer',
    backgroundColor: openMenu === name ? '#45475a' : 'transparent',
    color: openMenu === name ? '#89b4fa' : '#cdd6f4',
    fontWeight: openMenu === name ? 'bold' : 'normal',
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    userSelect: 'none',
  });

  const dropdownContainerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '30px',
    backgroundColor: '#313244',
    border: '1px solid #181825',
    boxShadow: 'none',
    zIndex: 500,
    minWidth: '200px',
    padding: '4px 0',
    fontFamily: 'monospace',
    fontSize: '12px',
  };

  const itemStyle: React.CSSProperties = {
    padding: '4px 12px',
    cursor: 'pointer',
    color: '#cdd6f4',
    display: 'flex',
    justifyContent: 'space-between',
    userSelect: 'none',
  };

  const separatorStyle: React.CSSProperties = {
    height: '1px',
    backgroundColor: '#181825',
    margin: '4px 0',
  };

  return (
    <div
      ref={menuRef}
      style={{
        height: '30px',
        backgroundColor: '#313244',
        borderBottom: '1px solid #181825',
        display: 'flex',
        alignItems: 'center',
        padding: '0 0 0 8px',
        fontSize: '12px',
        color: '#cdd6f4',
        zIndex: 500,
        position: 'relative',
        fontFamily: 'monospace',
        userSelect: 'none',
      }}
    >
      {/* Left side: Logo & Menu Items */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
       

        {/* FILE */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => handleMenuClick('file')}
            onMouseEnter={() => handleMenuHover('file')}
            style={menuStyle('file')}
          >
            File
          </div>
          {openMenu === 'file' && (
            <div style={{ ...dropdownContainerStyle, left: 0 }}>
              <div
                style={itemStyle}
                onClick={handleNewProject}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>New</span>
                <span style={{ color: '#585b70' }}>Ctrl+N</span>
              </div>
              <div
                style={itemStyle}
                onClick={handleOpenProject}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Open...</span>
                <span style={{ color: '#585b70' }}>Ctrl+O</span>
              </div>

              {/* OPEN RECENT SUBMENU */}
              <div style={separatorStyle} />
              <div style={{ padding: '4px 12px', color: '#6c7086', fontWeight: 'bold', fontSize: '10px' }}>OPEN RECENT</div>
              {recentProjects.length === 0 ? (
                <p style={{ padding: '4px 20px', color: '#6c7086', fontSize: '11px', fontStyle: 'italic', margin: 0 }}>No recent</p>
              ) : (
                recentProjects.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    style={{ ...itemStyle, paddingLeft: '20px' }}
                    onClick={() => {
                      setOpenMenu(null);
                      openProject(p.id);
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <span>{p.name}</span>
                  </div>
                ))
              )}

              <div style={separatorStyle} />
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  closeProject();
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Close</span>
                <span style={{ color: '#585b70' }}>Ctrl+W</span>
              </div>
              <div
                style={itemStyle}
                onClick={handleImport}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Import Scan Folder</span>
                <span style={{ color: '#585b70' }}>Ctrl+I</span>
              </div>
              <div
                style={itemStyle}
                onClick={handleImportProject}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Import Project (.argus)</span>
              </div>
              <div style={separatorStyle} />
              <div
                style={itemStyle}
                onClick={handleQuit}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Quit</span>
                <span style={{ color: '#585b70' }}>Ctrl+Q</span>
              </div>
            </div>
          )}
        </div>

        {/* VIEW */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => handleMenuClick('view')}
            onMouseEnter={() => handleMenuHover('view')}
            style={menuStyle('view')}
          >
            View
          </div>
          {openMenu === 'view' && (
            <div style={{ ...dropdownContainerStyle, left: 0 }}>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  toggleStation();
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Toggle Station</span>
                <span style={{ color: '#585b70' }}>Ctrl+B</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  toggleScope();
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Toggle Scope</span>
                <span style={{ color: '#585b70' }}>Ctrl+J</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  setEndpointsModalOpen(!endpointsModalOpen);
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Project Endpoints</span>
                <span style={{ color: '#585b70' }}>Ctrl+E</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  toggleCommandBar();
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Toggle Command Bar</span>
                <span style={{ color: '#585b70' }}>Ctrl+L</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  toggleMinimap();
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Toggle Minimap</span>
                <span style={{ color: '#585b70' }}>Ctrl+M</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  toggleGrid();
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Toggle Grid</span>
                <span style={{ color: '#585b70' }}>Ctrl+G</span>
              </div>
              <div style={separatorStyle} />
              <div
                style={itemStyle}
                onClick={() => handleZoom('in')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Zoom In</span>
                <span style={{ color: '#585b70' }}>Ctrl++</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => handleZoom('out')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Zoom Out</span>
                <span style={{ color: '#585b70' }}>Ctrl+-</span>
              </div>
              <div
                style={itemStyle}
                onClick={handleFit}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Fit to Screen</span>
                <span style={{ color: '#585b70' }}>Ctrl+Shift+F</span>
              </div>
              <div style={separatorStyle} />
              <div
                style={itemStyle}
                onClick={handleFullscreen}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Full Screen</span>
                <span style={{ color: '#585b70' }}>F11</span>
              </div>
            </div>
          )}
        </div>

        {/* GRAPH */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => handleMenuClick('graph')}
            onMouseEnter={() => handleMenuHover('graph')}
            style={menuStyle('graph')}
          >
            Graph
          </div>
          {openMenu === 'graph' && (
            <div style={{ ...dropdownContainerStyle, left: 0 }}>
              <div style={{ padding: '4px 12px', color: '#6c7086', fontWeight: 'bold', fontSize: '10px' }}>LAYOUT</div>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  setLayout('cola');
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ paddingLeft: '8px' }}>Cola (force-directed)</span>
                <span style={{ color: '#585b70' }}>1</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  setLayout('dagre');
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ paddingLeft: '8px' }}>Tree (hierarchical)</span>
                <span style={{ color: '#585b70' }}>2</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  setLayout('circle');
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ paddingLeft: '8px' }}>Circle</span>
                <span style={{ color: '#585b70' }}>3</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  setLayout('grid');
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span style={{ paddingLeft: '8px' }}>Grid</span>
                <span style={{ color: '#585b70' }}>4</span>
              </div>


              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  setFilters({ only_alive: true });
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Hide Dead Nodes</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  setFilters({ only_favorites: true });
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Show Only Favorites</span>
              </div>
            </div>
          )}
        </div>

        {/* FILTER */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => handleMenuClick('filter')}
            onMouseEnter={() => handleMenuHover('filter')}
            style={menuStyle('filter')}
          >
            Filter
          </div>
          {openMenu === 'filter' && (
            <div style={{ ...dropdownContainerStyle, left: 0 }}>
              <div
                style={itemStyle}
                onClick={() => setFilters({ only_alive: !filters.only_alive })}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>{filters.only_alive ? '☑' : '☐'} Only Alive</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => setFilters({ only_dead: !filters.only_dead })}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>{filters.only_dead ? '☑' : '☐'} Only Dead</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => setFilters({ only_findings: !filters.only_findings })}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>{filters.only_findings ? '☑' : '☐'} Only Findings</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => setFilters({ only_favorites: !filters.only_favorites })}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>{filters.only_favorites ? '☑' : '☐'} Only Favorites</span>
              </div>
              <div style={separatorStyle} />
              <div style={{ ...itemStyle, cursor: 'default', color: '#a6adc8', fontSize: '10px', fontWeight: 'bold' }}>
                TAGS
              </div>
              {projectTags.length === 0 ? (
                <div style={{ ...itemStyle, color: '#585b70', fontStyle: 'italic', cursor: 'default', fontSize: '11px' }}>
                  No tags entered
                </div>
              ) : (
                <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  {projectTags.map((tag) => {
                    const activeTags = filters.tags || [];
                    const isChecked = activeTags.includes(tag);
                    return (
                      <div
                        key={tag}
                        style={{ ...itemStyle, paddingLeft: '20px' }}
                        onClick={() => {
                          const nextTags = isChecked
                            ? activeTags.filter((t) => t !== tag)
                            : [...activeTags, tag];
                          setFilters({ tags: nextTags });
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <span>{isChecked ? '☑' : '☐'} {tag}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={separatorStyle} />
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  clearFilters();
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Clear All Filters</span>
                <span style={{ color: '#585b70' }}>Escape</span>
              </div>
            </div>
          )}
        </div>

        {/* EXPORT */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => handleMenuClick('export')}
            onMouseEnter={() => handleMenuHover('export')}
            style={menuStyle('export')}
          >
            Export
          </div>
          {openMenu === 'export' && (
            <div style={{ ...dropdownContainerStyle, left: 0 }}>
              <div
                style={itemStyle}
                onClick={handleExportProject}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Argus Project (.argus)</span>
              </div>
              <div style={separatorStyle} />
              <div
                style={itemStyle}
                onClick={() => handleExportMenu('PNG')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>PNG Image</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => handleExportMenu('SVG')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>SVG Vector</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => handleExportMenu('CSV')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Nodes CSV</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => handleExportMenu('TXT')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Subdomains TXT</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => handleExportMenu('ACTIVE_TXT')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Active Subdomains TXT</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => handleExportMenu('FAVORITES_CSV')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Favorites CSV</span>
              </div>
              <div style={separatorStyle} />
              <div
                style={itemStyle}
                onClick={() => handleExportMenu('MD')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Full Report (Markdown)</span>
              </div>
            </div>
          )}
        </div>

        {/* TOOLS */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => handleMenuClick('tools')}
            onMouseEnter={() => handleMenuHover('tools')}
            style={menuStyle('tools')}
          >
            Tools
          </div>
          {openMenu === 'tools' && (
            <div style={{ ...dropdownContainerStyle, left: 0 }}>
              <div
                style={itemStyle}
                onClick={() => handleCopyTool('alive')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Copy All Alive Subdomains</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => handleCopyTool('favorites')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Copy All Favorites</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => handleCopyTool('root')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Copy Root Domain</span>
              </div>
              <div style={separatorStyle} />
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  setShortcutOverlayOpen(true);
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Keyboard Shortcuts</span>
                <span style={{ color: '#585b70' }}>Ctrl+?</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  setSettingsModalOpen(true);
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Settings</span>
              </div>
            </div>
          )}
        </div>

        {/* HELP */}
        <div style={{ position: 'relative' }}>
          <div
            onClick={() => handleMenuClick('help')}
            onMouseEnter={() => handleMenuHover('help')}
            style={menuStyle('help')}
          >
            Help
          </div>
          {openMenu === 'help' && (
            <div style={{ ...dropdownContainerStyle, left: '160px' }}>
              <div
                style={itemStyle}
                onClick={() => handleExternalLink('https://github.com')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Documentation</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => handleExternalLink('https://github.com')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>GitHub Repository</span>
              </div>
              <div
                style={itemStyle}
                onClick={() => handleExternalLink('https://github.com')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>Report a Bug</span>
              </div>
              <div style={separatorStyle} />
              <div
                style={itemStyle}
                onClick={() => {
                  setOpenMenu(null);
                  alert("Argus v0.1.0\nVisual Web Attack-Surface Explorer\nDesigned for security teams & bug bounty hunters.");
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <span>About Argus</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Spacer to push right controls to the end */}
      <div
        data-tauri-drag-region
        onMouseDown={handleMouseDown}
        style={{ flex: 1, height: '100%', cursor: 'move' }}
      />

      {/* Center Drag Region & Document Title */}
      <div
        data-tauri-drag-region
        onMouseDown={handleMouseDown}
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          cursor: 'move',
          color: '#6c7086',
          fontSize: '11px',
          maxWidth: '40%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}
      >
        {activeProject
          ? `${activeProject.name} [${activeProject.root_domain}] — Argus`
          : 'Argus — Visual Web Attack-Surface Explorer'}
      </div>

      {/* Right side: Native-styled Custom Window Controls */}
      <div style={{ display: 'flex', height: '30px', alignItems: 'stretch' }}>
        <button
          onClick={handleMinimize}
          style={{
            border: 'none',
            backgroundColor: 'transparent',
            color: '#cdd6f4',
            width: '46px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontFamily: 'monospace',
            transition: 'background-color 0.15s ease',
            outline: 'none',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          ⎯
        </button>
        <button
          onClick={handleMaximize}
          style={{
            border: 'none',
            backgroundColor: 'transparent',
            color: '#cdd6f4',
            width: '46px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontFamily: 'monospace',
            transition: 'background-color 0.15s ease',
            outline: 'none',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#45475a')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          {isMaximized ? '❐' : '☐'}
        </button>
        <button
          onClick={handleClose}
          style={{
            border: 'none',
            backgroundColor: 'transparent',
            color: '#cdd6f4',
            width: '46px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '14px',
            fontFamily: 'monospace',
            transition: 'background-color 0.15s ease, color 0.15s ease',
            outline: 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f38ba8';
            e.currentTarget.style.color = '#11111b';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#cdd6f4';
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
};
