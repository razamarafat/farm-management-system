-- Morvarid-FARM consolidated migration suite (generated from live schema)
-- 001_schema.sql - extensions, enums, tables, constraints, indexes

-- ============ EXTENSIONS ============
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ============ ENUMS ============
CREATE TYPE public.item_category_enum AS ENUM ('feed', 'packaging');
CREATE TYPE public.txn_type_enum AS ENUM ('purchase', 'consumption', 'waste', 'transfer_in', 'transfer_out', 'adjustment', 'initial');
CREATE TYPE public.user_role_enum AS ENUM ('admin', 'supervisor', 'operator');
CREATE TYPE public.voucher_status_enum AS ENUM ('draft', 'submitted', 'locked', 'reverted');

-- ============ TABLES ============
CREATE TABLE public.daily_voucher_lines (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    voucher_id uuid NOT NULL,
    item_id uuid NOT NULL,
    formula_no character varying(50),
    mixer_count numeric(10,2),
    hall_numbers character varying(255),
    consumed_qty numeric(15,3) DEFAULT 0 NOT NULL,
    waste_qty numeric(15,3) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    hall_consumed jsonb DEFAULT '{}'::jsonb,
    formula_id uuid,
    adjustment_qty numeric DEFAULT 0
);

CREATE TABLE public.daily_vouchers (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    farm_id uuid NOT NULL,
    voucher_date date DEFAULT CURRENT_DATE NOT NULL,
    category item_category_enum NOT NULL,
    status voucher_status_enum DEFAULT 'draft'::voucher_status_enum NOT NULL,
    created_by uuid,
    submitted_by uuid,
    submitted_at timestamp with time zone,
    locked_at timestamp with time zone,
    reverted_at timestamp with time zone,
    reverted_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.farm_feed_formulas (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    farm_id uuid NOT NULL,
    formula_no integer NOT NULL,
    name character varying(255),
    mixer_weight numeric(10,2) DEFAULT 3000 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.farm_formula_items (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    formula_id uuid NOT NULL,
    item_id uuid NOT NULL,
    qty_per_mixer numeric(15,3) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.farm_halls (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    farm_id uuid NOT NULL,
    hall_number integer NOT NULL,
    name character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.farm_items (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    farm_id uuid NOT NULL,
    category item_category_enum NOT NULL,
    name character varying(255) NOT NULL,
    unit character varying(50) DEFAULT 'کیلوگرم'::character varying NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    reorder_point numeric(15,3) DEFAULT 0,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    manual_unit_price numeric(18,2) DEFAULT NULL::numeric
);

CREATE TABLE public.farms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    code character varying(50) NOT NULL,
    address text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    phone character varying(20)
);

CREATE TABLE public.inputs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'feed'::text NOT NULL,
    default_unit text DEFAULT 'کیلوگرم'::text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);

CREATE TABLE public.inventory_transactions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    farm_id uuid NOT NULL,
    item_id uuid NOT NULL,
    txn_date date DEFAULT CURRENT_DATE NOT NULL,
    txn_ts timestamp with time zone DEFAULT now() NOT NULL,
    txn_type txn_type_enum NOT NULL,
    qty_in numeric(15,3) DEFAULT 0 NOT NULL,
    qty_out numeric(15,3) DEFAULT 0 NOT NULL,
    unit_price numeric(15,2),
    total_price numeric(15,2),
    source_type character varying(50),
    source_id uuid,
    reference_no character varying(100),
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    attachment_url text,
    supplier_id uuid
);

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    farm_id uuid,
    role user_role_enum DEFAULT 'operator'::user_role_enum NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    phone character varying(20),
    avatar_url text,
    is_active boolean DEFAULT true,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    username character varying(50),
    notes text,
    created_by uuid
);

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid
);

CREATE TABLE public.user_activity_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    action character varying(100) NOT NULL,
    resource_type character varying(100),
    resource_id uuid,
    details jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);

