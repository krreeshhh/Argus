import type { Node } from '../types';
import React, { useEffect, useRef, useState, useMemo } from 'react';
import cytoscape from 'cytoscape';
import cola from 'cytoscape-cola';
import dagre from 'cytoscape-dagre';
import { useArgusStore } from '../store/useArgusStore';
import { useImportStore } from '../store/useImportStore';
import { open as openShell } from '@tauri-apps/plugin-shell';
import { FiFolder, FiAlertTriangle, FiClock, FiExternalLink, FiTrash2 } from 'react-icons/fi';
import { ask } from '@tauri-apps/plugin-dialog';

cytoscape.use(cola);
cytoscape.use(dagre);

const ProjectItemRow: React.FC<{
  project: any;
  onOpen: () => void;
  onDelete: () => void;
}> = ({ project, onOpen, onDelete }) => {
  const [hovered, setHovered] = useState(false);
  const [deleteHovered, setDeleteHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onOpen}
      style={{
        padding: '12px 16px',
        backgroundColor: hovered ? 'rgba(137, 180, 250, 0.08)' : 'rgba(30, 30, 46, 0.4)',
        border: hovered ? '1px solid rgba(137, 180, 250, 0.35)' : '1px solid rgba(49, 50, 68, 0.5)',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        transition: 'all 0.2s ease',
        transform: hovered ? 'translateX(2px)' : 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden', width: '80%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#89b4fa', fontWeight: 'bold', fontSize: '13px' }}>
            {project.name}
          </span>
          <span style={{ color: '#a6e3a1', fontSize: '10px', opacity: 0.8 }}>
            ({project.root_domain})
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: '#6c7086' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FiFolder style={{ fontSize: '11px' }} /> {project.node_count.toLocaleString()} nodes
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FiAlertTriangle style={{ fontSize: '11px', color: '#fab387' }} /> {project.finding_count.toLocaleString()} findings
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FiClock style={{ fontSize: '11px' }} /> Updated: {new Date(project.updated_at).toLocaleDateString()}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onOpen}
          title="Open project workspace"
          style={{
            padding: '4px 8px',
            backgroundColor: hovered ? '#89b4fa' : '#313244',
            border: hovered ? '1px solid #89b4fa' : '1px solid #45475a',
            color: hovered ? '#11111b' : '#cdd6f4',
            fontSize: '10px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <FiExternalLink style={{ fontSize: '11px' }} />
          <span>OPEN</span>
        </button>
        <button
          onMouseEnter={() => setDeleteHovered(true)}
          onMouseLeave={() => setDeleteHovered(false)}
          onClick={onDelete}
          title="Delete project workspace"
          style={{
            padding: '4px 8px',
            backgroundColor: deleteHovered ? '#f38ba8' : 'transparent',
            border: deleteHovered ? '1px solid #f38ba8' : '1px solid rgba(243, 139, 168, 0.3)',
            color: deleteHovered ? '#11111b' : '#f38ba8',
            fontSize: '10px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FiTrash2 style={{ fontSize: '11px' }} />
        </button>
      </div>
    </div>
  );
};

export const GraphCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const [cyInstance, setCyInstance] = useState<cytoscape.Core | null>(null);

  const {
    activeProject,
    recentProjects,
    openProject,
    deleteProject,
    fetchRecentProjects,
    nodes,
    edges,
    activeLayout,
    layoutChangeCount,
    renderTriggerKey,
    setLayoutChanging,
    gridOpen,
    minimapOpen,
    diffMode,
    diffResult,
    selectNode,
    selectedNode,
    togglePin,
    toggleFavorite,
    deleteNode,
    updateNodePosition,
    addTag,
    addNote,
    stationOpen,
    scopeOpen,
    filters,
    focusNodeId,
    setFocusNodeId,
    clearFilters,
    createProject,
  } = useArgusStore();

  const [hoveredNode, setHoveredNode] = useState<Node | null>(null);
  const [homeSearchQuery, setHomeSearchQuery] = useState('');

  const handleHomeNewProject = async (queryText?: string) => {
    const input = (queryText || homeSearchQuery).trim();
    if (!input) return;

    let name = '';
    let domain = '';

    const parts = input.split(/[\s,;:]+/);
    if (parts.length >= 2) {
      name = parts[0];
      domain = parts[1];
    } else {
      name = input;
      if (input.includes('.') && !input.startsWith('.') && !input.endsWith('.')) {
        domain = input;
        name = input.split('.')[0];
      } else {
        domain = input.toLowerCase() + '.com';
      }
    }

    try {
      await createProject(name, domain);
      setHomeSearchQuery('');
    } catch (err) {
      alert("Failed to create project: " + String(err));
    }
  };

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    node: Node | null;
  }>({ visible: false, x: 0, y: 0, node: null });

  const [inlineInputType, setInlineInputType] = useState<'tag' | 'note' | null>(null);
  const [inlineInputValue, setInlineInputValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Apply Show Only This local filtering if active
  const filteredNodes = useMemo(() => {
    const baseNodes = nodes.filter(
      (n) => n.type !== 'endpoint' && n.type !== 'jsfile'
    );
    if (focusNodeId) {
      const connectedNodeIds = new Set<string>([focusNodeId]);
      edges.forEach((e) => {
        if (e.source_node_id === focusNodeId) connectedNodeIds.add(e.target_node_id);
        if (e.target_node_id === focusNodeId) connectedNodeIds.add(e.source_node_id);
      });
      return baseNodes.filter((n) => connectedNodeIds.has(n.id) || n.type === 'root');
    }
    return baseNodes;
  }, [nodes, edges, focusNodeId]);

  const filteredEdges = useMemo(() => {
    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));
    return edges.filter(
      (e) => visibleNodeIds.has(e.source_node_id) && visibleNodeIds.has(e.target_node_id)
    );
  }, [edges, filteredNodes]);

  const hasActiveFilters = useMemo(() => {
    if (!filters) return false;
    return (
      filters.only_alive === true ||
      filters.only_dead === true ||
      filters.only_favorites === true ||
      filters.only_findings === true ||
      (filters.status_codes && filters.status_codes.length > 0) ||
      (filters.search_query && filters.search_query.trim().length > 0) ||
      (filters.tags && filters.tags.length > 0)
    );
  }, [filters]);

  const elementStructureKey = useMemo(() => {
    return (
      filteredNodes
        .map((n) => `${n.id}:${n.type}:${n.status_code}`)
        .join('|') +
      '##' +
      filteredEdges.map((e) => `${e.source_node_id}->${e.target_node_id}`).join('|')
    );
  }, [filteredNodes, filteredEdges]);

  const filteredNodesRef = useRef(filteredNodes);
  const filteredEdgesRef = useRef(filteredEdges);

  useEffect(() => {
    filteredNodesRef.current = filteredNodes;
    filteredEdgesRef.current = filteredEdges;
  }, [filteredNodes, filteredEdges]);

  // Load recent projects when no project is open
  useEffect(() => {
    if (!activeProject) {
      fetchRecentProjects();
    }
  }, [activeProject, fetchRecentProjects]);

  // Handle global key escape and window click to close menus/reset focus
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu((prev) => ({ ...prev, visible: false }));
        setFocusNodeId(null);
      }
    };
    const handleWindowClick = (e: MouseEvent) => {
      if (e.button === 2) return;
      const target = e.target as HTMLElement;
      if (target.closest('.context-menu-container')) return;
      setContextMenu((prev) => prev.visible ? { ...prev, visible: false } : prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handleWindowClick);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleWindowClick);
    };
  }, []);

  // Trigger Cytoscape resize and fit when sidebars toggle
  useEffect(() => {
    if (cyInstance) {
      const timer = setTimeout(() => {
        if (!cyInstance.destroyed()) {
          try {
            cyInstance.resize();
            cyInstance.fit(cyInstance.elements(':visible'), 60);
          } catch (e) {
            console.warn('Failed to resize/fit cytoscape instance:', e);
          }
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [stationOpen, scopeOpen, cyInstance]);

  useEffect(() => {
    if (!containerRef.current || !activeProject) return;

    const cyElements: cytoscape.ElementDefinition[] = [];

    filteredNodesRef.current.forEach((n) => {
      let fillColor = '#45475a'; // dead/unknown fill
      let borderColor = '#585b70'; // dead/unknown border
      let size = 28;
      let shape: cytoscape.Css.NodeShape = 'ellipse';

      // 1. Color and visual encoding mapping
      const sc = n.status_code;
      const isConfirmedDead = sc === 0;
      const isAlive = sc !== null && sc !== undefined && sc >= 200 && sc < 300;
      const isRedirect = sc !== null && sc !== undefined && sc >= 300 && sc < 400;
      const isClientErr = sc !== null && sc !== undefined && sc >= 400 && sc < 500;
      const isServerErr = sc !== null && sc !== undefined && sc >= 500;

      if (n.type === 'root') {
        fillColor = '#cba6f7';
        borderColor = '#cba6f7';
        size = 52;
        shape = 'ellipse';
      } else if (n.type === 'subdomain') {
        shape = 'ellipse';
        size = 38;
        if (isAlive) {
          fillColor = '#a6e3a1';
          borderColor = '#40a02b';
        } else if (isRedirect) {
          fillColor = '#f9e2af';
          borderColor = '#df8e1d';
        } else if (isClientErr) {
          fillColor = '#fab387';
          borderColor = '#fe640b';
        } else if (isServerErr || isConfirmedDead) {
          fillColor = '#f38ba8';
          borderColor = '#d20f39';
        } else {
          fillColor = '#45475a';
          borderColor = '#585b70';
        }
      } else if (n.type === 'endpoint' || n.type === 'jsfile') {
        shape = 'roundrectangle';
        size = 22;
        if (isAlive) {
          fillColor = '#a6e3a1';
          borderColor = '#40a02b';
        } else if (isRedirect) {
          fillColor = '#f9e2af';
          borderColor = '#df8e1d';
        } else if (isClientErr) {
          fillColor = '#fab387';
          borderColor = '#fe640b';
        } else if (isServerErr || isConfirmedDead) {
          fillColor = '#f38ba8';
          borderColor = '#d20f39';
        } else {
          fillColor = '#45475a';
          borderColor = '#585b70';
        }
      } else if (n.type === 'ip') {
        shape = 'diamond';
        size = 28;
        if (isAlive) {
          fillColor = '#a6e3a1';
          borderColor = '#40a02b';
        }
      } else if (n.type === 'technology') {
        shape = 'hexagon';
        size = 24;
      } else if (n.type === 'finding') {
        shape = 'triangle';
        size = 34;
        fillColor = '#f38ba8';
        borderColor = '#d20f39';
      }

      // 2. Favorites system resizing & border styling
      const isFav = n.is_favorite === 1 || n.score > 0.7;
      if (isFav) {
        borderColor = '#f9e2af'; // Yellow star border
        shape = 'star'; // Custom star visual shape
        size *= 1.3;
      }

      // 3. Dynamic label truncating
      let labelText = '';
      let fontSize = 10;
      if (n.type === 'root') {
        labelText = n.label;
        fontSize = 13;
      } else if (n.type === 'subdomain') {
        const statusStr = (n.status_code !== null && n.status_code !== undefined) ? ` [${n.status_code}]` : '';
        const fullLabel = n.label + statusStr;
        if (n.score > 0.6) {
          labelText = fullLabel;
          fontSize = 11;
        } else {
          labelText = fullLabel.length > 18 ? fullLabel.slice(0, 18) + '...' : fullLabel;
          fontSize = 10;
        }
      } else if (n.type === 'endpoint') {
        // No labels for endpoints unless they are selected
        labelText = selectedNode?.id === n.id ? n.label : '';
        fontSize = 10;
      } else {
        labelText = n.label.length > 18 ? n.label.slice(0, 18) + '...' : n.label;
        fontSize = 10;
      }

      const hasPos = n.pos_x !== null && n.pos_y !== null && !hasActiveFilters && !focusNodeId;

      cyElements.push({
        data: {
          id: n.id,
          label: labelText,
          type: n.type,
          nodeData: n,
          fillColor: fillColor,
          borderColor: borderColor,
          borderWidth: isFav ? 3 : n.type === 'finding' ? 3 : 1,
          size: size,
          shape: shape,
          fontSize: `${fontSize}px`,
        },
        position: hasPos ? { x: n.pos_x as number, y: n.pos_y as number } : undefined,
        locked: n.is_pinned === 1,
      });
    });

    filteredEdgesRef.current.forEach((e) => {
      cyElements.push({
        data: {
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
        },
      });
    });

    const cy = cytoscape({
      container: containerRef.current,
      elements: cyElements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(fillColor)',
            'border-color': 'data(borderColor)',
            'border-width': 'data(borderWidth)',
            'width': 'data(size)',
            'height': 'data(size)',
            'shape': 'data(shape)' as any,
            'label': 'data(label)',
            'color': '#cdd6f4',
            'font-family': 'monospace',
            'font-size': 'data(fontSize)',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'text-background-color': 'rgba(30, 30, 46, 0.85)',
            'text-background-opacity': 0.85,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 1.2,
            'line-color': '#45475a',
            'curve-style': 'bezier',
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 3,
            'border-color': '#89b4fa',
          },
        },
        {
          selector: '.highlighted',
          style: {
            'border-width': 3,
            'border-color': '#a6e3a1',
            opacity: 1,
          },
        },
        {
          selector: '.dimmed',
          style: {
            opacity: 0.2,
          },
        },
      ],
    });

    cyRef.current = cy;
    (window as any).cy = cy;
    setCyInstance(cy);

    cy.on('tap', 'node', (evt) => {
      const nData = evt.target.data('nodeData');
      selectNode(nData);
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        selectNode(null);
        setContextMenu((prev) => ({ ...prev, visible: false }));
        setInlineInputType(null);
        setConfirmDelete(false);
      }
    });

    cy.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const nData = node.data('nodeData');
      setHoveredNode(nData);

      const neighborhood = node.neighborhood().add(node);
      cy.elements().addClass('dimmed');
      neighborhood.removeClass('dimmed').addClass('highlighted');
    });

    cy.on('mouseout', 'node', () => {
      setHoveredNode(null);
      cy.elements().removeClass('dimmed').removeClass('highlighted');
    });

    cy.on('free', 'node', (evt) => {
      const node = evt.target;
      const nData = node.data('nodeData');
      if (nData && nData.type !== 'root') {
        const pos = node.position();
        updateNodePosition(node.id(), pos.x, pos.y);
      }
    });

    // Custom Right-Click Context Menu trigger for nodes
    cy.on('cxttap', 'node', (evt) => {
      const nData = evt.target.data('nodeData');
      selectNode(nData);
      const renderedPos = evt.renderedPosition;
      const bounds = containerRef.current?.getBoundingClientRect();
      if (bounds) {
        setInlineInputType(null);
        setConfirmDelete(false);
        setContextMenu({
          visible: true,
          x: bounds.left + renderedPos.x,
          y: bounds.top + renderedPos.y,
          node: nData,
        });
      }
    });

    // Custom Right-Click Context Menu trigger for background
    cy.on('cxttap', (evt) => {
      if (evt.target === cy) {
        const renderedPos = evt.renderedPosition;
        const bounds = containerRef.current?.getBoundingClientRect();
        if (bounds) {
          setInlineInputType(null);
          setConfirmDelete(false);
          setContextMenu({
            visible: true,
            x: bounds.left + renderedPos.x,
            y: bounds.top + renderedPos.y,
            node: null,
          });
        }
      }
    });

    runLayout(cy, activeLayout);

    return () => {
      setCyInstance(null);
      cy.destroy();
    };
  }, [elementStructureKey, activeLayout, layoutChangeCount, renderTriggerKey, diffMode, diffResult, selectNode, updateNodePosition, focusNodeId, hasActiveFilters]);

  // Minimap drawings synchronization
  useEffect(() => {
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!minimapOpen || !cyInstance || !activeProject) {
      ctx.fillStyle = '#181825';
      ctx.fillRect(0, 0, canvas.width || 140, canvas.height || 90);
      return;
    }

    const drawMinimap = () => {
      if (!cyInstance || cyInstance.destroyed()) return;
      const modelBB = cyInstance.elements().boundingBox();
      const viewportBB = cyInstance.extent();

      const minX = Math.min(modelBB.x1, viewportBB.x1);
      const maxX = Math.max(modelBB.x2, viewportBB.x2);
      const minY = Math.min(modelBB.y1, viewportBB.y1);
      const maxY = Math.max(modelBB.y2, viewportBB.y2);
      const w = maxX - minX;
      const h = maxY - minY;

      if (w === 0 || h === 0) return;

      const padding = 4;
      const availableW = 140 - 2 * padding;
      const availableH = 90 - 2 * padding;
      const scale = Math.min(availableW / w, availableH / h);
      const offsetX = padding + (availableW - w * scale) / 2 - minX * scale;
      const offsetY = padding + (availableH - h * scale) / 2 - minY * scale;

      ctx.fillStyle = '#181825';
      ctx.fillRect(0, 0, 140, 90);

      cyInstance.nodes().forEach((node) => {
        const pos = node.position();
        const cx = pos.x * scale + offsetX;
        const cy = pos.y * scale + offsetY;

        const type = node.data('type');
        let nodeColor = '#6c7086';
        if (type === 'root') nodeColor = '#cba6f7';
        else if (type === 'subdomain') {
          const sc = node.data('nodeData')?.status_code;
          if (sc === null || sc === undefined) {
            nodeColor = '#6c7086';
          } else if (sc === 0 || sc >= 500) {
            nodeColor = '#f38ba8';
          } else if (sc >= 200 && sc < 300) {
            nodeColor = '#a6e3a1';
          } else if (sc >= 300 && sc < 400) {
            nodeColor = '#f9e2af';
          } else if (sc >= 400 && sc < 500) {
            nodeColor = '#fab387';
          } else {
            nodeColor = '#6c7086';
          }
        } else if (type === 'endpoint') nodeColor = '#89dceb';
        else if (type === 'finding') nodeColor = '#f38ba8';
        else if (type === 'ip') nodeColor = '#89b4fa';
        else if (type === 'technology') nodeColor = '#f9e2af';

        ctx.fillStyle = nodeColor;
        ctx.beginPath();
        ctx.arc(cx, cy, 1.8, 0, 2 * Math.PI);
        ctx.fill();
      });

      const vx1 = viewportBB.x1 * scale + offsetX;
      const vy1 = viewportBB.y1 * scale + offsetY;
      const vw = viewportBB.w * scale;
      const vh = viewportBB.h * scale;

      ctx.strokeStyle = '#89b4fa';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(vx1, vy1, vw, vh);

      ctx.fillStyle = 'rgba(137, 180, 250, 0.12)';
      ctx.fillRect(vx1, vy1, vw, vh);
    };

    cyInstance.on('pan zoom position render', drawMinimap);
    drawMinimap();

    let isDragging = false;
    const handleInteraction = (e: MouseEvent) => {
      if (!cyInstance || cyInstance.destroyed()) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const modelBB = cyInstance.elements().boundingBox();
      const viewportBB = cyInstance.extent();

      const minX = Math.min(modelBB.x1, viewportBB.x1);
      const maxX = Math.max(modelBB.x2, viewportBB.x2);
      const minY = Math.min(modelBB.y1, viewportBB.y1);
      const maxY = Math.max(modelBB.y2, viewportBB.y2);
      const w = maxX - minX;
      const h = maxY - minY;

      if (w === 0 || h === 0) return;

      const padding = 4;
      const availableW = 140 - 2 * padding;
      const availableH = 90 - 2 * padding;
      const scale = Math.min(availableW / w, availableH / h);
      const offsetX = padding + (availableW - w * scale) / 2 - minX * scale;
      const offsetY = padding + (availableH - h * scale) / 2 - minY * scale;

      const modelX = (mx - offsetX) / scale;
      const modelY = (my - offsetY) / scale;

      cyInstance.pan({
        x: cyInstance.width() / 2 - modelX * cyInstance.zoom(),
        y: cyInstance.height() / 2 - modelY * cyInstance.zoom(),
      });
    };

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      handleInteraction(e);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handleInteraction(e);
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      if (cyInstance && !cyInstance.destroyed()) {
        try {
          cyInstance.off('pan zoom position render', drawMinimap);
        } catch (e) {
          console.warn('Failed to remove minimap listener:', e);
        }
      }
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [minimapOpen, cyInstance, activeProject]);

  const runLayout = (cy: cytoscape.Core, layoutName: string) => {
    if (cy.nodes().length <= 1) {
      const importState = useImportStore.getState();
      if (importState.isImporting) {
        requestAnimationFrame(() => {
          useImportStore.getState().setProgress({ phase: 'done', percent: 100 });
        });
      }
      setLayoutChanging(false);
      return;
    }

    // Find all distinct graph IDs of visible nodes
    const graphIds = Array.from(new Set(
      cy.nodes(':visible')
        .map((n) => n.data('nodeData')?.graph_id)
        .filter(Boolean)
    )) as string[];

    const nodeCount = cy.nodes().length;
    const isMediumOrLarge = nodeCount > 600;

    let baseLayoutConfig: any = { name: layoutName, animate: true, animationDuration: 400 };

    if (layoutName === 'cola') {
      baseLayoutConfig = {
        name: 'cola',
        animate: true,
        animationDuration: 300,
        randomize: false,
        fit: false,
        padding: 60,
        nodeSpacing: () => 80,
        edgeLength: () => 160,
        maxSimulationTime: 2000,
      };
    } else if (layoutName === 'dagre') {
      baseLayoutConfig = {
        name: 'dagre',
        rankDir: 'TB',
        nodeSep: 100,
        rankSep: 140,
        animate: !isMediumOrLarge,
        fit: false,
        padding: 50,
      };
    } else if (layoutName === 'breadthfirst') {
      baseLayoutConfig = {
        name: 'breadthfirst',
        directed: true,
        circle: false,
        spacingFactor: 2.0,
        animate: !isMediumOrLarge,
        fit: false,
        padding: 50,
      };
    } else if (layoutName === 'circle') {
      baseLayoutConfig = { name: 'circle', fit: false, padding: 50 };
    } else if (layoutName === 'grid') {
      baseLayoutConfig = { name: 'grid', fit: false, padding: 50 };
    } else if (layoutName === 'preset') {
      baseLayoutConfig = { name: 'preset', fit: false, padding: 50 };
    }

    const N = Math.max(1, graphIds.length);
    let completedLayouts = 0;

    const onLayoutStop = () => {
      completedLayouts++;
      if (completedLayouts === N) {
        // Fit view to all visible elements once all graph layouts are complete
        cy.fit(cy.elements(':visible'), 60);

        const importState = useImportStore.getState();
        if (importState.isImporting && importState.phase === 'rendering') {
          useImportStore.getState().setProgress({ phase: 'rendering', percent: 98 });
          setTimeout(() => {
            requestAnimationFrame(() => {
              useImportStore.getState().setProgress({ phase: 'done', percent: 100 });
            });
          }, 600);
        }
        setLayoutChanging(false);
      }
    };

    const importState = useImportStore.getState();
    if (importState.isImporting && importState.phase === 'rendering') {
      importState.setProgress({ percent: 90 });
    }

    if (graphIds.length <= 1) {
      // Single graph, run layout on all elements
      const rootNode = cy.nodes('[type = "root"]').first();
      if (rootNode.length > 0) {
        rootNode.position({ x: cy.width() / 2, y: cy.height() / 2 });
        rootNode.lock();
      }
      const l = cy.layout({ ...baseLayoutConfig, fit: false });
      l.on('layoutstop', onLayoutStop);
      l.run();
    } else {
      // Multiple graphs, run layout on each graph independently in side-by-side bounding boxes
      const centerX = cy.width() / 2;
      const centerY = cy.height() / 2;
      const boxWidth = 6000;
      const boxHeight = 4000;
      const horizontalStep = 9000; // 6000 width + 3000 spacing gap

      graphIds.forEach((graphId, i) => {
        const xOffset = centerX + (i - (N - 1) / 2) * horizontalStep;
        const yOffset = centerY;

        const boundingBox = {
          x1: xOffset - boxWidth / 2,
          y1: yOffset - boxHeight / 2,
          x2: xOffset + boxWidth / 2,
          y2: yOffset + boxHeight / 2,
          w: boxWidth,
          h: boxHeight
        };

        const nodesInGraph = cy.nodes().filter((node) => node.data('nodeData')?.graph_id === graphId);
        const nodesCollection = cy.collection(nodesInGraph);
        const edgesInGraph = nodesCollection.connectedEdges();
        const elementsInGraph = nodesCollection.union(edgesInGraph);

        // Position and lock the root node of this graph at the center of its bounding box
        const rootNode = nodesCollection.filter('[type = "root"]').first();
        if (rootNode.length > 0) {
          (rootNode as any).position({ x: xOffset, y: yOffset });
          (rootNode as any).lock();
        }

        const l = elementsInGraph.layout({
          ...baseLayoutConfig,
          boundingBox,
          fit: false
        });
        l.on('layoutstop', onLayoutStop);
        l.run();
      });
    }
  };

  const handleOpenNode = () => {
    if (!contextMenu.node) return;
    const url = contextMenu.node.label.startsWith('http') ? contextMenu.node.label : `https://${contextMenu.node.label}`;
    openShell(url).catch(() => window.open(url, '_blank'));
    setContextMenu((p) => ({ ...p, visible: false }));
  };

  const handleCopyNode = () => {
    if (!contextMenu.node) return;
    navigator.clipboard.writeText(contextMenu.node.label);
    alert("Copied to clipboard!");
    setContextMenu((p) => ({ ...p, visible: false }));
  };

  const handleInlineTagSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contextMenu.node || !inlineInputValue.trim()) return;
    try {
      await addTag(contextMenu.node.id, inlineInputValue.trim());
      window.dispatchEvent(new CustomEvent('node-data-updated', { detail: { nodeId: contextMenu.node.id } }));
      setInlineInputType(null);
      setInlineInputValue('');
      setContextMenu((p) => ({ ...p, visible: false }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleInlineNoteSubmit = async () => {
    if (!contextMenu.node || !inlineInputValue.trim()) return;
    try {
      await addNote(contextMenu.node.id, inlineInputValue.trim());
      window.dispatchEvent(new CustomEvent('node-data-updated', { detail: { nodeId: contextMenu.node.id } }));
      setInlineInputType(null);
      setInlineInputValue('');
      setContextMenu((p) => ({ ...p, visible: false }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!contextMenu.node) return;
    try {
      await deleteNode(contextMenu.node.id);
      setConfirmDelete(false);
      setContextMenu((p) => ({ ...p, visible: false }));
    } catch (err) {
      console.error(err);
    }
  };

  const menuRowStyle: React.CSSProperties = {
    padding: '4px 12px',
    cursor: 'pointer',
    color: '#cdd6f4',
    fontFamily: 'monospace',
  };

  const separatorStyle: React.CSSProperties = {
    height: '1px',
    backgroundColor: '#313244',
    margin: '4px 0',
  };

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        height: '100%',
        position: 'relative',
        backgroundColor: '#1e1e2e',
        backgroundImage: gridOpen
          ? 'radial-gradient(#313244 1px, transparent 1px)'
          : 'none',
        backgroundSize: '24px 24px',
      }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Hover Info Tooltip */}
      {hoveredNode && (
        <div
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            backgroundColor: 'rgba(24, 24, 37, 0.95)',
            border: '1px solid #45475a',
            padding: '8px 12px',
            zIndex: 60,
            fontSize: '11px',
            color: '#cdd6f4',
            maxWidth: '320px',
            fontFamily: 'monospace',
            borderRadius: 0,
          }}
        >
          <div style={{ fontWeight: 'bold', color: '#89b4fa', wordBreak: 'break-all' }}>
            {hoveredNode.label}
          </div>
          <div style={{ fontSize: '10px', color: '#a6e3a1', marginTop: '2px' }}>
            Type: {hoveredNode.type} {hoveredNode.status_code !== null && hoveredNode.status_code !== undefined ? `| Status: ${hoveredNode.status_code}` : ''}
          </div>
          {hoveredNode.ip && <div style={{ fontSize: '9px', color: '#89b4fa' }}>IP: {hoveredNode.ip}</div>}
          {hoveredNode.title && <div style={{ fontSize: '9px', color: '#f9e2af' }}>Title: {hoveredNode.title}</div>}
          {hoveredNode.found_by && <div style={{ fontSize: '9px', color: '#585b70' }}>Found by: {hoveredNode.found_by}</div>}
        </div>
      )}

      {/* EMPTY STATE */}
      {!activeProject && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            fontFamily: 'monospace',
            backgroundColor: 'transparent',
            backgroundImage: 'radial-gradient(circle at center, rgba(137, 180, 250, 0.05) 0%, rgba(30, 30, 46, 0) 70%)',
            overflowY: 'auto',
            padding: '24px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '520px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxSizing: 'border-box',
            }}
          >
            {/* Search and Add Bar */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                width: '100%',
              }}
            >
              <div
                style={{
                  position: 'relative',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <input
                  type="text"
                  placeholder="Search or add project (e.g. 'Project domain.com')..."
                  value={homeSearchQuery}
                  onChange={(e) => setHomeSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && homeSearchQuery.trim()) {
                      e.preventDefault();
                      const filtered = recentProjects.filter(p =>
                        p.name.toLowerCase().includes(homeSearchQuery.toLowerCase()) ||
                        p.root_domain.toLowerCase().includes(homeSearchQuery.toLowerCase())
                      );
                      if (filtered.length === 1) {
                        openProject(filtered[0].id);
                        setHomeSearchQuery('');
                      } else if (filtered.length === 0) {
                        handleHomeNewProject();
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    height: '32px',
                    backgroundColor: '#181825',
                    border: '1px solid #313244',
                    color: '#cdd6f4',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    padding: '0 12px',
                    outline: 'none',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                    transition: 'border-color 0.15s ease',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = '#89b4fa')}
                  onBlur={(e) => (e.target.style.borderColor = '#313244')}
                />
                {homeSearchQuery && (
                  <span
                    onClick={() => setHomeSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '12px',
                      cursor: 'pointer',
                      color: '#6c7086',
                      fontSize: '12px',
                      fontWeight: 'bold',
                    }}
                  >
                    ×
                  </span>
                )}
              </div>

              <button
                onClick={() => handleHomeNewProject()}
                style={{
                  height: '32px',
                  padding: '0 16px',
                  backgroundColor: '#313244',
                  border: '1px solid #45475a',
                  color: '#89b4fa',
                  fontFamily: 'monospace',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(137, 180, 250, 0.12)';
                  e.currentTarget.style.borderColor = '#89b4fa';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#313244';
                  e.currentTarget.style.borderColor = '#45475a';
                }}
              >
                [+ ADD]
              </button>
            </div>

            {/* List of projects */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '360px',
                overflowY: 'auto',
                paddingRight: '4px',
              }}
            >
              {recentProjects
                .filter(p =>
                  p.name.toLowerCase().includes(homeSearchQuery.toLowerCase()) ||
                  p.root_domain.toLowerCase().includes(homeSearchQuery.toLowerCase())
                )
                .length === 0 ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: '#585b70',
                    fontSize: '11px',
                    border: '1px dashed #313244',
                    backgroundColor: 'rgba(24, 24, 37, 0.4)',
                  }}
                >
                  {recentProjects.length === 0 ? (
                    <>
                      No workspaces found.
                      <div style={{ marginTop: '6px', color: '#89b4fa' }}>
                        Create a project to begin.
                      </div>
                    </>
                  ) : (
                    `No projects found matching "${homeSearchQuery}"`
                  )}
                </div>
              ) : (
                recentProjects
                  .filter(p =>
                    p.name.toLowerCase().includes(homeSearchQuery.toLowerCase()) ||
                    p.root_domain.toLowerCase().includes(homeSearchQuery.toLowerCase())
                  )
                  .map((proj) => (
                    <ProjectItemRow
                      key={proj.id}
                      project={proj}
                      onOpen={() => openProject(proj.id)}
                      onDelete={async () => {
                        const confirmed = await ask(
                          `Are you sure you want to delete project "${proj.name}"? This action cannot be undone.`,
                          { title: 'Delete Workspace', kind: 'warning' }
                        );
                        if (confirmed) {
                          deleteProject(proj.id);
                        }
                      }}
                    />
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MINIMAP CANVAS */}
      {minimapOpen && (
        <canvas
          ref={minimapCanvasRef}
          width={140}
          height={90}
          style={{
            position: 'absolute',
            bottom: '12px',
            right: '12px',
            width: '140px',
            height: '90px',
            backgroundColor: '#181825',
            border: '1px solid #313244',
            cursor: 'pointer',
            zIndex: 60,
          }}
        />
      )}

      {/* RIGHT-CLICK CONTEXT MENU */}
      {contextMenu.visible && (
        <div
          className="context-menu-container"
          style={{
            position: 'fixed',
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
            backgroundColor: '#1e1e2e',
            border: '1px solid #313244',
            zIndex: 600,
            minWidth: '170px',
            padding: '4px 0',
            fontSize: '11px',
            boxShadow: 'none',
            borderRadius: 0,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node ? (
            <>
              <div
                style={menuRowStyle}
                onClick={handleOpenNode}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Open
              </div>
              <div
                style={menuRowStyle}
                onClick={handleCopyNode}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Copy
              </div>
              <div
                style={menuRowStyle}
                onClick={() => {
                  if (contextMenu.node) toggleFavorite(contextMenu.node.id, contextMenu.node.is_favorite);
                  setContextMenu((p) => ({ ...p, visible: false }));
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {contextMenu.node.is_favorite === 1 ? 'Remove from Favorites' : 'Mark as Favorite'}
              </div>

              <div
                style={menuRowStyle}
                onClick={() => setInlineInputType('tag')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Add Tag
              </div>
              {inlineInputType === 'tag' && (
                <form onSubmit={handleInlineTagSubmit} style={{ padding: '4px 12px' }}>
                  <input
                    type="text"
                    placeholder="tag name..."
                    autoFocus
                    value={inlineInputValue}
                    onChange={(e) => setInlineInputValue(e.target.value)}
                    style={{
                      width: '100%',
                      fontSize: '10px',
                      padding: '2px',
                      backgroundColor: '#181825',
                      border: '1px solid #313244',
                      color: '#cdd6f4',
                      fontFamily: 'monospace',
                    }}
                  />
                </form>
              )}

              <div
                style={menuRowStyle}
                onClick={() => setInlineInputType('note')}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Add Note
              </div>
              {inlineInputType === 'note' && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleInlineNoteSubmit();
                  }}
                  style={{ padding: '4px 12px' }}
                >
                  <textarea
                    placeholder="note content..."
                    autoFocus
                    value={inlineInputValue}
                    onChange={(e) => setInlineInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleInlineNoteSubmit();
                      }
                    }}
                    style={{
                      width: '100%',
                      height: '40px',
                      fontSize: '10px',
                      padding: '2px',
                      backgroundColor: '#181825',
                      border: '1px solid #313244',
                      color: '#cdd6f4',
                      fontFamily: 'monospace',
                      resize: 'none',
                    }}
                  />
                </form>
              )}



              <div
                style={menuRowStyle}
                onClick={() => {
                  if (contextMenu.node) setFocusNodeId(contextMenu.node.id);
                  setContextMenu((p) => ({ ...p, visible: false }));
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Show Only This
              </div>
              <div
                style={menuRowStyle}
                onClick={() => {
                  if (contextMenu.node) togglePin(contextMenu.node.id, contextMenu.node.is_pinned);
                  setContextMenu((p) => ({ ...p, visible: false }));
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {contextMenu.node.is_pinned === 1 ? 'Unpin Node' : 'Pin Node'}
              </div>

              <div style={separatorStyle} />

              {!confirmDelete ? (
                <div
                  style={{ ...menuRowStyle, color: '#f38ba8' }}
                  onClick={() => setConfirmDelete(true)}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  Delete from Graph
                </div>
              ) : (
                <div style={{ padding: '6px 12px', borderTop: '1px solid #313244', backgroundColor: '#181825' }}>
                  <div style={{ color: '#f38ba8', marginBottom: '4px', fontSize: '10px' }}>
                    delete {contextMenu.node.label}?
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span
                      style={{ color: '#a6e3a1', cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={handleDeleteConfirm}
                    >
                      [YES]
                    </span>
                    <span
                      style={{ color: '#f38ba8', cursor: 'pointer', fontWeight: 'bold' }}
                      onClick={() => setConfirmDelete(false)}
                    >
                      [NO]
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div
                style={menuRowStyle}
                onClick={() => {
                  clearFilters();
                  setContextMenu((p) => ({ ...p, visible: false }));
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#313244')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                Clear Filters & Reset Graph
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
