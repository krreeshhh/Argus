import React, { useEffect, useState } from 'react';
import { useArgusStore } from '../store/useArgusStore';
import { useImportStore } from '../store/useImportStore';

export const LayoutOverlay: React.FC = () => {
  const isLayoutChanging = useArgusStore((state) => state.isLayoutChanging);
  const activeLayout = useArgusStore((state) => state.activeLayout);
  const setLayoutChanging = useArgusStore((state) => state.setLayoutChanging);
  const isImporting = useImportStore((state) => state.isImporting);

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isLayoutChanging) {
      setVisible(true);
    } else {
      const timer = setTimeout(() => {
        setVisible(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isLayoutChanging]);

  useEffect(() => {
    if (isLayoutChanging) {
      const timer = setTimeout(() => {
        console.warn('Layout transition took too long. Force dismissing loader.');
        setLayoutChanging(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isLayoutChanging, setLayoutChanging]);

  if (isImporting || (!visible && !isLayoutChanging)) return null;

  const layoutNames: Record<string, string> = {
    cola: 'Force-Directed (Cola)',
    dagre: 'Hierarchical Tree (Dagre)',
    circle: 'Circular Orbit',
    grid: 'Orthogonal Grid',
    preset: 'Initial Preset Positions',
    breadthfirst: 'Breadth-First Tree',
  };

  const humanName = layoutNames[activeLayout] || activeLayout;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(24, 24, 37, 0.75)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9998,
        fontFamily: 'monospace',
        color: '#cdd6f4',
        opacity: isLayoutChanging ? 1 : 0,
        transition: 'opacity 0.2s ease-in-out',
        pointerEvents: 'all',
      }}
    >
      <div
        style={{
          width: '320px',
          backgroundColor: '#181825',
          border: '1px solid #313244',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div style={{ position: 'relative', width: '40px', height: '40px' }}>
          <svg width="40" height="40" viewBox="0 0 50 50" style={{ transformOrigin: 'center center', animation: 'layout-spin 0.8s linear infinite' }}>
            <circle
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke="rgba(137, 180, 250, 0.15)"
              strokeWidth="3.5"
            />
            <circle
              cx="25"
              cy="25"
              r="20"
              fill="none"
              stroke="#89b4fa"
              strokeWidth="3.5"
              strokeDasharray="90 30"
              strokeLinecap="round"
            />
          </svg>
          <style>{`
            @keyframes layout-spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>

        <div style={{ fontSize: '10px', color: '#a6e3a1', fontWeight: 'bold', textAlign: 'center' }}>
          Applying {humanName} layout...
        </div>
      </div>
    </div>
  );
};
