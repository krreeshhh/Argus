import type {
  Project,
  ProjectSummary,
  Graph,
  Node,
  Edge,
  FilterSpec,
  GraphLayout,
  DiffResult,
  ReconTool,
  ImportSummary,
  FolderImportSummary,
} from '../types';
import { create } from 'zustand';
import { safeInvoke } from '../utils/tauri';
import { useImportStore } from './useImportStore';

interface ArgusState {
  activeProject: Project | null;
  recentProjects: ProjectSummary[];
  availableGraphs: Graph[];
  selectedGraphIds: string[];
  nodes: Node[];
  edges: Edge[];
  selectedNode: Node | null;
  selectedNodeEndpoints: Node[];
  selectedNodeEndpointsTotalCount: number;
  filters: FilterSpec;
  activeLayout: GraphLayout;
  isLayoutChanging: boolean;
  layoutChangeCount: number;
  renderTriggerKey: number;
  focusNodeId: string | null;
  
  stationOpen: boolean;
  scopeOpen: boolean;
  commandBarOpen: boolean;
  minimapOpen: boolean;
  gridOpen: boolean;
  searchModalOpen: boolean;
  shortcutOverlayOpen: boolean;
  compareModalOpen: boolean;
  settingsModalOpen: boolean;
  endpointsModalOpen: boolean;
  setEndpointsModalOpen: (open: boolean) => void;

  diffMode: boolean;
  diffResult: DiffResult | null;
  
  statsFlashed: boolean;

  fetchRecentProjects: () => Promise<void>;
  createProject: (name: string, rootDomain: string) => Promise<void>;
  openProject: (projectId: string) => Promise<void>;
  closeProject: () => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  saveProject: () => Promise<void>;
  exportProject: (targetPath: string) => Promise<void>;
  importProject: (sourcePath: string) => Promise<Project>;
  
  toggleGraphSelection: (graphId: string) => void;
  loadSelectedGraphs: () => Promise<void>;

  importFile: (path: string, tool: ReconTool) => Promise<ImportSummary>;
  importFolder: (folderPath: string) => Promise<FolderImportSummary>;
  importFolderAsProject: (folderPath: string) => Promise<FolderImportSummary>;
  
  selectNode: (node: Node | null) => void;
  fetchEndpointsForSelectedNode: (nodeId: string, searchQuery?: string, offset?: number, limit?: number) => Promise<void>;
  setFilters: (filters: Partial<FilterSpec>) => void;
  clearFilters: () => Promise<void>;
  setLayout: (layout: GraphLayout) => void;
  setLayoutChanging: (changing: boolean) => void;
  setFocusNodeId: (nodeId: string | null) => void;

  toggleFavorite: (nodeId: string, currentVal: number) => Promise<void>;
  addTag: (nodeId: string, label: string) => Promise<void>;
  removeTag: (nodeId: string, label: string) => Promise<void>;
  addNote: (nodeId: string, body: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  togglePin: (nodeId: string, currentVal: number) => Promise<void>;
  toggleCollapse: (nodeId: string, currentVal: number) => Promise<void>;
  updateNodePosition: (nodeId: string, x: number, y: number) => Promise<void>;

  toggleStation: () => void;
  toggleScope: () => void;
  toggleCommandBar: () => void;
  toggleMinimap: () => void;
  toggleGrid: () => void;
  setSearchModalOpen: (open: boolean) => void;
  setShortcutOverlayOpen: (open: boolean) => void;
  setCompareModalOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean) => void;
  
  runDiff: (graphIdA: string, graphIdB: string) => Promise<void>;
  exitDiffMode: () => void;
  
  triggerStatsFlash: () => void;
}

