import React, { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { open as openShell } from '@tauri-apps/plugin-shell';
import { useArgusStore } from '../store/useArgusStore';
import { FiImage, FiCode, FiGrid, FiFileText, FiActivity, FiStar } from 'react-icons/fi';

export const Scope: React.FC = () => {
  const {
    activeProject,
    selectedGraphIds,
    nodes,
    edges: _edges,
    selectedNode,
    selectedNodeEndpoints,
    selectNode,
    toggleFavorite,
    togglePin,
    addTag,
    removeTag,
    addNote,
    focusNodeId,
    setFocusNodeId,
    fetchEndpointsForSelectedNode,
    selectedNodeEndpointsTotalCount,
  } = useArgusStore();

  const [tagInput, setTagInput] = useState('');
  const [tagsList, setTagsList] = useState<string[]>([]);
  const [noteText, setNoteText] = useState('');
  const [endpointFilter, setEndpointFilter] = useState('');

  // Load notes and tags on node selection
  useEffect(() => {
    if (!selectedNode || !activeProject) {
      setTagsList([]);
      setNoteText('');
      return;
    }

    invoke<any>('node_get_note', { projectId: activeProject.id, nodeId: selectedNode.id })
      .then((res) => setNoteText(res?.body || ''))
      .catch(() => setNoteText(''));

    invoke<any[]>('node_get_tags', { projectId: activeProject.id, nodeId: selectedNode.id })
      .then((res) => setTagsList(res?.map((t) => t.label) || []))
      .catch(() => setTagsList([]));
  }, [selectedNode, activeProject]);

  useEffect(() => {
    const handleNodeUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (selectedNode && activeProject && detail && detail.nodeId === selectedNode.id) {
        invoke<any>('node_get_note', { projectId: activeProject.id, nodeId: selectedNode.id })
          .then((res) => setNoteText(res?.body || ''))
          .catch(() => setNoteText(''));

        invoke<any[]>('node_get_tags', { projectId: activeProject.id, nodeId: selectedNode.id })
          .then((res) => setTagsList(res?.map((t) => t.label) || []))
          .catch(() => setTagsList([]));
      }
    };

    window.addEventListener('node-data-updated', handleNodeUpdate);
    return () => window.removeEventListener('node-data-updated', handleNodeUpdate);
  }, [selectedNode, activeProject]);

  const subdomains = nodes.filter((n) => n.type === 'subdomain');

  useEffect(() => {
    if (!selectedNode || !activeProject) return;

    const delayDebounce = setTimeout(() => {
      fetchEndpointsForSelectedNode(selectedNode.id, endpointFilter || undefined);
    }, 150);

    return () => clearTimeout(delayDebounce);
  }, [selectedNode, activeProject, endpointFilter, fetchEndpointsForSelectedNode]);

  const filteredEndpoints = selectedNodeEndpoints;

  const [loadingNextPage, setLoadingNextPage] = useState(false);

  const handleEndpointsScroll = async (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 15;
    
    if (isAtBottom && !loadingNextPage && selectedNodeEndpoints.length < selectedNodeEndpointsTotalCount) {
      setLoadingNextPage(true);
      try {
        await fetchEndpointsForSelectedNode(
          selectedNode!.id,
          endpointFilter || undefined,
          selectedNodeEndpoints.length,
          500
        );
      } catch (err) {
        console.error("Failed to load more endpoints:", err);
      } finally {
        setLoadingNextPage(false);
      }
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

  const handleAddTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagInput || !selectedNode || !activeProject) return;
    try {
      await addTag(selectedNode.id, tagInput);
      setTagInput('');
      const updated = await invoke<any[]>('node_get_tags', { projectId: activeProject.id, nodeId: selectedNode.id });
      setTagsList(updated.map((t) => t.label));
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveTag = async (tagLabel: string) => {
    if (!selectedNode || !activeProject) return;
    try {
      await removeTag(selectedNode.id, tagLabel);
      const updated = await invoke<any[]>('node_get_tags', { projectId: activeProject.id, nodeId: selectedNode.id });
      setTagsList(updated.map((t) => t.label));
    } catch (err) {
      console.error(err);
    }
  };

  const handleNoteBlur = async () => {
    if (!selectedNode || !activeProject) return;
    try {
      await addNote(selectedNode.id, noteText);
    } catch (err) {
      console.error(err);
    }
  };

  // Graph Theory Metrics Computations
  const graphDepth = useMemo(() => {
    const root = nodes.find((n) => n.type === 'root');
    if (!root) return 0;
    const adj: Record<string, string[]> = {};
    nodes.forEach((n) => (adj[n.id] = []));
    _edges.forEach((e) => {
      if (adj[e.source_node_id]) adj[e.source_node_id].push(e.target_node_id);
      if (adj[e.target_node_id]) adj[e.target_node_id].push(e.source_node_id);
    });

    const queue: [string, number][] = [[root.id, 0]];
    const visited = new Set<string>([root.id]);
    let max = 0;
    while (queue.length > 0) {
      const [curr, d] = queue.shift()!;
      max = Math.max(max, d);
      const neighbors = adj[curr] || [];
      for (const n of neighbors) {
        if (!visited.has(n)) {
          visited.add(n);
          queue.push([n, d + 1]);
        }
      }
    }
    return max;
  }, [nodes, _edges]);

  const clustersCount = useMemo(() => {
    if (nodes.length === 0) return 0;
    const adj: Record<string, string[]> = {};
    nodes.forEach((n) => (adj[n.id] = []));
    _edges.forEach((e) => {
      if (adj[e.source_node_id]) adj[e.source_node_id].push(e.target_node_id);
      if (adj[e.target_node_id]) adj[e.target_node_id].push(e.source_node_id);
    });

    const visited = new Set<string>();
    let count = 0;
    nodes.forEach((node) => {
      if (!visited.has(node.id)) {
        count++;
        const queue = [node.id];
        visited.add(node.id);
        while (queue.length > 0) {
          const curr = queue.shift()!;
          const neighbors = adj[curr] || [];
          for (const n of neighbors) {
            if (!visited.has(n)) {
              visited.add(n);
              queue.push(n);
            }
          }
        }
      }
    });
    return count;
  }, [nodes, _edges]);

  const isolatedCount = useMemo(() => {
    const activeIds = new Set<string>();
    _edges.forEach((e) => {
      activeIds.add(e.source_node_id);
      activeIds.add(e.target_node_id);
    });
    return nodes.filter((n) => n.type !== 'root' && !activeIds.has(n.id)).length;
  }, [nodes, _edges]);

  // Selected Node Technologies
  const selectedNodeTechs = useMemo(() => {
    if (!selectedNode) return [];
    const connectedEdges = _edges.filter(
      (e) => e.source_node_id === selectedNode.id || e.target_node_id === selectedNode.id
    );
    const techIds = connectedEdges.map((e) =>
      e.source_node_id === selectedNode.id ? e.target_node_id : e.source_node_id
    );
    return nodes.filter((n) => techIds.includes(n.id) && n.type === 'technology');
  }, [selectedNode, nodes, _edges]);

  // Selected Node Neighbors
  const selectedNodeNeighbors = useMemo(() => {
    if (!selectedNode) return [];
    const connectedEdges = _edges.filter(
      (e) => e.source_node_id === selectedNode.id || e.target_node_id === selectedNode.id
    );
    const neighborIds = connectedEdges.map((e) =>
      e.source_node_id === selectedNode.id ? e.target_node_id : e.source_node_id
    );
    return nodes.filter((n) => neighborIds.includes(n.id) && n.type !== 'technology');
  }, [selectedNode, nodes, _edges]);

  const renderScoreBar = (score: number) => {
    return (
      <span style={{ display: 'inline-flex', width: '80px', height: '6px', backgroundColor: '#313244', borderRadius: '3px', overflow: 'hidden', verticalAlign: 'middle', marginRight: '6px' }}>
        <span style={{ width: `${score * 100}%`, height: '100%', backgroundColor: '#f9e2af', borderRadius: '3px 0 0 3px' }} />
      </span>
    );
  };

  const getStatusBgColor = (code: number | null | undefined) => {
    if (code === null || code === undefined) return 'rgba(88, 91, 112, 0.15)';
    if (code === 0) return 'rgba(243, 139, 168, 0.15)';
    if (code >= 200 && code < 300) return 'rgba(166, 227, 161, 0.15)';
    if (code >= 300 && code < 400) return 'rgba(249, 226, 175, 0.15)';
    if (code >= 400 && code < 500) return 'rgba(250, 179, 135, 0.15)';
    return 'rgba(243, 139, 168, 0.15)';
  };

  const getStatusColor = (code: number | null | undefined) => {
    if (code === null || code === undefined) return '#585b70';
    if (code === 0) return '#f38ba8';
    if (code >= 200 && code < 300) return '#a6e3a1';
    if (code >= 300 && code < 400) return '#f9e2af';
    if (code >= 400 && code < 500) return '#fab387';
    if (code >= 500) return '#f38ba8';
    return '#585b70';
  };

  const handleOpenNode = () => {
    if (!selectedNode) return;
    const url = selectedNode.label.startsWith('http') ? selectedNode.label : `https://${selectedNode.label}`;
    openShell(url).catch(() => window.open(url, '_blank'));
  };

  const handleCopyNode = () => {
    if (!selectedNode) return;
    navigator.clipboard.writeText(selectedNode.label);
    alert("Copied to clipboard!");
  };

  const handleFocusNode = () => {
    if (!selectedNode) return;
    if (focusNodeId === selectedNode.id) {
      setFocusNodeId(null);
    } else {
      setFocusNodeId(selectedNode.id);
      const cy = (window as any).cy;
      if (cy) {
        const el = cy.getElementById(selectedNode.id);
        if (el.length > 0) {
          cy.center(el);
          cy.zoom(1.8);
        }
      }
    }
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontWeight: 'bold',
    color: '#6c7086',
    fontSize: '10px',
    letterSpacing: '0.08em',
    marginBottom: '4px',
    textTransform: 'uppercase',
  };

  const sectionDividerStyle: React.CSSProperties = {
    borderTop: '1px solid #313244',
    paddingTop: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  };

  const textStyle: React.CSSProperties = {
    color: '#cdd6f4',
    fontSize: '11px',
  };

  const labelMutedStyle: React.CSSProperties = {
    color: '#585b70',
    minWidth: '90px',
    display: 'inline-block',
  };

  const actionButtonStyle: React.CSSProperties = {
    flex: '1 1 30%',
    padding: '3px',
    backgroundColor: '#313244',
    border: '1px solid #45475a',
    color: '#cdd6f4',
    fontSize: '9px',
    fontFamily: 'monospace',
    cursor: 'pointer',
    textAlign: 'center',
  };

  return (
    <div
      style={{
        width: '280px',
        minWidth: '280px',
        backgroundColor: '#181825',
        borderLeft: '1px solid #313244',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        fontFamily: 'monospace',
        fontSize: '11px',
        pointerEvents: activeProject ? 'auto' : 'none',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {!selectedNode ? (
          /* INSPECTOR - NO NODE SELECTED */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={sectionHeaderStyle}>Scope</div>
            <div style={{ color: '#585b70', paddingBottom: '6px' }}>no node selected</div>

            {/* GRAPH STATS */}
            <div style={sectionDividerStyle}>
              <div style={sectionHeaderStyle}>GRAPH STATS</div>
              <div style={textStyle}><span style={labelMutedStyle}>total nodes</span>{nodes.length}</div>
              <div style={textStyle}><span style={labelMutedStyle}>total edges</span>{_edges.length}</div>
              <div style={textStyle}><span style={labelMutedStyle}>root domain</span>{activeProject?.root_domain || 'n/a'}</div>
              <div style={textStyle}><span style={labelMutedStyle}>depth</span>{graphDepth}</div>
              <div style={textStyle}><span style={labelMutedStyle}>clusters</span>{clustersCount}</div>
              <div style={textStyle}><span style={labelMutedStyle}>isolated</span>{isolatedCount}</div>
            </div>

            {/* DOMAINS & SUBDOMAINS */}
            <div style={sectionDividerStyle}>
              <div style={sectionHeaderStyle}>DOMAINS & SUBDOMAINS ({subdomains.length})</div>
              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {subdomains.length === 0 ? (
                  <p style={{ color: '#6c7086', fontSize: '11px', fontStyle: 'italic', margin: 0, padding: '4px' }}>No recent</p>
                ) : (
                  subdomains.map((s) => {
                    const isUnprobed = s.status_code === null || s.status_code === undefined;
                    const isAlive = s.status_code !== null && s.status_code !== undefined && s.status_code >= 100 && s.status_code < 500;
                    const statusText = isUnprobed ? 'UNPROBED' : (isAlive ? 'ALIVE' : 'DEAD');
                    const statusColor = isUnprobed ? '#585b70' : (isAlive ? '#a6e3a1' : '#f38ba8');
                    return (
                      <div
                        key={s.id}
                        onClick={() => selectNode(s)}
                        style={{
                          padding: '2px 4px',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          backgroundColor: 'transparent',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e1e2e')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <span style={{ color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                          {s.label}
                        </span>
                        <span style={{ color: statusColor, flexShrink: 0 }}>
                          [{statusText}]
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* EXPORT */}
            <div style={sectionDividerStyle}>
              <div style={sectionHeaderStyle}>EXPORT</div>
              <div
                onClick={() => handleExport('PNG')}
                style={{ color: '#cdd6f4', cursor: 'pointer', padding: '4px 3px', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e1e2e')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                  <FiImage style={{ color: '#89b4fa', fontSize: '12px' }} />
                  PNG IMAGE
                </div>
                <div style={{ fontSize: '9px', color: '#585b70', paddingLeft: '20px' }}>current graph view</div>
              </div>
              <div
                onClick={() => handleExport('SVG')}
                style={{ color: '#cdd6f4', cursor: 'pointer', padding: '4px 3px', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e1e2e')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                  <FiCode style={{ color: '#cba6f7', fontSize: '12px' }} />
                  SVG VECTOR
                </div>
                <div style={{ fontSize: '9px', color: '#585b70', paddingLeft: '20px' }}>editable graph export</div>
              </div>
              <div
                onClick={() => handleExport('CSV')}
                style={{ color: '#cdd6f4', cursor: 'pointer', padding: '4px 3px', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e1e2e')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                  <FiGrid style={{ color: '#f9e2af', fontSize: '12px' }} />
                  NODES CSV
                </div>
                <div style={{ fontSize: '9px', color: '#585b70', paddingLeft: '20px' }}>visible nodes table</div>
              </div>
              <div
                onClick={() => handleExport('TXT')}
                style={{ color: '#cdd6f4', cursor: 'pointer', padding: '4px 3px', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e1e2e')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                  <FiFileText style={{ color: '#fab387', fontSize: '12px' }} />
                  SUBDOMAINS TXT
                </div>
                <div style={{ fontSize: '9px', color: '#585b70', paddingLeft: '20px' }}>all visible domains</div>
              </div>
              <div
                onClick={() => handleExport('ACTIVE_TXT')}
                style={{ color: '#cdd6f4', cursor: 'pointer', padding: '4px 3px', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e1e2e')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                  <FiActivity style={{ color: '#a6e3a1', fontSize: '12px' }} />
                  ACTIVE SUBDOMAINS
                </div>
                <div style={{ fontSize: '9px', color: '#585b70', paddingLeft: '20px' }}>alive hosts only</div>
              </div>
              <div
                onClick={() => handleExport('FAVORITES_CSV')}
                style={{ color: '#cdd6f4', cursor: 'pointer', padding: '4px 3px', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e1e2e')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontWeight: 'bold' }}>
                  <FiStar style={{ color: '#f38ba8', fontSize: '12px' }} />
                  FAVORITES CSV
                </div>
                <div style={{ fontSize: '9px', color: '#585b70', paddingLeft: '20px' }}>high-value visible nodes</div>
              </div>
            </div>
          </div>
        ) : (
          /* INSPECTOR - NODE SELECTED */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={sectionHeaderStyle}>Scope</div>
            {/* Header Info */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#89b4fa', wordBreak: 'break-all', lineHeight: '1.3' }}>
                {selectedNode.label}
              </span>
              <div>
                <span
                  style={{
                    backgroundColor: getStatusBgColor(selectedNode.status_code),
                    color: getStatusColor(selectedNode.status_code),
                    border: `1px solid ${getStatusColor(selectedNode.status_code)}`,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                    display: 'inline-block'
                  }}
                >
                  {selectedNode.status_code === null || selectedNode.status_code === undefined ? 'Not yet probed' : (selectedNode.status_code >= 100 && selectedNode.status_code < 500 ? 'ALIVE' : 'DEAD')}
                </span>
              </div>
            </div>

            <div style={sectionDividerStyle}>
              <div style={textStyle}><span style={labelMutedStyle}>type</span>{selectedNode.type}</div>
              <div style={textStyle}>
                <span style={labelMutedStyle}>score</span>
                {renderScoreBar(selectedNode.score)}
                <span>{selectedNode.score.toFixed(2)}</span>
              </div>
              <div style={textStyle}>
                <span style={labelMutedStyle}>status</span>
                {selectedNode.status_code === null || selectedNode.status_code === undefined ? 'n/a' : selectedNode.status_code}
              </div>
              {(selectedNode.status_code === null || selectedNode.status_code === undefined) && (
                <div style={{ color: '#a6adc8', fontSize: '10px', marginTop: '2px', marginBottom: '6px', fontStyle: 'italic' }}>
                  Not probed — run an Httpx scan and re-import to check liveness
                </div>
              )}
              <div style={textStyle}><span style={labelMutedStyle}>ip</span>{selectedNode.ip || 'n/a'}</div>
              <div style={textStyle}><span style={labelMutedStyle}>cdn</span>{selectedNode.cdn || 'none'}</div>
              <div style={textStyle}><span style={labelMutedStyle}>title</span>{selectedNode.title || 'n/a'}</div>
              <div style={textStyle}><span style={labelMutedStyle}>size</span>{selectedNode.page_size ? `${selectedNode.page_size.toLocaleString()} bytes` : 'n/a'}</div>
              <div style={textStyle}><span style={labelMutedStyle}>found by</span>{selectedNode.found_by || 'subfinder'}</div>
            </div>

            {/* TECHNOLOGIES */}
            <div style={sectionDividerStyle}>
              <div style={sectionHeaderStyle}>TECHNOLOGIES ({selectedNodeTechs.length})</div>
              {selectedNodeTechs.length === 0 ? (
                <div style={{ color: '#585b70' }}>no technologies detected</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {selectedNodeTechs.map((tech) => (
                    <span key={tech.id} style={{ backgroundColor: '#313244', padding: '2px 6px', color: '#cdd6f4' }}>
                      {tech.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* ENDPOINTS */}
            <div style={sectionDividerStyle}>
              <div style={sectionHeaderStyle}>
                ENDPOINTS ({selectedNodeEndpoints.length.toLocaleString()} / {selectedNodeEndpointsTotalCount.toLocaleString()})
              </div>
              <input
                type="text"
                placeholder="Filter endpoints & js files..."
                value={endpointFilter}
                onChange={(e) => setEndpointFilter(e.target.value)}
                style={{
                  width: '100%',
                  padding: '2px 4px',
                  marginBottom: '4px',
                  fontSize: '10px',
                  backgroundColor: '#1e1e2e',
                  border: '1px solid #313244',
                  color: '#cdd6f4',
                  fontFamily: 'monospace',
                }}
              />
              {selectedNodeEndpoints.length === 0 ? (
                <div style={{ color: '#585b70' }}>No endpoints/js files found for this subdomain</div>
              ) : (
                <div
                  onScroll={handleEndpointsScroll}
                  style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}
                >
                  {filteredEndpoints.map((ep) => (
                    <div
                      key={ep.id}
                      onClick={() => selectNode(ep)}
                      style={{
                        padding: '3px',
                        backgroundColor: '#1e1e2e',
                        border: '1px solid #313244',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ color: '#89b4fa', wordBreak: 'break-all', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>
                        {ep.label}
                      </span>
                      <span style={{ color: getStatusColor(ep.status_code), flexShrink: 0 }}>
                        {ep.status_code !== null && ep.status_code !== undefined ? `[${ep.status_code}]` : ''}
                      </span>
                    </div>
                  ))}
                  {loadingNextPage && (
                    <div style={{ color: '#89b4fa', fontSize: '9px', padding: '3px', textAlign: 'center', fontFamily: 'monospace' }}>
                      loading more...
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* NEIGHBORS */}
            <div style={sectionDividerStyle}>
              <div style={sectionHeaderStyle}>NEIGHBORS ({selectedNodeNeighbors.length})</div>
              {selectedNodeNeighbors.length === 0 ? (
                <div style={{ color: '#585b70' }}>no direct neighbors</div>
              ) : (
                <div style={{ maxHeight: '100px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {selectedNodeNeighbors.map((nb) => {
                    let prefix = '⬡';
                    if (nb.type === 'endpoint') prefix = '◻';
                    else if (nb.type === 'ip') prefix = '◈';
                    else if (nb.type === 'finding') prefix = '▲';

                    return (
                      <div
                        key={nb.id}
                        onClick={() => selectNode(nb)}
                        style={{ padding: '2px', cursor: 'pointer', display: 'flex', gap: '4px' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1e1e2e')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <span style={{ color: '#89b4fa' }}>{prefix}</span>
                        <span style={{ color: '#cdd6f4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {nb.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* TAGS */}
            <div style={sectionDividerStyle}>
              <div style={sectionHeaderStyle}>TAGS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                {tagsList.map((tag, idx) => (
                  <span
                    key={idx}
                    style={{
                      backgroundColor: '#313244',
                      padding: '2px 6px',
                      color: '#cdd6f4',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#f38ba8',
                        cursor: 'pointer',
                        padding: '0 2px',
                        fontSize: '11px',
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Delete tag"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <form onSubmit={handleAddTagSubmit}>
                <input
                  type="text"
                  placeholder="+ add tag (Enter)"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '2px 4px',
                    backgroundColor: '#1e1e2e',
                    border: '1px solid #313244',
                    color: '#cdd6f4',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                  }}
                />
              </form>
            </div>

            {/* NOTES */}
            <div style={sectionDividerStyle}>
              <div style={sectionHeaderStyle}>NOTES</div>
              <textarea
                rows={2}
                placeholder="Add node notes..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onBlur={handleNoteBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                style={{
                  width: '100%',
                  padding: '4px',
                  backgroundColor: '#1e1e2e',
                  border: '1px solid #313244',
                  color: '#cdd6f4',
                  fontSize: '10px',
                  fontFamily: 'monospace',
                  borderRadius: 0,
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </div>

            {/* ACTIONS */}
            <div style={sectionDividerStyle}>
              <div style={sectionHeaderStyle}>ACTIONS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <button onClick={handleOpenNode} style={actionButtonStyle}>
                  [OPEN]
                </button>
                <button onClick={handleCopyNode} style={actionButtonStyle}>
                  [COPY]
                </button>
                <button
                  onClick={() => toggleFavorite(selectedNode.id, selectedNode.is_favorite)}
                  style={{ ...actionButtonStyle, color: selectedNode.is_favorite ? '#f9e2af' : '#cdd6f4' }}
                >
                  [FAVORITE]
                </button>

                <button onClick={handleFocusNode} style={actionButtonStyle}>
                  {focusNodeId === selectedNode.id ? '[UNFOCUS]' : '[FOCUS]'}
                </button>
                <button
                  onClick={() => togglePin(selectedNode.id, selectedNode.is_pinned)}
                  style={{ ...actionButtonStyle, color: selectedNode.is_pinned === 1 ? '#a6e3a1' : '#cdd6f4' }}
                >
                  {selectedNode.is_pinned === 1 ? '[UNPIN]' : '[PIN]'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
