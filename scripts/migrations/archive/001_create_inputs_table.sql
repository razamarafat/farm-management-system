-- Migration: Create global inputs catalog table
-- Run this in Supabase SQL Editor to create the inputs table

CREATE TABLE IF NOT EXISTS inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'feed' CHECK (category IN ('feed', 'packaging')),
  default_unit TEXT NOT NULL DEFAULT 'کیلوگرم',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT inputs_name_unique UNIQUE (name)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_inputs_category ON inputs(category);
CREATE INDEX IF NOT EXISTS idx_inputs_is_active ON inputs(is_active);
CREATE INDEX IF NOT EXISTS idx_inputs_name ON inputs(name);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_inputs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inputs_updated_at ON inputs;
CREATE TRIGGER trg_inputs_updated_at
  BEFORE UPDATE ON inputs
  FOR EACH ROW
  EXECUTE FUNCTION update_inputs_updated_at();

-- RLS: admins can do everything, others can only view
ALTER TABLE inputs ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can view active inputs
CREATE POLICY "Authenticated users can view inputs" ON inputs
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can insert/update/delete
CREATE POLICY "Admins can insert inputs" ON inputs
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can update inputs" ON inputs
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admins can delete inputs" ON inputs
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
