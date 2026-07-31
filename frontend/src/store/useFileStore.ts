import { create } from 'zustand';

interface FileState {
  file: File | null;
  columns: string[];
  fileHash: string | null;
  setFileAndColumns: (file: File, columns: string[], fileHash: string) => void;
  clearFile: () => void;
}

export const useFileStore = create<FileState>((set) => ({
  file: null,
  columns: [],
  fileHash: null,
  setFileAndColumns: (file, columns, fileHash) => set({ file, columns, fileHash }),
  clearFile: () => set({ file: null, columns: [], fileHash: null }),
}));
