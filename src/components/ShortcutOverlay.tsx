import React from 'react';
import { useArgusStore } from '../store/useArgusStore';

export const ShortcutOverlay: React.FC = () => {
  const { shortcutOverlayOpen, setShortcutOverlayOpen } = useArgusStore();

  if (!shortcutOverlayOpen) return null;

  const sections = [
    {
      title: 'FILE & SYSTEM',
      items: [
        { key: 'Ctrl+N', desc: 'New project' },
        { key: 'Ctrl+O', desc: 'Open project' },
        { key: 'Ctrl+S', desc: 'Save project' },
        { key: 'Ctrl+W', desc: 'Close project' },
        { key: 'Ctrl+Q', desc: 'Quit app' },
        { key: 'F11', desc: 'Toggle fullscreen' },
      ]
    },
    {
      title: 'VIEW PANELS',
      items: [
        { key: 'Ctrl+B', desc: 'Toggle Station panel' },
        { key: 'Ctrl+J', desc: 'Toggle Scope panel' },
        { key: 'Ctrl+L', desc: 'Toggle Command Bar' },
        { key: 'Ctrl+M', desc: 'Toggle Minimap' },
        { key: 'Ctrl+G', desc: 'Toggle Grid' },
        { key: 'Ctrl+E', desc: 'Toggle Project Endpoints popup' },
      ]
    },
    {
      title: 'GRAPH CANVAS NAVIGATION',
      items: [
        { key: 'Ctrl++', desc: 'Zoom in' },
        { key: 'Ctrl+-', desc: 'Zoom out' },
        { key: 'Ctrl+Shift+F', desc: 'Fit graph to screen' },
        { key: 'Ctrl+P', desc: 'Open search' },
        { key: 'Ctrl+?', desc: 'Show shortcuts overlay' },
      ]
    },
    {
      title: 'FILTERS & SELECTIONS',
      items: [
        { key: 'F', desc: 'Show only favorites' },
        { key: 'H', desc: 'Hide selected nodes' },
        { key: 'Shift+H', desc: 'Show all nodes' },
        { key: 'Escape', desc: 'Clear selection / close menus / clear filters' },
      ]
    },
    {
      title: 'GRAPH LAYOUTS',
      items: [
        { key: '1', desc: 'Cola layout (force-directed)' },
        { key: '2', desc: 'Tree layout (hierarchical)' },
        { key: '3', desc: 'Circle layout' },
        { key: '4', desc: 'Grid layout' },
      ]
    }
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(30, 30, 46, 0.95)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        fontFamily: 'monospace',
        fontSize: '12px',
      }}
      onClick={() => setShortcutOverlayOpen(false)}
    >
      <div
        style={{
          width: '640px',
          backgroundColor: '#181825',
          border: '1px solid #313244',
          padding: '20px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#89b4fa', marginBottom: '16px', borderBottom: '1px solid #313244', paddingBottom: '6px' }}>
          ARGUS KEYBOARD SHORTCUTS
        </div>

        <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '6px' }}>
          {sections.map((section, sIdx) => (
            <div key={sIdx} style={{ marginBottom: '12px' }}>
              <div style={{ color: '#89b4fa', fontWeight: 'bold', fontSize: '11px', marginBottom: '4px', textTransform: 'uppercase' }}>
                {section.title}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#cdd6f4', marginBottom: '8px' }}>
                <tbody>
                  {section.items.map((item, iIdx) => (
                    <tr key={iIdx} style={{ borderBottom: '1px solid #1e1e2e' }}>
                      <td style={{ padding: '4px', color: '#f9e2af', fontWeight: 'bold', width: '140px' }}>{item.key}</td>
                      <td style={{ padding: '4px' }}>{item.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#585b70' }}>Press ESC or click outside to dismiss</span>
          <button
            onClick={() => setShortcutOverlayOpen(false)}
            style={{
              padding: '4px 12px',
              color: '#6c7086',
              border: '1px solid #45475a',
              backgroundColor: 'transparent',
              fontFamily: 'monospace',
              fontSize: '12px',
              cursor: 'pointer',
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
            [CLOSE]
          </button>
        </div>
      </div>
    </div>
  );
};
