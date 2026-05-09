-- Restrict client-writable profile columns after billing fields were added.
--
-- RLS still limits rows to auth.uid() = id; these column grants limit what the
-- browser's authenticated role can write inside its own row. Billing columns
-- must remain writable only from trusted server/service-role code.

revoke insert on table public.profiles from anon, authenticated;
revoke update on table public.profiles from anon, authenticated;

grant insert (
  id,
  display_name,
  onboarding_completed,
  selfie_url,
  updated_at
) on table public.profiles to authenticated;

grant update (
  display_name,
  onboarding_completed,
  selfie_url,
  updated_at
) on table public.profiles to authenticated;
