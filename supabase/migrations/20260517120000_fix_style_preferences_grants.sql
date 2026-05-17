-- Ensure authenticated users can read/write style_preferences on their own row.
-- The billing lock migration (20260509172500) revoked table-level UPDATE; this
-- re-applies column grants idempotently if 20260509204500 was never applied.

grant update (
  display_name,
  onboarding_completed,
  selfie_url,
  style_preferences,
  updated_at
) on table public.profiles to authenticated;

grant insert (
  id,
  display_name,
  onboarding_completed,
  selfie_url,
  style_preferences,
  updated_at
) on table public.profiles to authenticated;
