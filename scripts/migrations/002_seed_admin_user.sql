-- Migration: Seed default admin user
-- Run this in Supabase SQL Editor to bootstrap the admin user safely.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  admin_id UUID := gen_random_uuid();
  admin_username TEXT := 'admin';
  admin_email TEXT := 'admin@morvarid.local';
  admin_password_hash TEXT;
  existing_profile_id UUID;
BEGIN
  -- 1. Check if any admin profile already exists
  SELECT id INTO existing_profile_id FROM public.profiles WHERE role = 'admin' LIMIT 1;

  IF existing_profile_id IS NOT NULL THEN
    RAISE NOTICE 'Admin profile already exists (ID: %). Skipping seed.', existing_profile_id;
    RETURN;
  END IF;

  -- 2. Check if a user with the admin email already exists in auth.users
  SELECT id INTO existing_profile_id FROM auth.users WHERE email = admin_email LIMIT 1;

  IF existing_profile_id IS NOT NULL THEN
    RAISE NOTICE 'Auth user already exists with email %. Reusing auth ID.', admin_email;
    admin_id := existing_profile_id;
  ELSE
    -- Generate password hash for 'Admin@123' (secure default)
    -- In production, the password should be changed immediately after setup.
    admin_password_hash := crypt('Admin@123', gen_salt('bf'));

    -- Create new auth user
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role,
      created_at,
      updated_at,
      is_super_admin,
      phone,
      phone_confirmed_at,
      confirmed_at,
      email_change,
      email_change_token_current,
      email_change_confirm_status,
      banned_until,
      reconfirmation_token,
      is_sso_user,
      deleted_at
    ) VALUES (
      admin_id,
      '00000000-0000-0000-0000-000000000000',
      admin_email,
      admin_password_hash,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', 'admin', 'username', admin_username),
      'authenticated',
      'authenticated',
      now(),
      now(),
      false,
      null,
      null,
      now(),
      '',
      '',
      0,
      null,
      '',
      false,
      null
    );
  END IF;

  -- 3. Insert or update the profiles table
  INSERT INTO public.profiles (
    id,
    username,
    role,
    first_name,
    last_name,
    is_active,
    created_at,
    updated_at
  ) VALUES (
    admin_id,
    admin_username,
    'admin',
    'مدیر',
    'سیستم',
    true,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    role = 'admin',
    username = admin_username,
    is_active = true,
    updated_at = now();

  RAISE NOTICE 'Admin user seeded successfully.';
END $$;
