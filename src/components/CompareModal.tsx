import React, { useState } from 'react';
import { useArgusStore } from '../store/useArgusStore';

export const CompareModal: React.FC = () => {
  const {
    compareModalOpen,
    setCompareModalOpen,
    availableGraphs,
    runDiff,
  } = useArgusStore();

  const [graphA, setGraphA] = useState('');
  const [graphB, setGraphB] = useState('');

  if (!compareModalOpen) return null;

  const handleCompare = async () => {
    if (!graphA || !graphB) {
      alert('Please select two graph scans to compare');
      return;
    }
    await runDiff(graphA, graphB);
    setCompareModalOpen(false);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 250,
      }}
      onClick={() => setCompareModalOpen(false)}
    >
      <div
        style={{
          width: '420px',
          backgroundColor: '#181825',
          border: '1px solid #313244',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 'bold', color: '#89b4fa', fontSize: '13px' }}>
          COMPARE RECON SCAN VERSIONS (DIFF)
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ color: '#6c7086' }}>Base Scan Version (A):</label>
          <select
            value={graphA}
            onChange={(e) => setGraphA(e.target.value)}
            style={{ width: '100%', padding: '4px' }}
          >
            <option value="">-- select graph A --</option>
            {availableGraphs.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.source_scan_label})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ color: '#6c7086' }}>Target Scan Version (B):</label>
          <select
            value={graphB}
            onChange={(e) => setGraphB(e.target.value)}
            style={{ width: '100%', padding: '4px' }}
          >
            <option value="">-- select graph B --</option>
            {availableGraphs.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.source_scan_label})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
          <button onClick={() => setCompareModalOpen(false)} style={{ padding: '4px 10px', color: '#6c7086' }}>
            CANCEL
          </button>
          <button onClick={handleCompare} style={{ padding: '4px 10px', color: '#89b4fa' }}>
            COMPARE VERSIONS
          </button>
        </div>
      </div>
    </div>
  );
};
