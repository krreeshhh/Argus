import React, { useEffect } from 'react';
import { useImportStore } from '../store/useImportStore';
import { safeListen } from '../utils/tauri';

export const ImportOverlay: React.FC = () => {
  const { isImporting, percent, currentFile, errorMsg, reset } = useImportStore();

  // Listen for progress and error events from backend
  useEffect(() => {
    if (!isImporting) return;

    let active = true;

    const promiseProgress = safeListen<{
      phase: string;
      percent: number;
      current_file: string;
      records_processed: number;
      records_total: number;
    }>('import://progress', (event) => {
      if (!active) return;
      useImportStore.getState().setProgress({
        phase: event.payload.phase,
        percent: event.payload.percent,
        currentFile: event.payload.current_file,
      });
    });

    const promiseError = safeListen<any>('import://error', (event) => {
      if (!active) return;
      let errMsg = '';
      if (typeof event.payload === 'string') {
        errMsg = event.payload;
      } else if (event.payload && typeof event.payload === 'object') {
        errMsg = event.payload.message || 'Unknown error';
      } else {
        errMsg = 'Unknown import error';
      }
      useImportStore.getState().failImport(errMsg);
    });

    return () => {
      active = false;
      promiseProgress.then((fn) => fn());
      promiseError.then((fn) => fn());
    };
  }, [isImporting]);

  // Max-wait timeout (5 minutes) to prevent soft-locks, reset on each progress tick
  useEffect(() => {
    if (isImporting) {
      const timer = setTimeout(() => {
        if (useImportStore.getState().isImporting) {
          console.warn('Import overlay timeout reached. Force dismissing.');
          useImportStore.getState().completeImport();
        }
      }, 300000);
      return () => clearTimeout(timer);
    }
  }, [isImporting, percent, currentFile]);

  // Dismiss overlay after percent hits 100%
  useEffect(() => {
    if (isImporting && percent === 100) {
      const timer = setTimeout(() => {
        useImportStore.getState().completeImport();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isImporting, percent]);

  const handleReset = () => {
    reset();
  };

  if (!isImporting && !errorMsg) return null;

  const isProjectLoad = currentFile?.startsWith('Project:');
  const isFilterApply = currentFile?.startsWith('Filter:');
  const cleanProjectName = isProjectLoad
    ? currentFile.replace('Project:', '').trim()
    : isFilterApply
    ? currentFile.replace('Filter:', '').trim()
    : currentFile;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(30, 30, 46, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        fontFamily: 'monospace',
        color: '#cdd6f4',
      }}
    >
      <div
        style={{
          width: '380px',
          backgroundColor: '#181825',
          border: '1px solid #313244',
          padding: '24px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        {errorMsg ? (
          <>
            <div style={{ color: '#f38ba8', fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', textAlign: 'center' }}>
              {isFilterApply ? 'Filter Application Failed' : 'Import Failed'}
            </div>
            <div
              style={{
                color: '#a6adc8',
                fontSize: '11px',
                textAlign: 'center',
                marginBottom: '20px',
                maxHeight: '100px',
                overflowY: 'auto',
                width: '100%',
                wordBreak: 'break-all',
                padding: '0 8px',
                boxSizing: 'border-box',
              }}
            >
              {errorMsg}
            </div>
            <button
              onClick={handleReset}
              style={{
                backgroundColor: '#f38ba8',
                color: '#11111b',
                border: 'none',
                padding: '8px 24px',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                borderRadius: '4px',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fdaeb7')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f38ba8')}
            >
              Dismiss
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#89b4fa', marginBottom: '20px', textAlign: 'center' }}>
              {isFilterApply
                ? 'Regenerating Graph View'
                : isProjectLoad
                ? `Loading Project: ${cleanProjectName}`
                : 'Parsing and Indexing Attack Surface'}
            </div>

            {/* Simple Progress Bar */}
            <div style={{ width: '100%', backgroundColor: '#313244', height: '6px', position: 'relative', marginBottom: '12px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${percent}%`,
                  backgroundColor: '#a6e3a1',
                  height: '100%',
                  transition: 'width 0.4s ease-out',
                }}
              />
            </div>

            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#a6e3a1', fontFamily: 'monospace' }}>
              {Math.round(percent)}%
            </div>
          </>
        )}
      </div>
    </div>
  );
};
