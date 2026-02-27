export interface Supplier {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface SupplierInsert {
  name: string;
  is_active?: boolean;
}

export interface SupplierFilters {
  search: string;
  status: 'all' | 'active' | 'inactive';
}
