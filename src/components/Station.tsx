import React, { useEffect, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useArgusStore } from '../store/useArgusStore';

export const Station: React.FC = () => {
  const {
    activeProject,
    recentProjects,
    fetchRecentProjects,
    createProject,
    openProject,
    closeProject,
    deleteProject,
    importFolder,
    availableGraphs,
    selectedGraphIds,
    toggleGraphSelection,
    addProjectDomain,
    selectSingleGraph,
  } = useArgusStore();

  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [hoveredRecentId, setHoveredRecentId] = useState<string | null>(null);
  const [hoveredGraphId, setHoveredGraphId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecentProjects();
  }, [fetchRecentProjects]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newDomain) return;
    try {
      await createProject(newName, newDomain);
      setNewName('');
      setNewDomain('');
    } catch (err) {
      alert('Failed to create project: ' + String(err));
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim()) return;
    try {
      await addProjectDomain(newDomain.trim());
      setNewDomain('');
    } catch (err) {
      alert('Failed to add domain: ' + String(err));
    }
  };

  const handleOpen = async (id: string) => {
    if (!id) return;
    try {
      await openProject(id);
    } catch (err) {
      alert('Failed to open project: ' + String(err));
    }
  };

  const handleFolderImport = async (path: string) => {
    setImportStatus('Parsing & indexing data...');
    try {
      const summary = await importFolder(path);
      setImportStatus(
        `Imported ${summary.imported_nodes} nodes (${summary.subdomains_count} subs, ${summary.endpoints_count} endpoints, ${summary.findings_count} vulns)`
      );
      setTimeout(() => setImportStatus(null), 6000);
    } catch (err) {
      setImportStatus('Import error: ' + String(err));
    }
  };

  const handleSelectFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select Target Domain Folder',
      });
      if (selected && typeof selected === 'string') {
        await handleFolderImport(selected);
      }
    } catch (err) {
      alert('Folder selection error: ' + String(err));
    }
  };

  const headerStyle: React.CSSProperties = {
    color: '#6c7086',
    fontWeight: 'bold',
    fontSize: '10px',
    letterSpacing: '0.08em',
    borderBottom: '1px solid #313244',
    paddingBottom: '4px',
    marginBottom: '8px',
    marginTop: '12px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '4px 6px',
    backgroundColor: '#1e1e2e',
    border: '1px solid #313244',
    color: '#cdd6f4',
    fontSize: '11px',
    fontFamily: 'monospace',
    borderRadius: 0,
    outline: 'none',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '4px 8px',
    backgroundColor: '#313244',
    border: '1px solid #45475a',
    color: '#cdd6f4',
    fontSize: '11px',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    cursor: 'pointer',
    borderRadius: 0,
  };

  return (
    <div
      style={{
        width: '200px',
        minWidth: '200px',
        backgroundColor: '#181825',
        borderRight: '1px solid #313244',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '8px',
        gap: '10px',
        overflowY: 'auto',
        fontSize: '11px',
        fontFamily: 'monospace',
        borderRadius: 0,
        pointerEvents: activeProject ? 'auto' : 'none',
      }}
    >
      <div style={{ fontWeight: 'bold', color: '#cdd6f4', fontSize: '11px', borderBottom: '1px solid #313244', paddingBottom: '4px' }}>
        STATION
      </div>

      {/* DOMAINS / PROJECT */}
      <div>
        <div style={headerStyle}>{activeProject ? 'DOMAINS' : 'PROJECT'}</div>
        {activeProject ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <form onSubmit={handleAddDomain} style={{ display: 'flex', gap: '4px' }}>
              <input
                type="text"
                placeholder="domain.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                style={inputStyle}
              />
              <button type="submit" style={{ ...buttonStyle, color: '#89b4fa', whiteSpace: 'nowrap' }}>
                [+ADD]
              </button>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
              {availableGraphs.map((g) => {
                const isSelected = selectedGraphIds.includes(g.id);
                const isHovered = hoveredGraphId === g.id;
                return (
                  <div
                    key={g.id}
                    onMouseEnter={() => setHoveredGraphId(g.id)}
                    onMouseLeave={() => setHoveredGraphId(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '3px 4px',
                      borderRadius: '2px',
                      backgroundColor: isHovered ? '#1e1e2e' : 'transparent',
                      transition: 'background-color 0.15s ease',
                      overflow: 'hidden',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        color: isSelected ? '#cdd6f4' : '#6c7086',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        userSelect: 'none',
                        overflow: 'hidden',
                        flex: 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleGraphSelection(g.id)}
                        style={{
                          cursor: 'pointer',
                          accentColor: '#89b4fa',
                          margin: 0,
                        }}
                      />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={g.root_domain}
                      >
                        {g.root_domain}
                      </span>
                      <span style={{ color: '#585b70', fontSize: '9px', flexShrink: 0 }}>
                        ({g.node_count}n)
                      </span>
                    </label>

                    {isHovered && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          selectSingleGraph(g.id);
                        }}
                        style={{
                          color: '#89b4fa',
                          fontSize: '9px',
                          cursor: 'pointer',
                          fontWeight: 'bold',
                          flexShrink: 0,
                          padding: '0 2px',
                          backgroundColor: '#313244',
                          borderRadius: '2px',
                        }}
                        title={`View only ${g.root_domain}`}
                      >
                        only
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <input
              type="text"
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                type="text"
                placeholder="root-domain.com"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                style={inputStyle}
              />
              <button type="submit" style={{ ...buttonStyle, color: '#89b4fa', whiteSpace: 'nowrap' }}>
                [+ADD]
              </button>
            </div>
          </form>
        )}
      </div>

      {/* RECENT */}
      <div>
        <div style={headerStyle}>RECENT</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {recentProjects.length === 0 ? (
            <p style={{ color: '#6c7086', fontSize: '11px', fontStyle: 'italic', padding: '4px' }}>No recent</p>
          ) : (
            recentProjects.map((p) => {
              const isHovered = hoveredRecentId === p.id;
              return (
                <div
                  key={p.id}
                  onMouseEnter={() => setHoveredRecentId(p.id)}
                  onMouseLeave={() => setHoveredRecentId(null)}
                  onClick={() => handleOpen(p.id)}
                  style={{
                    padding: '4px',
                    backgroundColor: activeProject?.id === p.id ? '#313244' : isHovered ? '#1e1e2e' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', width: '85%' }}>
                    <span style={{ color: '#89b4fa' }}>▶</span>
                    <span style={{ color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>
                      {p.name}
                    </span>
                    <span style={{ color: '#585b70', fontSize: '9px', flexShrink: 0 }}>
                      {p.node_count}n {p.finding_count}f
                    </span>
                  </div>
                  {isHovered && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete project ${p.name}?`)) {
                          deleteProject(p.id);
                        }
                      }}
                      style={{ color: '#f38ba8', padding: '0 2px', fontWeight: 'bold' }}
                      title="Delete project"
                    >
                      [x]
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* IMPORT */}
      <div>
        <div style={headerStyle}>IMPORT</div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length > 0) {
              const path = (e.dataTransfer.files[0] as any).path || e.dataTransfer.files[0].name;
              handleFolderImport(path);
            }
          }}
          onClick={handleSelectFolder}
          style={{
            border: dragOver ? '1px dashed #89b4fa' : '1px dashed #45475a',
            padding: '12px 6px',
            textAlign: 'center',
            color: '#585b70',
            cursor: 'pointer',
            fontSize: '10px',
          }}
        >
          drop recon output
          <div style={{ color: '#585b70', margin: '2px 0' }}>subfinder · httpx</div>
          <div style={{ color: '#585b70' }}>katana · nuclei</div>
          <div style={{ color: '#89b4fa', fontWeight: 'bold', marginTop: '6px' }}>browse</div>
        </div>
        {importStatus && (
          <div style={{ color: '#f9e2af', fontSize: '10px', marginTop: '6px', wordBreak: 'break-all' }}>
            {importStatus}
          </div>
        )}
      </div>

      {/* CLOSE PROJECT BUTTON */}
      {activeProject && (
        <button
          onClick={closeProject}
          style={{
            ...buttonStyle,
            color: '#f38ba8',
            marginTop: 'auto',
            border: '1px solid #f38ba8',
            backgroundColor: 'transparent',
          }}
        >
          CLOSE PROJECT
        </button>
      )}
    </div>
  );
};
