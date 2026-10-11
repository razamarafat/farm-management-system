import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AuthState } from '@/types/auth.types';
import { Profile } from '@/types/user.types';
import { supabase } from '@/lib/supabase';
import { rememberMeStorage, getRememberMe } from '@/lib/auth-storage';
import { User } from '@supabase/supabase-js';

const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour for non-remembered guest sessions
let authListenerAttached = false;

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
        // Admins and users with "Remember Me" enabled stay persistent without 1-hour force logout
        if (role === 'admin' || getRememberMe()) {
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
          // Subscribe to Supabase auth events once
          if (!authListenerAttached) {
            authListenerAttached = true;
            supabase.auth.onAuthStateChange((event, newSession) => {
              if (event === 'SIGNED_OUT') {
                set({ user: null, profile: null, isAuthenticated: false, sessionStartedAt: null });
              } else if (event === 'TOKEN_REFRESHED' && newSession?.user) {
                set({ user: newSession.user, isAuthenticated: true });
              }
            });
          }

          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            set({ user: session.user, isAuthenticated: true });

            const { data: profile, error: profileError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (profile) {
              set({ profile: profile as Profile });
            } else if (
              profileError &&
              (!navigator.onLine ||
                profileError.message?.toLowerCase().includes('fetch') ||
                profileError.message?.toLowerCase().includes('network'))
            ) {
              // Cold-start offline defense: keep cached profile from storage
              const cachedProfile = get().profile;
              if (!cachedProfile || cachedProfile.id !== session.user.id) {
                set({ user: null, profile: null, isAuthenticated: false });
              }
            } else {
              await supabase.auth.signOut();
              set({ user: null, profile: null, isAuthenticated: false, sessionStartedAt: null });
            }
          } else {
            // If offline on cold-start and cached credentials exist, retain them
            if (!navigator.onLine && get().user && get().profile) {
              // retain cached state
            } else {
              set({ user: null, profile: null, isAuthenticated: false });
            }
          }
        } catch (error) {
          if (!navigator.onLine && get().user && get().profile) {
            // retain cached state during offline start
          } else {
            set({ user: null, profile: null, isAuthenticated: false });
          }
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      // Follow the same Remember-Me backend as the Supabase session so the
      // cached user/profile data doesn't outlive a session-only login.
      storage: createJSONStorage(() => rememberMeStorage),
      partialize: (state) => ({
        user: state.user,
        profile: state.profile,
        isAuthenticated: state.isAuthenticated,
        sessionStartedAt: state.sessionStartedAt,
      }),
    }
  )
);
