import React, { useEffect } from 'react';
import { MenuBar } from './components/MenuBar';
import { Station } from './components/Station';
import { GraphCanvas } from './components/GraphCanvas';
import { Scope } from './components/Scope';
import { CommandBar } from './components/CommandBar';
import { SearchModal } from './components/SearchModal';
import { ShortcutOverlay } from './components/ShortcutOverlay';
import { CompareModal } from './components/CompareModal';
import { SettingsModal } from './components/SettingsModal';
import { EndpointsModal } from './components/EndpointsModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ImportOverlay } from './components/ImportOverlay';
import { LayoutOverlay } from './components/LayoutOverlay';

import { useArgusStore } from './store/useArgusStore';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const App: React.FC = () => {
  const {
    stationOpen,
    scopeOpen,
    commandBarOpen,
  } = useArgusStore();

  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedProjectId = localStorage.getItem('lastActiveProjectId');
    if (savedProjectId) {
      const { openProject } = useArgusStore.getState();
      openProject(savedProjectId).catch((err) => {
        console.error('Failed to auto-open last active project:', err);
        localStorage.removeItem('lastActiveProjectId');
      });
    }
  }, []);

  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  // Refocus main container when panels toggle to prevent focus loss in WebView2
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.focus();
    }
  }, [stationOpen, scopeOpen, commandBarOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keyboard shortcuts if the user is typing in an input, textarea or form
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        const name = prompt("Enter Project Name:");
        if (!name) return;
        const root = prompt("Enter Root Domain:");
        if (!root) return;
        const { createProject } = useArgusStore.getState();
        createProject(name, root).catch(err => alert("Error: " + err));
      } else if (isCtrl && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        openDialog({
          multiple: false,
          filters: [{ name: 'Argus Database', extensions: ['argus'] }],
        }).then((selected) => {
          if (selected && typeof selected === 'string') {
            const filename = selected.split(/[\\/]/).pop() || '';
            const id = filename.replace(/\.argus$/, '');
            if (id) {
              const { openProject } = useArgusStore.getState();
              openProject(id).catch(err => alert("Error: " + err));
            }
          }
        });
      } else if (isCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const { activeProject } = useArgusStore.getState();
        if (activeProject) {
          invoke('project_save', { projectId: activeProject.id })
            .then(() => alert("Project saved successfully."))
            .catch(err => alert("Save failed: " + err));
        }
      } else if (isCtrl && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        const { closeProject } = useArgusStore.getState();
        closeProject();
      } else if (isCtrl && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        openDialog({
          directory: true,
          multiple: false,
          title: 'Select Target Domain Folder to Import',
        }).then((selected) => {
          if (selected && typeof selected === 'string') {
            const { importFolder } = useArgusStore.getState();
            importFolder(selected).then((res) => {
              alert(`Imported ${res.imported_nodes} nodes successfully.`);
            }).catch(err => alert("Import failed: " + err));
          }
        });
      } else if (isCtrl && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        const { toggleStation } = useArgusStore.getState();
        toggleStation();
      } else if (isCtrl && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        const { endpointsModalOpen, setEndpointsModalOpen } = useArgusStore.getState();
        setEndpointsModalOpen(!endpointsModalOpen);
      } else if (isCtrl && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        const { toggleScope } = useArgusStore.getState();
        toggleScope();
      } else if (isCtrl && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        const { toggleCommandBar } = useArgusStore.getState();
        toggleCommandBar();
      } else if (isCtrl && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        const { toggleMinimap } = useArgusStore.getState();
        toggleMinimap();
      } else if (isCtrl && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        const { toggleGrid } = useArgusStore.getState();
        toggleGrid();
      } else if (isCtrl && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        const cy = (window as any).cy;
        if (cy) cy.zoom(cy.zoom() * 1.1);
      } else if (isCtrl && e.key === '-') {
        e.preventDefault();
        const cy = (window as any).cy;
        if (cy) cy.zoom(cy.zoom() * 0.9);
      } else if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        const cy = (window as any).cy;
        if (cy) cy.fit(cy.elements(':visible'), 60);
      } else if (isCtrl && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        const { setSearchModalOpen } = useArgusStore.getState();
        setSearchModalOpen(true);
      } else if (isCtrl && (e.key === '?' || e.key === '/')) {
        e.preventDefault();
        const { setShortcutOverlayOpen } = useArgusStore.getState();
        setShortcutOverlayOpen(true);
      } else if (isCtrl && e.key === ',') {
        e.preventDefault();
        const { setSettingsModalOpen, settingsModalOpen } = useArgusStore.getState();
        setSettingsModalOpen(!settingsModalOpen);
      } else if (isCtrl && e.key.toLowerCase() === 'q') {
        e.preventDefault();
        const win = getCurrentWindow();
        win.close();
      } else if (e.key === 'F11') {
        e.preventDefault();
        const win = getCurrentWindow();
        win.isFullscreen().then(fs => win.setFullscreen(!fs));
      } else if (e.key.toLowerCase() === 'f' && !isCtrl) {
        e.preventDefault();
        const { filters, setFilters } = useArgusStore.getState();
        setFilters({ only_favorites: !filters.only_favorites });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        const {
          settingsModalOpen,
          setSettingsModalOpen,
          searchModalOpen,
          setSearchModalOpen,
          shortcutOverlayOpen,
          setShortcutOverlayOpen,
          compareModalOpen,
          setCompareModalOpen,
          endpointsModalOpen,
          setEndpointsModalOpen,
          selectNode,
        } = useArgusStore.getState();

        if (searchModalOpen || shortcutOverlayOpen || compareModalOpen || endpointsModalOpen) {
          setSearchModalOpen(false);
          setShortcutOverlayOpen(false);
          setCompareModalOpen(false);
          setEndpointsModalOpen(false);
        } else {
          setSettingsModalOpen(!settingsModalOpen);
        }
        selectNode(null);
      } else if (e.key === '1' && !isCtrl) {
        const { setLayout, isLayoutChanging } = useArgusStore.getState();
        if (!isLayoutChanging) setLayout('cola');
      } else if (e.key === '2' && !isCtrl) {
        const { setLayout, isLayoutChanging } = useArgusStore.getState();
        if (!isLayoutChanging) setLayout('dagre');
      } else if (e.key === '3' && !isCtrl) {
        const { setLayout, isLayoutChanging } = useArgusStore.getState();
        if (!isLayoutChanging) setLayout('circle');
      } else if (e.key === '4' && !isCtrl) {
        const { setLayout, isLayoutChanging } = useArgusStore.getState();
        if (!isLayoutChanging) setLayout('grid');
      } else if (e.key === '5' && !isCtrl) {
        const { setLayout, isLayoutChanging } = useArgusStore.getState();
        if (!isLayoutChanging) setLayout('preset');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        outline: 'none',
      }}
    >
      <MenuBar />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        {stationOpen && (
          <ErrorBoundary fallbackName="STATION">
            <Station />
          </ErrorBoundary>
        )}

        <ErrorBoundary fallbackName="GRAPH CANVAS">
          <GraphCanvas />
        </ErrorBoundary>

        {scopeOpen && (
          <ErrorBoundary fallbackName="SCOPE">
            <Scope />
          </ErrorBoundary>
        )}
      </div>

      {commandBarOpen && (
        <ErrorBoundary fallbackName="COMMAND BAR">
          <CommandBar />
        </ErrorBoundary>
      )}

      <SearchModal />
      <EndpointsModal />
      <ShortcutOverlay />
      <CompareModal />
      <SettingsModal />
      <ImportOverlay />
      <LayoutOverlay />
    </div>
  );
};

export default App;
