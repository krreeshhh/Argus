import { describe, it, expect, beforeEach } from 'vitest';
import { useArgusStore } from './useArgusStore';

describe('useArgusStore Graph Actions', () => {
  beforeEach(() => {
    useArgusStore.setState({
      activeProject: {
        id: 'test-proj',
        name: 'Test Project',
        root_domain: 'test.com',
        schema_version: 1,
        created_at: '',
        updated_at: '',
      },
      focusNodeId: 'some-node',
      filters: { only_alive: true },
    });
  });

  it('sets focusNodeId correctly', () => {
    useArgusStore.getState().setFocusNodeId('new-node');
    expect(useArgusStore.getState().focusNodeId).toBe('new-node');

    useArgusStore.getState().setFocusNodeId(null);
    expect(useArgusStore.getState().focusNodeId).toBeNull();
  });

  it('clearFilters resets filters and focusNodeId', async () => {
    await useArgusStore.getState().clearFilters();
    expect(useArgusStore.getState().filters).toEqual({});
    expect(useArgusStore.getState().focusNodeId).toBeNull();
  });


  it('sets settingsModalOpen state correctly', () => {
    expect(useArgusStore.getState().settingsModalOpen).toBe(false);
    useArgusStore.getState().setSettingsModalOpen(true);
    expect(useArgusStore.getState().settingsModalOpen).toBe(true);
    useArgusStore.getState().setSettingsModalOpen(false);
    expect(useArgusStore.getState().settingsModalOpen).toBe(false);
  });

  it('exports and imports project successfully via store actions', async () => {
    // Should run successfully and trigger mock fallbacks
    await expect(useArgusStore.getState().exportProject('test_dest.argus')).resolves.not.toThrow();
    
    // Should run importProject and return fallback mock Project object
    const imported = await useArgusStore.getState().importProject('test_src.argus');
    expect(imported).toBeDefined();
  });
});