-- ============ CONSTRAINTS (PK, UNIQUE, FK, CHECK) ============
ALTER TABLE public.daily_voucher_lines ADD CONSTRAINT daily_voucher_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_vouchers ADD CONSTRAINT daily_vouchers_pkey PRIMARY KEY (id);
ALTER TABLE public.farm_feed_formulas ADD CONSTRAINT farm_feed_formulas_pkey PRIMARY KEY (id);
ALTER TABLE public.farm_formula_items ADD CONSTRAINT farm_formula_items_pkey PRIMARY KEY (id);
ALTER TABLE public.farm_halls ADD CONSTRAINT farm_halls_pkey PRIMARY KEY (id);
ALTER TABLE public.farm_items ADD CONSTRAINT farm_items_pkey PRIMARY KEY (id);
ALTER TABLE public.farms ADD CONSTRAINT farms_pkey PRIMARY KEY (id);
ALTER TABLE public.inputs ADD CONSTRAINT inputs_pkey PRIMARY KEY (id);
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);
ALTER TABLE public.user_activity_logs ADD CONSTRAINT user_activity_logs_pkey PRIMARY KEY (id);
ALTER TABLE public.daily_voucher_lines ADD CONSTRAINT daily_voucher_lines_voucher_id_item_id_key UNIQUE (voucher_id, item_id);
ALTER TABLE public.daily_vouchers ADD CONSTRAINT daily_vouchers_farm_id_voucher_date_category_key UNIQUE (farm_id, voucher_date, category);
ALTER TABLE public.farm_feed_formulas ADD CONSTRAINT farm_feed_formulas_farm_id_formula_no_key UNIQUE (farm_id, formula_no);
ALTER TABLE public.farm_formula_items ADD CONSTRAINT farm_formula_items_formula_id_item_id_key UNIQUE (formula_id, item_id);
ALTER TABLE public.farm_halls ADD CONSTRAINT farm_halls_farm_id_hall_number_key UNIQUE (farm_id, hall_number);
ALTER TABLE public.farm_items ADD CONSTRAINT farm_items_farm_id_category_name_key UNIQUE (farm_id, category, name);
ALTER TABLE public.farms ADD CONSTRAINT farms_code_key UNIQUE (code);
ALTER TABLE public.inputs ADD CONSTRAINT inputs_name_unique UNIQUE (name);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_key UNIQUE (phone);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);
ALTER TABLE public.daily_voucher_lines ADD CONSTRAINT daily_voucher_lines_item_id_fkey FOREIGN KEY (item_id) REFERENCES farm_items(id) ON DELETE RESTRICT;
ALTER TABLE public.daily_voucher_lines ADD CONSTRAINT daily_voucher_lines_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES daily_vouchers(id) ON DELETE CASCADE;
ALTER TABLE public.daily_vouchers ADD CONSTRAINT daily_vouchers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.daily_vouchers ADD CONSTRAINT daily_vouchers_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE public.daily_vouchers ADD CONSTRAINT daily_vouchers_reverted_by_fkey FOREIGN KEY (reverted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.daily_vouchers ADD CONSTRAINT daily_vouchers_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.farm_feed_formulas ADD CONSTRAINT farm_feed_formulas_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE public.farm_formula_items ADD CONSTRAINT farm_formula_items_formula_id_fkey FOREIGN KEY (formula_id) REFERENCES farm_feed_formulas(id) ON DELETE CASCADE;
ALTER TABLE public.farm_formula_items ADD CONSTRAINT farm_formula_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES farm_items(id) ON DELETE CASCADE;
ALTER TABLE public.farm_halls ADD CONSTRAINT farm_halls_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE public.farm_items ADD CONSTRAINT farm_items_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE public.inputs ADD CONSTRAINT inputs_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_item_id_fkey FOREIGN KEY (item_id) REFERENCES farm_items(id) ON DELETE RESTRICT;
ALTER TABLE public.inventory_transactions ADD CONSTRAINT inventory_transactions_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES suppliers(id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.user_activity_logs ADD CONSTRAINT user_activity_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.daily_voucher_lines ADD CONSTRAINT chk_consumed_qty_nonnegative CHECK ((consumed_qty >= (0)::numeric));
ALTER TABLE public.daily_voucher_lines ADD CONSTRAINT chk_mixer_count_nonnegative CHECK (((mixer_count IS NULL) OR (mixer_count >= (0)::numeric)));
ALTER TABLE public.daily_voucher_lines ADD CONSTRAINT chk_waste_qty_nonnegative CHECK ((waste_qty >= (0)::numeric));
ALTER TABLE public.farm_feed_formulas ADD CONSTRAINT chk_mixer_weight_nonnegative CHECK ((mixer_weight >= (0)::numeric));
ALTER TABLE public.farm_formula_items ADD CONSTRAINT chk_qty_per_mixer_nonnegative CHECK ((qty_per_mixer >= (0)::numeric));
ALTER TABLE public.farm_items ADD CONSTRAINT chk_packaging_unit_count_based CHECK ((category::text <> 'packaging') OR (unit IN ('عدد','کیسه','بسته','کارتن','شانه')));
ALTER TABLE public.farm_items ADD CONSTRAINT chk_reorder_point_nonnegative CHECK (((reorder_point IS NULL) OR (reorder_point >= (0)::numeric)));
ALTER TABLE public.inputs ADD CONSTRAINT chk_packaging_unit_count_based CHECK (((category <> 'packaging'::text) OR (default_unit = ANY (ARRAY['عدد'::text, 'کیسه'::text, 'بسته'::text, 'کارتن'::text, 'شانه'::text]))));
ALTER TABLE public.inputs ADD CONSTRAINT inputs_category_check CHECK ((category = ANY (ARRAY['feed'::text, 'packaging'::text])));
ALTER TABLE public.inventory_transactions ADD CONSTRAINT has_movement CHECK (((txn_type = 'initial'::txn_type_enum) OR ((qty_in > (0)::numeric) OR (qty_out > (0)::numeric))));
ALTER TABLE public.inventory_transactions ADD CONSTRAINT positive_qty CHECK (((qty_in >= (0)::numeric) AND (qty_out >= (0)::numeric)));

-- ============ NON-CONSTRAINT INDEXES ============
CREATE INDEX idx_fk_daily_voucher_lines_item_id ON public.daily_voucher_lines USING btree (item_id);
CREATE INDEX idx_fk_daily_voucher_lines_voucher_id ON public.daily_voucher_lines USING btree (voucher_id);
CREATE INDEX idx_daily_vouchers_date ON public.daily_vouchers USING btree (voucher_date DESC);
CREATE INDEX idx_daily_vouchers_farm_date ON public.daily_vouchers USING btree (farm_id, voucher_date);
CREATE INDEX idx_fk_daily_vouchers_created_by ON public.daily_vouchers USING btree (created_by);
CREATE INDEX idx_fk_daily_vouchers_farm_id ON public.daily_vouchers USING btree (farm_id);
CREATE INDEX idx_fk_daily_vouchers_reverted_by ON public.daily_vouchers USING btree (reverted_by);
CREATE INDEX idx_fk_daily_vouchers_submitted_by ON public.daily_vouchers USING btree (submitted_by);
CREATE INDEX idx_fk_farm_feed_formulas_farm_id ON public.farm_feed_formulas USING btree (farm_id);
CREATE INDEX idx_fk_farm_formula_items_formula_id ON public.farm_formula_items USING btree (formula_id);
CREATE INDEX idx_fk_farm_formula_items_item_id ON public.farm_formula_items USING btree (item_id);
CREATE INDEX idx_fk_farm_halls_farm_id ON public.farm_halls USING btree (farm_id);
CREATE INDEX idx_farm_items_active ON public.farm_items USING btree (farm_id, is_active);
CREATE INDEX idx_farm_items_priority ON public.farm_items USING btree (farm_id, category, priority);
CREATE INDEX idx_fk_farm_items_farm_id ON public.farm_items USING btree (farm_id);
CREATE INDEX idx_farms_active ON public.farms USING btree (is_active);
CREATE INDEX idx_fk_inputs_created_by ON public.inputs USING btree (created_by);
CREATE INDEX idx_inputs_category ON public.inputs USING btree (category);
CREATE INDEX idx_fk_inventory_transactions_created_by ON public.inventory_transactions USING btree (created_by);
CREATE INDEX idx_fk_inventory_transactions_farm_id ON public.inventory_transactions USING btree (farm_id);
CREATE INDEX idx_fk_inventory_transactions_item_id ON public.inventory_transactions USING btree (item_id);
CREATE INDEX idx_fk_inventory_transactions_supplier_id ON public.inventory_transactions USING btree (supplier_id);
CREATE INDEX idx_inv_txn_farm_date ON public.inventory_transactions USING btree (farm_id, txn_date);
CREATE INDEX idx_inv_txn_farm_item_date ON public.inventory_transactions USING btree (farm_id, item_id, txn_date);
CREATE INDEX idx_inv_txn_farm_type_date ON public.inventory_transactions USING btree (farm_id, txn_type, txn_date DESC);
CREATE INDEX idx_inv_txn_ledger_keyset ON public.inventory_transactions USING btree (farm_id, item_id, txn_ts DESC, id DESC);
CREATE INDEX idx_inv_txn_source ON public.inventory_transactions USING btree (source_type, source_id);
CREATE INDEX idx_inv_txn_supplier_date ON public.inventory_transactions USING btree (supplier_id, txn_date DESC, id DESC) WHERE (supplier_id IS NOT NULL);
CREATE INDEX idx_fk_profiles_created_by ON public.profiles USING btree (created_by);
CREATE INDEX idx_fk_profiles_farm_id ON public.profiles USING btree (farm_id);
CREATE INDEX idx_fk_suppliers_created_by ON public.suppliers USING btree (created_by);
CREATE UNIQUE INDEX suppliers_name_key ON public.suppliers USING btree (name);
CREATE INDEX idx_fk_user_activity_logs_user_id ON public.user_activity_logs USING btree (user_id);
