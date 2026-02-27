import { User } from '@supabase/supabase-js';
import { Profile } from './user.types';

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionStartedAt: number | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setSessionStart: (role: Profile['role']) => void;
  logout: () => Promise<void>;
  initialize: () => Promise<void>;
  checkSessionExpiry: () => void;
}
