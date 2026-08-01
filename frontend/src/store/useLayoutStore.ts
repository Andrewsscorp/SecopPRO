import { create } from 'zustand';

interface LayoutState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  isSidebarOpen: false,
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (isOpen: boolean) => set({ isSidebarOpen: isOpen }),
}));
