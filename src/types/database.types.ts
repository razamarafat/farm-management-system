export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'admin' | 'supervisor' | 'operator';
export type ItemCategory = 'feed' | 'packaging';
export type VoucherStatus = 'draft' | 'submitted' | 'locked' | 'reverted';
export type TxnType = 'purchase' | 'consumption' | 'waste' | 'transfer_in' | 'transfer_out' | 'adjustment' | 'initial';

export interface Database {
  public: {
    Tables: {
      farms: {
        Row: {
          id: string;
          name: string;
          code: string;
          address: string | null;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          address?: string | null;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          address?: string | null;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          username: string;
          farm_id: string | null;
          role: UserRole;
          first_name: string | null;
          last_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          is_active: boolean;
          notes: string | null;
          last_login_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id: string;
          username: string;
          farm_id?: string | null;
          role?: UserRole;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          notes?: string | null;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          username?: string;
          farm_id?: string | null;
          role?: UserRole;
          first_name?: string | null;
          last_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
          notes?: string | null;
          last_login_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      user_activity_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          resource_type: string | null;
          resource_id: string | null;
          details: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          resource_type?: string | null;
          resource_id?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          resource_type?: string | null;
          resource_id?: string | null;
          details?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      farm_items: {
        Row: {
          id: string;
          farm_id: string;
          category: ItemCategory;
          name: string;
          unit: string;
          priority: number;
          reorder_point: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          farm_id: string;
          category: ItemCategory;
          name: string;
          unit?: string;
          priority?: number;
          reorder_point?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          farm_id?: string;
          category?: ItemCategory;
          name?: string;
          unit?: string;
          priority?: number;
          reorder_point?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      daily_vouchers: {
        Row: {
          id: string;
          farm_id: string;
          voucher_date: string;
          category: ItemCategory;
          status: VoucherStatus;
          created_by: string | null;
          submitted_by: string | null;
          submitted_at: string | null;
          locked_at: string | null;
          reverted_at: string | null;
          reverted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          farm_id: string;
          voucher_date?: string;
          category: ItemCategory;
          status?: VoucherStatus;
          created_by?: string | null;
          submitted_by?: string | null;
          submitted_at?: string | null;
          locked_at?: string | null;
          reverted_at?: string | null;
          reverted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          farm_id?: string;
          voucher_date?: string;
          category?: ItemCategory;
          status?: VoucherStatus;
          created_by?: string | null;
          submitted_by?: string | null;
          submitted_at?: string | null;
          locked_at?: string | null;
          reverted_at?: string | null;
          reverted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      daily_voucher_lines: {
        Row: {
          id: string;
          voucher_id: string;
          item_id: string;
          formula_no: string | null;
          mixer_count: number | null;
          hall_numbers: string | null;
          consumed_qty: number;
          waste_qty: number;
          notes: string | null;
          hall_consumed: Json | null;
          formula_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          voucher_id: string;
          item_id: string;
          formula_no?: string | null;
          mixer_count?: number | null;
          hall_numbers?: string | null;
          consumed_qty?: number;
          waste_qty?: number;
          notes?: string | null;
          hall_consumed?: Json | null;
          formula_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          voucher_id?: string;
          item_id?: string;
          formula_no?: string | null;
          mixer_count?: number | null;
          hall_numbers?: string | null;
          consumed_qty?: number;
          waste_qty?: number;
          notes?: string | null;
          hall_consumed?: Json | null;
          formula_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      farm_feed_formulas: {
        Row: {
          id: string;
          farm_id: string;
          formula_no: number;
          name: string | null;
          mixer_weight: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          farm_id: string;
          formula_no: number;
          name?: string | null;
          mixer_weight?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          farm_id?: string;
          formula_no?: number;
          name?: string | null;
          mixer_weight?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      farm_formula_items: {
        Row: {
          id: string;
          formula_id: string;
          item_id: string;
          qty_per_mixer: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          formula_id: string;
          item_id: string;
          qty_per_mixer: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          formula_id?: string;
          item_id?: string;
          qty_per_mixer?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      farm_halls: {
        Row: {
          id: string;
          farm_id: string;
          hall_number: number;
          name: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          farm_id: string;
          hall_number: number;
          name?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          farm_id?: string;
          hall_number?: number;
          name?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      inventory_transactions: {
        Row: {
          id: string;
          farm_id: string;
          item_id: string;
          txn_date: string;
          txn_ts: string;
          txn_type: TxnType;
          qty_in: number;
          qty_out: number;
          unit_price: number | null;
          total_price: number | null;
          source_type: string | null;
          source_id: string | null;
          reference_no: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          supplier_id: string | null;
          attachment_url: string | null;
        };
        Insert: {
          id?: string;
          farm_id: string;
          item_id: string;
          txn_date?: string;
          txn_ts?: string;
          txn_type: TxnType;
          qty_in?: number;
          qty_out?: number;
          unit_price?: number | null;
          total_price?: number | null;
          source_type?: string | null;
          source_id?: string | null;
          reference_no?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          supplier_id?: string | null;
          attachment_url?: string | null;
        };
        Update: {
          id?: string;
          farm_id?: string;
          item_id?: string;
          txn_date?: string;
          txn_ts?: string;
          txn_type?: TxnType;
          qty_in?: number;
          qty_out?: number;
          unit_price?: number | null;
          total_price?: number | null;
          source_type?: string | null;
          source_id?: string | null;
          reference_no?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          supplier_id?: string | null;
          attachment_url?: string | null;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          id: string;
          name: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      inputs: {
        Row: {
          id: string;
          name: string;
          category: ItemCategory;
          default_unit: string;
          description: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          category?: ItemCategory;
          default_unit?: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          category?: ItemCategory;
          default_unit?: string;
          description?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_daily_sheet: {
        Args: {
          p_farm_id: string;
          p_date: string;
          p_category: string;
        };
        Returns: Json;
      };
      save_daily_sheet: {
        Args: {
          p_voucher_id: string;
          p_lines: Json;
        };
        Returns: Json;
      };
      submit_daily_sheet: {
        Args: {
          p_voucher_id: string;
        };
        Returns: Json;
      };
      revert_daily_sheet: {
        Args: {
          p_voucher_id: string;
        };
        Returns: Json;
      };
      get_item_balance: {
        Args: {
          p_farm_id: string;
          p_item_id: string;
        };
        Returns: number;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      get_user_role: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_user_farm_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      has_farm_access: {
        Args: {
          check_farm_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      user_role_enum: UserRole;
      item_category_enum: ItemCategory;
      voucher_status_enum: VoucherStatus;
      txn_type_enum: TxnType;
    };
    CompositeTypes: Record<string, never>;
  };
}
