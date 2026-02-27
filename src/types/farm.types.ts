import { Database } from './database.types';
import { UserRole } from './user.types';

export type Farm = Database['public']['Tables']['farms']['Row'];
export type FarmInsert = Database['public']['Tables']['farms']['Insert'];
export type FarmUpdate = Database['public']['Tables']['farms']['Update'];

export interface FarmWithStats extends Farm {
  totalUsers?: number;
  operatorCount?: number;
  supervisorCount?: number;
}

export interface FarmStaffProfile {
  id: string;
  username: string;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_active: boolean;
}

export interface FarmItem {
  id: string;
  name: string;
  code: string;
  unit?: string | null;
  is_active?: boolean | null;
}

export interface FarmItemAssignment {
  id: string;
  farm_id: string;
  item_id: string;
  min_stock?: number | null;
  notes?: string | null;
  created_at?: string;
  item: FarmItem;
}

