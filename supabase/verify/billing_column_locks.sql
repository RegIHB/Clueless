-- Verify that authenticated users cannot write billing columns on profiles.
-- Run in Supabase SQL Editor. All queries should return zero rows.
-- If any return rows, column grants on profiles are misconfigured.

-- 1. Columns the "authenticated" role can INSERT into profiles.
--    Expected: id, display_name, onboarding_completed, selfie_url, updated_at, style_preferences.
--    Must NOT include: is_pro, ls_customer_id, ls_subscription_id, ls_subscription_status.
select column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee = 'authenticated'
  and privilege_type = 'INSERT'
  and column_name in ('is_pro', 'ls_customer_id', 'ls_subscription_id', 'ls_subscription_status');

-- 2. Columns the "authenticated" role can UPDATE on profiles.
--    Same expected set minus "id". Must NOT include billing columns.
select column_name
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee = 'authenticated'
  and privilege_type = 'UPDATE'
  and column_name in ('is_pro', 'ls_customer_id', 'ls_subscription_id', 'ls_subscription_status');

-- 3. Same checks for "anon" role (should have zero writable columns on profiles).
select column_name, privilege_type
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'profiles'
  and grantee = 'anon'
  and privilege_type in ('INSERT', 'UPDATE');
