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
      // ----------------------------------------------------------------
      // Reporting RPCs (scripts/migrations/008_reporting_layer.sql).
      // SECURITY INVOKER + STABLE — RLS scopes the row stream per-JWT.
      // SPA calls these under the user's anon/authenticated JWT.
      // ----------------------------------------------------------------
      reporting_get_item_unit_price: {
        Args: {
          p_item_id: string;
          p_farm_id: string;
          p_as_of: string;
        };
        Returns: Array<{
          unit_price: number | null;
          price_source: string;
          priced_on: string | null;
        }>;
      };
      reporting_inventory_balance_as_of: {
        Args: {
          p_as_of: string;
          p_farm_id?: string | null;
          p_item_id?: string | null;
          p_category?: string | null;
        };
        Returns: Array<{
          farm_id: string;
          item_id: string;
          item_name: string;
          item_unit: string;
          item_category: string;
          on_hand_qty: number;
          unit_cost: number | null;
          cost_basis: string | null;
          priced_on: string | null;
          value_rial: number | null;
          as_of_date: string;
        }>;
      };
      reporting_inventory_ledger: {
        Args: {
          p_farm_id?: string | null;
          p_item_id?: string | null;
          p_category?: string | null;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_txn_type?: string | null;
          p_cursor_ts?: string | null;
          p_cursor_id?: string | null;
          p_prior_balance?: number | null;
          p_limit?: number | null;
        };
        Returns: Array<{
          id: string;
          txn_ts: string;
          txn_date: string;
          txn_type: string;
          farm_id: string;
          farm_name: string;
          item_id: string;
          item_name: string;
          item_unit: string;
          item_category: string;
          source_type: string | null;
          source_id: string | null;
          qty_in: number;
          qty_out: number;
          unit_price: number | null;
          total_price: number | null;
          reference_no: string | null;
          notes: string | null;
          supplier_id: string | null;
          supplier_name: string | null;
          prior_balance: number;
          running_balance: number;
          has_more: boolean;
        }>;
      };
      reporting_consumption_summary: {
        Args: {
          p_date_from: string;
          p_date_to: string;
          p_farm_id?: string | null;
          p_category?: string | null;
          p_group_by?: string | null;
        };
        Returns: Array<{
          group_key: string;
          group_label: string;
          consumed_qty: number;
          waste_qty: number;
          total_qty: number;
          voucher_count: number;
          item_category: string;
        }>;
      };
      reporting_purchase_summary: {
        Args: {
          p_date_from: string;
          p_date_to: string;
          p_farm_id?: string | null;
          p_supplier_id?: string | null;
          p_category?: string | null;
          p_group_by?: string | null;
        };
        Returns: Array<{
          group_key: string;
          group_label: string;
          qty_in: number;
          total_rial: number;
          txn_count: number;
          item_category: string;
        }>;
      };
      // ----------------------------------------------------------------
      // RPT_INVENTORY_AGING (scripts/migrations/009_inventory_aging.sql)
      // Bucket boundaries (90/60/30) mirror AGE_BUCKETS in
      // utils/constants.ts so the SQL bucket assignment and the SPA
      // chips stay in sync.
      // ----------------------------------------------------------------
      reporting_inventory_aging: {
        Args: {
          p_as_of?: string | null;
          p_farm_id?: string | null;
          p_category?: string | null;
          p_dead_stock_days?: number | null;
        };
        Returns: Array<{
          farm_id: string;
          farm_name: string;
          item_id: string;
          item_name: string;
          item_unit: string;
          item_category: string;
          on_hand_qty: number;
          last_movement_date: string | null;
          days_since_last_movement: number | null;
          age_bucket: string | null;
          unit_cost: number | null;
          priced_on: string | null;
          value_rial: number | null;
          dead_stock: boolean;
          as_of_date: string;
        }>;
      };
      // ----------------------------------------------------------------
      // RPT_PARETO_CLASSIFICATION (scripts/migrations/010_pareto_classification.sql)
      // A/B/C assignment via cumulative-share window functions, with a
      // configurable threshold (p_a_threshold / p_b_threshold) and an
      // optional basis (p_basis = 'value' | 'quantity'). reorder_recommended
      // is heuristic — see the SQL header comment for the exact rule.
      // ----------------------------------------------------------------
      reporting_pareto_classification: {
        Args: {
          p_date_from: string;
          p_date_to: string;
          p_farm_id?: string | null;
          p_category?: string | null;
          p_basis?: string | null;
          p_a_threshold?: number | null;
          p_b_threshold?: number | null;
        };
        Returns: Array<{
          item_id: string;
          farm_id: string;
          item_name: string;
          item_unit: string;
          item_category: string;
          farm_name: string;
          period_qty: number;
          unit_cost: number | null;
          basis_metric: number;
          share_pct: number;
          cumulative_share_pct: number;
          abc_class: 'A' | 'B' | 'C';
          on_hand_qty: number;
          reorder_point: number;
          avg_daily_consumption: number;
          reorder_recommended: boolean;
          reorder_basis: string;
          date_from: string;
          date_to: string;
          basis: string;
        }>;
      };
      // ----------------------------------------------------------------
      // RPT_SUPPLIERS (scripts/migrations/011_reporting_suppliers_list.sql)
      // Audit-grade supplier directory. SECURITY INVOKER; stats derived
      // from purchase-side inventory_transactions via a single-shot
      // aggregation. p_farm_id / p_category scopes are implemented in
      // SQL via EXISTS subqueries since suppliers itself carries
      // neither column. p_is_active preserves the literal boolean
      // (the SPA must NOT coerce via `body.X || null`).
      // ----------------------------------------------------------------
      reporting_suppliers_list: {
        Args: {
          p_farm_id?: string | null;
          p_category?: string | null;
          p_is_active?: boolean | null;
          p_search?: string | null;
        };
        Returns: Array<{
          supplier_id: string;
          name: string;
          status: string;
          usage_count: number;
          total_purchases_rial: number;
          first_purchase_date: string | null;
          last_purchase_date: string | null;
          farm_count: number;
          created_by_username: string | null;
          created_at: string;
        }>;
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
