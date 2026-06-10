import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type UIState = {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  toggleSidebar: () => void;
  closeSidebar: () => void;
  openSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  moduleResetFn: (() => void) | null;
  registerModuleReset: (fn: () => void) => void;
  clearModuleReset: () => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      theme: 'light',
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      closeSidebar: () => set({ sidebarOpen: false }),
      openSidebar: () => set({ sidebarOpen: true }),
      setTheme: (theme) => set({ theme }),
      moduleResetFn: null,
      registerModuleReset: (fn) => set({ moduleResetFn: fn }),
      clearModuleReset: () => set({ moduleResetFn: null }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
