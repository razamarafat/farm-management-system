import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthState } from '@/types/auth.types';
import { Profile } from '@/types/user.types';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour for non-admin users

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,
      sessionStartedAt: null,

      setUser: (user: User | null) => set({ user, isAuthenticated: !!user }),
      setProfile: (profile: Profile | null) => set({ profile }),
      setSessionStart: (role: Profile['role']) => {
        if (role === 'admin') {
          set({ sessionStartedAt: null });
        } else {
          set({ sessionStartedAt: Date.now() });
        }
      },

      logout: async () => {
        await supabase.auth.signOut();
        set({ user: null, profile: null, isAuthenticated: false, sessionStartedAt: null });
      },

      checkSessionExpiry: () => {
        const { sessionStartedAt, profile, logout } = get();
        if (!sessionStartedAt || profile?.role === 'admin') return;
        if (Date.now() - sessionStartedAt > SESSION_TIMEOUT_MS) {
          logout();
        }
      },

      initialize: async () => {
        set({ isLoading: true });
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            set({ user: session.user, isAuthenticated: true });

            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profile) {
              set({ profile: profile as Profile });
            } else {
              await supabase.auth.signOut();
              set({ user: null, profile: null, isAuthenticated: false, sessionStartedAt: null });
            }
          } else {
            set({ user: null, profile: null, isAuthenticated: false });
          }
        } catch (error) {
          console.error('Auth initialization error:', error);
          set({ user: null, profile: null, isAuthenticated: false });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        profile: state.profile,
        isAuthenticated: state.isAuthenticated,
        sessionStartedAt: state.sessionStartedAt,
      }),
    }
  )
);
