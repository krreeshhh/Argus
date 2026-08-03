import { invoke } from '@tauri-apps/api/core';
import type { EventCallback, UnlistenFn } from '@tauri-apps/api/event';
import { listen } from '@tauri-apps/api/event';

export const isTauriAvailable = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in window &&
    !!(window as any).__TAURI_INTERNALS__
  );
};

export async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriAvailable()) {
    console.warn(`[Argus] Tauri IPC not available for command: '${cmd}'. Returning default fallback.`);
    if (cmd === 'project_list_recent') return [] as unknown as T;
    if (cmd === 'graph_get_nodes') return [] as unknown as T;
    if (cmd === 'graph_get_edges') return [] as unknown as T;
    if (cmd === 'filter_list_presets') return [] as unknown as T;
    if (cmd === 'graph_list_available') return [] as unknown as T;
    if (cmd === 'node_get_endpoints') return [] as unknown as T;
    return {} as unknown as T;
  }
  return await invoke<T>(cmd, args);
}

export async function safeListen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
  if (!isTauriAvailable()) {
    return () => {};
  }
  return await listen<T>(event, handler);
}
