import type { Node } from '../types';
import React, { useState, useEffect, useRef } from 'react';
import { useArgusStore } from '../store/useArgusStore';
import { invoke } from '@tauri-apps/api/core';

export const EndpointsModal: React.FC = () => {
  const {
    endpointsModalOpen,
    setEndpointsModalOpen,
    activeProject,
    nodes,
    selectNode,
    scopeOpen,
    toggleScope,
  } = useArgusStore();

  const [query, setQuery] = useState('');
  const [endpoints, setEndpoints] = useState<Node[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingNextPage, setLoadingNextPage] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!endpointsModalOpen || !activeProject) return;

    setLoading(true);
    const delayDebounce = setTimeout(() => {
      invoke<{ endpoints: Node[]; total_count: number }>('project_get_all_endpoints', {
        projectId: activeProject.id,
        searchQuery: query || null,
        offset: 0,
        limit: 500,
      })
        .then((res) => {
          setEndpoints(res?.endpoints || []);
          setTotalCount(res?.total_count || 0);
          setLoading(false);
        })
        .catch((err) => {
          console.error('Failed to fetch project endpoints:', err);
          setLoading(false);
        });
    }, 150);

    return () => clearTimeout(delayDebounce);
  }, [endpointsModalOpen, activeProject, query]);

  // Reset selected index on query change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!endpointsModalOpen) return null;

  const handleSelectEndpoint = (ep: Node) => {
    const parentNode = nodes.find((n) => n.id === ep.parent_id);
    if (parentNode) {
      selectNode(parentNode);
    } else {
      selectNode(ep);
    }

    if (!scopeOpen) {
      toggleScope();
    }
    setEndpointsModalOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEndpointsModalOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, endpoints.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + endpoints.length) % Math.max(1, endpoints.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (endpoints[selectedIndex]) {
        handleSelectEndpoint(endpoints[selectedIndex]);
      }
    }
  };

  const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
    if (!activeProject) return;
    const el = e.currentTarget;
    const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 10;
    if (isAtBottom && !loadingNextPage && endpoints.length < totalCount) {
      setLoadingNextPage(true);
      try {
        const res = await invoke<{ endpoints: Node[]; total_count: number }>('project_get_all_endpoints', {
          projectId: activeProject.id,
          searchQuery: query || null,
          offset: endpoints.length,
          limit: 500,
        });
        setEndpoints((prev) => [...prev, ...(res?.endpoints || [])]);
      } catch (err) {
        console.error('Failed to load more project endpoints:', err);
      } finally {
        setLoadingNextPage(false);
      }
    }
  };

  const getStatusColor = (code: number | null | undefined) => {
    if (!code) return '#6c7086';
    if (code >= 200 && code < 300) return '#a6e3a1'; // Live green
    if (code >= 300 && code < 400) return '#f9e2af'; // Redirect yellow
    if (code >= 400 && code < 500) return '#fab387'; // Client error orange
    return '#f38ba8'; // Server error red
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(17, 17, 27, 0.7)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '80px',
        zIndex: 1000,
      }}
      onClick={() => setEndpointsModalOpen(false)}
    >
      <div
        style={{
          width: '600px',
          backgroundColor: '#1e1e2e',
          border: '1px solid #313244',
          borderRadius: '4px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#cba6f7', fontWeight: 'bold', fontSize: '14px', fontFamily: 'monospace' }}>
              PROJECT ENDPOINTS
            </span>
            <span
              style={{
                fontSize: '10px',
                backgroundColor: '#313244',
                color: '#a6adc8',
                padding: '2px 6px',
                borderRadius: '10px',
                fontFamily: 'monospace',
              }}
            >
              {loading ? 'loading...' : `${totalCount} found`}
            </span>
          </div>
          <button
            onClick={() => setEndpointsModalOpen(false)}
            style={{
              background: 'none',
              border: 'none',
              color: '#585b70',
              cursor: 'pointer',
              fontSize: '18px',
              padding: '0 4px',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#f38ba8')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#585b70')}
          >
            &times;
          </button>
        </div>

        <input
          type="text"
          autoFocus
          placeholder="Search all endpoints or javascript files in project..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '12px',
            backgroundColor: '#11111b',
            border: '1px solid #313244',
            color: '#cdd6f4',
            borderRadius: '4px',
            outline: 'none',
            fontFamily: 'monospace',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = '#cba6f7')}
          onBlur={(e) => (e.currentTarget.style.borderColor = '#313244')}
        />

        <div
          ref={listRef}
          onScroll={handleScroll}
          style={{
            maxHeight: '350px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            paddingRight: '4px',
          }}
        >
          {endpoints.length === 0 ? (
            <div
              style={{
                color: '#585b70',
                padding: '16px 8px',
                textAlign: 'center',
                fontFamily: 'monospace',
                fontSize: '12px',
              }}
            >
              {loading ? 'Searching...' : 'No matching endpoints found'}
            </div>
          ) : (
            endpoints.map((ep, idx) => (
              <div
                key={ep.id}
                onClick={() => handleSelectEndpoint(ep)}
                style={{
                  padding: '8px 10px',
                  backgroundColor: idx === selectedIndex ? '#313244' : 'transparent',
                  cursor: 'pointer',
                  borderRadius: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', flex: 1 }}>
                  <span
                    style={{
                      color: ep.type === 'jsfile' ? '#f9e2af' : '#cdd6f4',
                      fontFamily: 'monospace',
                      fontSize: '11px',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                    }}
                  >
                    {ep.type === 'jsfile' ? '📄' : '🔗'} {ep.label}
                  </span>
                  {ep.title && (
                    <span
                      style={{
                        color: '#a6adc8',
                        fontFamily: 'sans-serif',
                        fontSize: '10px',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        paddingLeft: '18px',
                      }}
                    >
                      {ep.title}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {ep.status_code !== null && ep.status_code !== undefined && (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        color: getStatusColor(ep.status_code),
                      }}
                    >
                      {ep.status_code}
                    </span>
                  )}
                  {ep.page_size !== null && ep.page_size !== undefined && ep.page_size > 0 && (
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '10px',
                        color: '#6c7086',
                      }}
                    >
                      {ep.page_size >= 1024
                        ? `${(ep.page_size / 1024).toFixed(1)} KB`
                        : `${ep.page_size} B`}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          {loadingNextPage && (
            <div
              style={{
                color: '#89b4fa',
                fontSize: '10px',
                padding: '8px',
                textAlign: 'center',
                fontFamily: 'monospace',
              }}
            >
              loading more...
            </div>
          )}
        </div>
        <div
          style={{
            fontSize: '9px',
            color: '#585b70',
            fontFamily: 'monospace',
            textAlign: 'right',
            borderTop: '1px solid #1e1d2f',
            paddingTop: '6px',
          }}
        >
          Use ↑↓ arrows to navigate, Enter to select, Esc to close
        </div>
      </div>
    </div>
  );
};