export const useArgusStore = create<ArgusState>((set, get) => ({
  activeProject: null,
  recentProjects: [],
  availableGraphs: [],
  selectedGraphIds: [],
  nodes: [],
  edges: [],
  selectedNode: null,
  selectedNodeEndpoints: [],
  selectedNodeEndpointsTotalCount: 0,
  filters: {},
  activeLayout: 'cola',
  isLayoutChanging: false,
  layoutChangeCount: 0,
  renderTriggerKey: 0,
  focusNodeId: null,

  stationOpen: true,
  scopeOpen: true,
  commandBarOpen: true,
  minimapOpen: true,
  gridOpen: true,
  searchModalOpen: false,
  shortcutOverlayOpen: false,
  compareModalOpen: false,
  settingsModalOpen: false,
  endpointsModalOpen: false,

  diffMode: false,
  diffResult: null,
  statsFlashed: false,

  fetchRecentProjects: async () => {
    try {
      const recent = await safeInvoke<ProjectSummary[]>('project_list_recent');
      set({ recentProjects: recent || [] });
    } catch (err) {
      console.error('Failed to fetch recent projects:', err);
    }
  },

  createProject: async (name, rootDomain) => {
    const isAlreadyImporting = useImportStore.getState().isImporting;
    if (!isAlreadyImporting) {
      useImportStore.getState().startImport(`Project: ${name}`);
      useImportStore.getState().setProgress({ phase: 'loading', percent: 70 });
    }

    try {
      const project = await safeInvoke<Project>('project_new', { name, rootDomain });
      set({ activeProject: project, selectedGraphIds: [] });
      localStorage.setItem('lastActiveProjectId', project.id);
      await get().fetchRecentProjects();
      await get().loadSelectedGraphs();
    } catch (err) {
      console.error('Failed to create project:', err);
      if (!isAlreadyImporting) {
        useImportStore.getState().failImport(String(err));
      }
      throw err;
    }
  },

  openProject: async (projectId) => {
    const isAlreadyImporting = useImportStore.getState().isImporting;
    if (!isAlreadyImporting) {
      useImportStore.getState().startImport(`Project: ${projectId}`);
      useImportStore.getState().setProgress({ phase: 'loading', percent: 70 });
    }

    try {
      const response = await safeInvoke<{ project: Project; viewport_state: any }>('project_open', { projectId });
      const { project, viewport_state } = response;
      if (viewport_state) {
        let parsedFilters = {};
        try {
          parsedFilters = JSON.parse(viewport_state.filters_json);
        } catch (e) {}

        set({
          activeProject: project,
          selectedGraphIds: [],
          filters: parsedFilters,
          focusNodeId: viewport_state.focus_node_id || null,
          activeLayout: (viewport_state.active_layout as any) || 'cola',
          stationOpen: viewport_state.station_open === 1,
          scopeOpen: viewport_state.scope_open === 1,
          commandBarOpen: viewport_state.command_bar_open === 1,
          minimapOpen: viewport_state.minimap_open === 1,
          gridOpen: viewport_state.grid_open === 1,
        });
      } else {
        set({ activeProject: project, selectedGraphIds: [] });
      }
      localStorage.setItem('lastActiveProjectId', project.id);
      await get().fetchRecentProjects();
      await get().loadSelectedGraphs();
    } catch (err) {
      console.error('Failed to open project:', err);
      if (!isAlreadyImporting) {
        useImportStore.getState().failImport(String(err));
      }
      throw err;
    }
  },

  closeProject: async () => {
    const { activeProject } = get();
    if (activeProject) {
      try {
        await get().saveProject();
        await safeInvoke('project_close', { projectId: activeProject.id });
      } catch (e) {
        console.error(e);
      }
    }
    localStorage.removeItem('lastActiveProjectId');
    set({
      activeProject: null,
      availableGraphs: [],
      selectedGraphIds: [],
      nodes: [],
      edges: [],
      selectedNode: null,
      focusNodeId: null,
    });
  },

  saveProject: async () => {
    const {
      activeProject,
      filters,
      focusNodeId,
      activeLayout,
      stationOpen,
      scopeOpen,
      commandBarOpen,
      minimapOpen,
      gridOpen,
    } = get();

    if (!activeProject) return;

    const viewportState = {
      project_id: activeProject.id,
      filters_json: JSON.stringify(filters || {}),
      focus_node_id: focusNodeId,
      active_layout: activeLayout,
      station_open: stationOpen ? 1 : 0,
      scope_open: scopeOpen ? 1 : 0,
      command_bar_open: commandBarOpen ? 1 : 0,
      minimap_open: minimapOpen ? 1 : 0,
      grid_open: gridOpen ? 1 : 0,
    };

    try {
      await safeInvoke('project_save', {
        projectId: activeProject.id,
        viewportState,
      });
    } catch (err) {
      console.error('Failed to save project viewport state:', err);
    }
  },

  exportProject: async (targetPath) => {
    const { activeProject } = get();
    if (!activeProject) return;
    try {
      await get().saveProject();
      await safeInvoke('project_export', { projectId: activeProject.id, targetPath });
    } catch (err) {
      console.error('Failed to export project:', err);
      throw err;
    }
  },

  importProject: async (sourcePath) => {
    try {
      const project = await safeInvoke<Project>('project_import', { sourcePath });
      await get().fetchRecentProjects();
      return project;
    } catch (err) {
      console.error('Failed to import project:', err);
      throw err;
    }
  },

  deleteProject: async (projectId) => {
    try {
      await safeInvoke('project_delete', { projectId });
      if (localStorage.getItem('lastActiveProjectId') === projectId) {
        localStorage.removeItem('lastActiveProjectId');
      }
      if (get().activeProject?.id === projectId) {
        set({ activeProject: null, nodes: [], edges: [], selectedNode: null });
      }
      await get().fetchRecentProjects();
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  },

  toggleGraphSelection: (graphId) => {
    const { activeProject, selectedGraphIds } = get();
    if (!activeProject) return;

    const next = selectedGraphIds.includes(graphId)
      ? selectedGraphIds.filter((id) => id !== graphId)
      : [...selectedGraphIds, graphId];
    set({ selectedGraphIds: next });
    useImportStore.getState().startImport('Filter: Applying Filter Criteria');
    useImportStore.getState().setProgress({ phase: 'loading', percent: 70 });
    get().loadSelectedGraphs();
  },

  loadSelectedGraphs: async () => {
    const { activeProject, selectedGraphIds, filters } = get();
    if (!activeProject) return;

    const isAlreadyImporting = useImportStore.getState().isImporting;
    if (isAlreadyImporting) {
      await new Promise((resolve) => setTimeout(resolve, 180));
    }

    try {
      if (useImportStore.getState().isImporting) {
        useImportStore.getState().setProgress({ phase: 'loading', percent: 72 });
      }

      const graphs = await safeInvoke<Graph[]>('graph_list_available', { projectId: activeProject.id });
      let gIds = selectedGraphIds;
      if (gIds.length === 0 && graphs && graphs.length > 0) {
        gIds = graphs.map((g) => g.id);
      }

      const nodes = await safeInvoke<Node[]>('graph_get_nodes', {
        projectId: activeProject.id,
        graphIds: gIds,
        filters,
      });

      if (useImportStore.getState().isImporting) {
        useImportStore.getState().setProgress({ phase: 'loading', percent: 78 });
      }

      const edges = await safeInvoke<Edge[]>('graph_get_edges', {
        projectId: activeProject.id,
        graphIds: gIds,
      });

      const isImporting = useImportStore.getState().isImporting;
      set((state) => ({
        availableGraphs: graphs || [],
        selectedGraphIds: gIds,
        nodes: nodes || [],
        edges: edges || [],
        renderTriggerKey: isImporting ? state.renderTriggerKey + 1 : state.renderTriggerKey,
      }));

      if (isImporting) {
        useImportStore.getState().setProgress({ phase: 'rendering', percent: 85 });
      }
    } catch (err) {
      console.error('Failed to load graph nodes/edges:', err);
      if (useImportStore.getState().isImporting) {
        useImportStore.getState().failImport(String(err));
      }
    }
  },

  importFile: async (path, tool) => {
    const { activeProject, selectedGraphIds } = get();
    if (!activeProject) throw new Error('No active project');

    useImportStore.getState().startImport(path.split(/[\\/]/).pop() || '');

    try {
      const summary = await safeInvoke<ImportSummary>('import_parse_file', {
        path,
        tool,
        projectId: activeProject.id,
        graphId: selectedGraphIds[0] || null,
      });

      useImportStore.getState().setProgress({ phase: 'loading', percent: 70 });
      get().triggerStatsFlash();
      await get().loadSelectedGraphs();
      await get().fetchRecentProjects();
      return summary;
    } catch (err) {
      const errMsg = String(err);
      useImportStore.getState().failImport(errMsg);
      throw err;
    }
  },

  importFolder: async (folderPath) => {
    const { activeProject, selectedGraphIds } = get();
    if (!activeProject) throw new Error('No active project');

    useImportStore.getState().startImport(folderPath.split(/[\\/]/).pop() || '');

    try {
      const summary = await safeInvoke<FolderImportSummary>('import_parse_folder', {
        folderPath,
        projectId: activeProject.id,
        graphId: selectedGraphIds[0] || null,
      });

      useImportStore.getState().setProgress({ phase: 'loading', percent: 70 });
      get().triggerStatsFlash();
      await get().loadSelectedGraphs();
      await get().fetchRecentProjects();
      return summary;
    } catch (err) {
      const errMsg = String(err);
      useImportStore.getState().failImport(errMsg);
      throw err;
    }
  },

  importFolderAsProject: async (folderPath) => {
    useImportStore.getState().startImport(folderPath.split(/[\\/]/).pop() || '');

    try {
      const summary = await safeInvoke<FolderImportSummary>('import_create_project_from_folder', {
        folderPath,
      });

      useImportStore.getState().setProgress({ phase: 'loading', percent: 70 });
      await get().fetchRecentProjects();
      const recents = get().recentProjects;
      if (recents.length > 0) {
        await get().openProject(recents[0].id);
      }
      return summary;
    } catch (err) {
      const errMsg = String(err);
      useImportStore.getState().failImport(errMsg);
      throw err;
    }
  },

  selectNode: (node) => {
    set({ selectedNode: node });
    if (node) {
      get().fetchEndpointsForSelectedNode(node.id);
    } else {
      set({ selectedNodeEndpoints: [], selectedNodeEndpointsTotalCount: 0 });
    }
  },

  fetchEndpointsForSelectedNode: async (nodeId, searchQuery, offset = 0, limit = 500) => {
    const { activeProject } = get();
    if (!activeProject) return;
    try {
      const res = await safeInvoke<{ endpoints: Node[]; total_count: number }>('node_get_endpoints', {
        projectId: activeProject.id,
        nodeId,
        searchQuery: searchQuery || null,
        offset,
        limit,
      });
      const newEndpoints = res?.endpoints || [];
      const totalCount = res?.total_count || 0;
      set((state) => ({
        selectedNodeEndpoints: offset === 0 ? newEndpoints : [...state.selectedNodeEndpoints, ...newEndpoints],
        selectedNodeEndpointsTotalCount: totalCount,
      }));
    } catch (err) {
      console.error('Failed to fetch endpoints for selected node:', err);
    }
  },

  setFilters: (newFilters) => {
    const { activeProject } = get();
    if (!activeProject) return;

    set((state) => ({ filters: { ...state.filters, ...newFilters } }));
    useImportStore.getState().startImport('Filter: Applying Filter Criteria');
    useImportStore.getState().setProgress({ phase: 'loading', percent: 70 });
    get().loadSelectedGraphs();
  },

  clearFilters: async () => {
    const { activeProject } = get();
    if (!activeProject) return;

    useImportStore.getState().startImport('Filter: Applying Filter Criteria');
    useImportStore.getState().setProgress({ phase: 'loading', percent: 50 });

    set({ filters: {}, focusNodeId: null });
    try {
      await safeInvoke('node_unhide_all', { projectId: activeProject.id });
    } catch (err) {
      console.error('Failed to unhide all nodes on clear filters:', err);
    }
    useImportStore.getState().setProgress({ phase: 'loading', percent: 70 });
    await get().loadSelectedGraphs();
  },

  setLayoutChanging: (changing) => set({ isLayoutChanging: changing }),
  setLayout: (layout) => {
    const { activeProject } = get();
    if (!activeProject) return;
    set({ isLayoutChanging: true });
    setTimeout(() => {
      set((state) => ({
        activeLayout: layout,
        layoutChangeCount: state.layoutChangeCount + 1,
      }));
    }, 180);
  },

  toggleFavorite: async (nodeId, currentVal) => {
    const { activeProject } = get();
    if (!activeProject) return;
    const nextVal = currentVal === 0;
    
    // 1. Optimistic Zustand update
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, is_favorite: nextVal ? 1 : 0 } : n
      ),
      selectedNode: state.selectedNode?.id === nodeId
        ? { ...state.selectedNode, is_favorite: nextVal ? 1 : 0 }
        : state.selectedNode
    }));

    // 2. Synchronous Cytoscape update in-place
    const cy = (window as any).cy;
    if (cy) {
      cy.batch(() => {
        const el = cy.getElementById(nodeId);
        if (el.length > 0) {
          const nData = el.data('nodeData');
          if (nData) {
            nData.is_favorite = nextVal ? 1 : 0;
            
            // Recompute visual attributes based on new favorite state
            let size = nData.type === 'root' ? 36 : nData.type === 'subdomain' ? 24 : nData.type === 'ip' ? 26 : nData.type === 'technology' ? 24 : nData.type === 'finding' ? 34 : 28;
            if (nextVal) {
              el.data('borderColor', '#f9e2af');
              el.data('shape', 'star');
              el.data('borderWidth', 3);
              el.data('size', size * 1.3);
            } else {
              let borderColor = '#585b70';
              const sc = nData.status_code;
              if (sc !== null && sc !== undefined) {
                if (sc === 0) borderColor = '#f38ba8';
                else if (sc >= 200 && sc < 300) borderColor = '#a6e3a1';
                else if (sc >= 300 && sc < 400) borderColor = '#f9e2af';
                else if (sc >= 400 && sc < 500) borderColor = '#fab387';
                else if (sc >= 500) borderColor = '#f38ba8';
              }
              el.data('borderColor', borderColor);
              el.data('shape', nData.type === 'root' ? 'hexagon' : nData.type === 'finding' ? 'triangle' : 'ellipse');
              el.data('borderWidth', nData.type === 'finding' ? 3 : 1);
              el.data('size', size);
            }
          }
        }
      });
    }

    // 3. Asynchronous DB call
    safeInvoke('node_set_favorite', {
      projectId: activeProject.id,
      nodeId,
      value: nextVal,
    }).catch((err) => {
      console.error('Failed to save favorite state:', err);
      // Revert optimistic update on failure
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, is_favorite: currentVal } : n
        ),
        selectedNode: state.selectedNode?.id === nodeId
          ? { ...state.selectedNode, is_favorite: currentVal }
          : state.selectedNode
      }));
      if (cy) {
        cy.batch(() => {
          const el = cy.getElementById(nodeId);
          if (el.length > 0) {
            const nData = el.data('nodeData');
            if (nData) {
              nData.is_favorite = currentVal;
              let size = nData.type === 'root' ? 36 : nData.type === 'subdomain' ? 24 : nData.type === 'ip' ? 26 : nData.type === 'technology' ? 24 : nData.type === 'finding' ? 34 : 28;
              if (currentVal === 1) {
                el.data('borderColor', '#f9e2af');
                el.data('shape', 'star');
                el.data('borderWidth', 3);
                el.data('size', size * 1.3);
              } else {
                let borderColor = '#585b70';
                const sc = nData.status_code;
                if (sc !== null && sc !== undefined) {
                  if (sc === 0) borderColor = '#f38ba8';
                  else if (sc >= 200 && sc < 300) borderColor = '#a6e3a1';
                  else if (sc >= 300 && sc < 400) borderColor = '#f9e2af';
                  else if (sc >= 400 && sc < 500) borderColor = '#fab387';
                  else if (sc >= 500) borderColor = '#f38ba8';
                }
                el.data('borderColor', borderColor);
                el.data('shape', nData.type === 'root' ? 'hexagon' : nData.type === 'finding' ? 'triangle' : 'ellipse');
                el.data('borderWidth', nData.type === 'finding' ? 3 : 1);
                el.data('size', size);
              }
            }
          }
        });
      }
    });
  },

  addTag: async (nodeId, label) => {
    const { activeProject } = get();
    if (!activeProject) return;
    await safeInvoke('node_add_tag', {
      projectId: activeProject.id,
      nodeId,
      label,
    });
  },

  removeTag: async (nodeId, label) => {
    const { activeProject } = get();
    if (!activeProject) return;
    await safeInvoke('node_remove_tag', {
      projectId: activeProject.id,
      nodeId,
      label,
    });
  },

  addNote: async (nodeId, body) => {
    const { activeProject } = get();
    if (!activeProject) return;
    await safeInvoke('node_add_note', {
      projectId: activeProject.id,
      nodeId,
      body,
    });
  },



  deleteNode: async (nodeId) => {
    const { activeProject } = get();
    if (!activeProject) return;
    await safeInvoke('node_delete', { projectId: activeProject.id, nodeId });
    if (get().selectedNode?.id === nodeId) {
      set({ selectedNode: null });
    }
    await get().loadSelectedGraphs();
  },

  togglePin: async (nodeId, currentVal) => {
    const { activeProject } = get();
    if (!activeProject) return;
    const nextVal = currentVal === 0;

    // 1. Optimistic update
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, is_pinned: nextVal ? 1 : 0 } : n
      ),
      selectedNode: state.selectedNode?.id === nodeId
        ? { ...state.selectedNode, is_pinned: nextVal ? 1 : 0 }
        : state.selectedNode
    }));

    // 2. Cytoscape update
    const cy = (window as any).cy;
    if (cy) {
      cy.batch(() => {
        const el = cy.getElementById(nodeId);
        if (el.length > 0) {
          const nData = el.data('nodeData');
          if (nData) {
            nData.is_pinned = nextVal ? 1 : 0;
          }
          if (nextVal) {
            el.lock();
          } else {
            el.unlock();
          }
        }
      });
    }

    // 3. Asynchronous DB call
    safeInvoke('node_pin', {
      projectId: activeProject.id,
      nodeId,
      pinned: nextVal,
    }).catch((err) => {
      console.error('Failed to save pin state:', err);
      // Revert optimistic update on failure
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, is_pinned: currentVal } : n
        ),
        selectedNode: state.selectedNode?.id === nodeId
          ? { ...state.selectedNode, is_pinned: currentVal }
          : state.selectedNode
      }));
      if (cy) {
        cy.batch(() => {
          const el = cy.getElementById(nodeId);
          if (el.length > 0) {
            const nData = el.data('nodeData');
            if (nData) {
              nData.is_pinned = currentVal;
            }
            if (currentVal === 1) {
              el.lock();
            } else {
              el.unlock();
            }
          }
        });
      }
    });
  },

  toggleCollapse: async (nodeId, currentVal) => {
    const { activeProject } = get();
    if (!activeProject) return;
    const nextVal = currentVal === 0;

    // 1. Optimistic update
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, is_collapsed: nextVal ? 1 : 0 } : n
      ),
      selectedNode: state.selectedNode?.id === nodeId
        ? { ...state.selectedNode, is_collapsed: nextVal ? 1 : 0 }
        : state.selectedNode
    }));

    // 2. Cytoscape update
    const cy = (window as any).cy;
    if (cy) {
      cy.batch(() => {
        const el = cy.getElementById(nodeId);
        if (el.length > 0) {
          const nData = el.data('nodeData');
          if (nData) {
            nData.is_collapsed = nextVal ? 1 : 0;
          }
        }
      });
    }

    // 3. Asynchronous DB call
    safeInvoke('node_collapse', {
      projectId: activeProject.id,
      nodeId,
      collapsed: nextVal,
    }).catch((err) => {
      console.error('Failed to save collapse state:', err);
      // Revert optimistic update on failure
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, is_collapsed: currentVal } : n
        ),
        selectedNode: state.selectedNode?.id === nodeId
          ? { ...state.selectedNode, is_collapsed: currentVal }
          : state.selectedNode
      }));
      if (cy) {
        cy.batch(() => {
          const el = cy.getElementById(nodeId);
          if (el.length > 0) {
            const nData = el.data('nodeData');
            if (nData) {
              nData.is_collapsed = currentVal;
            }
          }
        });
      }
    });
  },

  updateNodePosition: async (nodeId, x, y) => {
    const { activeProject } = get();
    if (!activeProject) return;
    try {
      await safeInvoke('node_set_position', {
        projectId: activeProject.id,
        nodeId,
        posX: x,
        posY: y,
      });
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, pos_x: x, pos_y: y } : n
        ),
      }));
    } catch (err) {
      console.error('Failed to update node position:', err);
    }
  },



  setFocusNodeId: (nodeId) => {
    const { activeProject } = get();
    if (!activeProject) return;

    set({ focusNodeId: nodeId });
    useImportStore.getState().startImport('Focus: Updating Graph Focus');
    useImportStore.getState().setProgress({ phase: 'loading', percent: 70 });
    get().loadSelectedGraphs();
  },

  toggleStation: () => set((s) => ({ stationOpen: !s.stationOpen })),
  toggleScope: () => set((s) => ({ scopeOpen: !s.scopeOpen })),
  toggleCommandBar: () => set((s) => ({ commandBarOpen: !s.commandBarOpen })),
  toggleMinimap: () => set((s) => ({ minimapOpen: !s.minimapOpen })),
  toggleGrid: () => set((s) => ({ gridOpen: !s.gridOpen })),

  setSearchModalOpen: (open) => set({ searchModalOpen: open }),
  setShortcutOverlayOpen: (open) => set({ shortcutOverlayOpen: open }),
  setCompareModalOpen: (open) => set({ compareModalOpen: open }),
  setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),
  setEndpointsModalOpen: (open) => set({ endpointsModalOpen: open }),

  runDiff: async (graphIdA, graphIdB) => {
    const { activeProject } = get();
    if (!activeProject) return;
    const res = await safeInvoke<DiffResult>('graph_diff', {
      projectId: activeProject.id,
      graphIdA,
      graphIdB,
    });
    set({ diffMode: true, diffResult: res });
  },

  exitDiffMode: () => set({ diffMode: false, diffResult: null }),

  triggerStatsFlash: () => {
    set({ statsFlashed: true });
    setTimeout(() => set({ statsFlashed: false }), 1500);
  },
}));
