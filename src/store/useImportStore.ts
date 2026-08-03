import { create } from 'zustand';

interface ImportProgress {
  phase: 'idle' | 'importing' | 'parsing' | 'indexing' | 'loading' | 'rendering' | 'error' | 'done' | string;
  percent: number;
  currentFile: string;
  isImporting: boolean;
  errorMsg: string | null;
}

interface ImportStore extends ImportProgress {
  startImport: (fileName?: string) => void;
  setProgress: (progress: Partial<ImportProgress>) => void;
  completeImport: () => void;
  failImport: (errorMsg: string) => void;
  reset: () => void;
}

export const useImportStore = create<ImportStore>((set) => ({
  phase: 'idle',
  percent: 0,
  currentFile: '',
  isImporting: false,
  errorMsg: null,

  startImport: (fileName = '') => set({
    phase: 'parsing',
    percent: 0,
    currentFile: fileName,
    isImporting: true,
    errorMsg: null,
  }),

  setProgress: (progress) => set((state) => ({
    ...state,
    ...progress,
  })),

  completeImport: () => set({
    phase: 'done',
    percent: 100,
    isImporting: false,
    currentFile: '',
  }),

  failImport: (errorMsg) => set({
    phase: 'error',
    percent: 0,
    isImporting: false,
    errorMsg,
  }),

  reset: () => set({
    phase: 'idle',
    percent: 0,
    currentFile: '',
    isImporting: false,
    errorMsg: null,
  }),
}));
