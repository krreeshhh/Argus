import type { Node } from '../types';
import React, { useState } from 'react';
import { useArgusStore } from '../store/useArgusStore';

export const SearchModal: React.FC = () => {
  const {
    searchModalOpen,
    setSearchModalOpen,
    nodes,
    selectNode,
    setLayout,
    toggleGrid,
    toggleMinimap,
    clearFilters,
  } = useArgusStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!searchModalOpen) return null;

  const q = query.toLowerCase().trim();

  const domainMatches = nodes
    .filter(
      (n) =>
        (n.type === 'subdomain' || n.type === 'endpoint' || n.type === 'root') &&
        n.label.toLowerCase().includes(q)
    )
    .slice(0, 5);

  const findingMatches = nodes
    .filter((n) => n.type === 'finding' && n.label.toLowerCase().includes(q))
    .slice(0, 5);

  const commandsList = [
    { label: 'Export PNG Image', action: () => alert('Exporting PNG...') },
    { label: 'Toggle Grid (Ctrl+G)', action: toggleGrid },
    { label: 'Toggle Minimap (Ctrl+M)', action: toggleMinimap },
    { label: 'Layout: Cola (1)', action: () => setLayout('cola') },
    { label: 'Layout: Tree (2)', action: () => setLayout('breadthfirst') },
    { label: 'Layout: Circle (3)', action: () => setLayout('circle') },
    { label: 'Layout: Grid (4)', action: () => setLayout('grid') },
    { label: 'Clear Filters (Escape)', action: clearFilters },
  ];

  const commandMatches = commandsList
    .filter((c) => c.label.toLowerCase().includes(q))
    .slice(0, 4);

  const allResults = [
    ...domainMatches.map((d) => ({ type: 'domain', item: d, label: d.label })),
    ...findingMatches.map((f) => ({ type: 'finding', item: f, label: `[finding] ${f.label}` })),
    ...commandMatches.map((c) => ({ type: 'command', item: c, label: `[cmd] ${c.label}` })),
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearchModalOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, allResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + allResults.length) % Math.max(1, allResults.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allResults[selectedIndex]) {
        const sel = allResults[selectedIndex];
        if (sel.type === 'domain' || sel.type === 'finding') {
          selectNode(sel.item as Node);
        } else if (sel.type === 'command') {
          (sel.item as any).action();
        }
        setSearchModalOpen(false);
      }
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '80px',
        zIndex: 200,
      }}
      onClick={() => setSearchModalOpen(false)}
    >
      <div
        style={{
          width: '520px',
          backgroundColor: '#1e1e2e',
          border: '1px solid #313244',
          padding: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="text"
          autoFocus
          placeholder="Search domains, endpoints, findings, or commands..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIndex(0);
          }}
          onKeyDown={handleKeyDown}
          style={{ width: '100%', padding: '6px 10px', fontSize: '12px' }}
        />

        <div style={{ maxHeight: '300px', overflowY: 'auto', fontSize: '11px' }}>
          {allResults.length === 0 ? (
            <div style={{ color: '#585b70', padding: '8px 4px' }}>No matching results</div>
          ) : (
            allResults.map((res, idx) => (
              <div
                key={idx}
                onClick={() => {
                  if (res.type === 'domain' || res.type === 'finding') {
                    selectNode(res.item as Node);
                  } else if (res.type === 'command') {
                    (res.item as any).action();
                  }
                  setSearchModalOpen(false);
                }}
                style={{
                  padding: '6px 8px',
                  backgroundColor: idx === selectedIndex ? '#313244' : 'transparent',
                  color: res.type === 'finding' ? '#f38ba8' : res.type === 'command' ? '#89b4fa' : '#cdd6f4',
                  cursor: 'pointer',
                }}
              >
                {res.label}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
