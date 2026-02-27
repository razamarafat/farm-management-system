import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type UIState = {
  sidebarOpen: boolean;
  theme: 'light' | 'dark' | 'system';
  // callback to let header know how to reset current module's menu state
  moduleReset?: () => void;
  registerModuleReset: (resetFn: () => void) => void;
  clearModuleReset: () => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  openSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: false,
      theme: 'light',
      moduleReset: undefined,
      registerModuleReset: (resetFn) => set({ moduleReset: resetFn }),
      clearModuleReset: () => set({ moduleReset: undefined }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      closeSidebar: () => set({ sidebarOpen: false }),
      openSidebar: () => set({ sidebarOpen: true }),
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({ theme: state.theme }),
    }
  )
);
