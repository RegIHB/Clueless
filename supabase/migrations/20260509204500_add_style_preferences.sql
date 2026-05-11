-- Minimal style preferences model. Stored on profiles so the app can save a
-- small launch-ready preference set without adding a full settings subsystem.

alter table public.profiles
  add column if not exists style_preferences jsonb not null default '{}'::jsonb;

grant insert (style_preferences) on table public.profiles to authenticated;
grant update (style_preferences) on table public.profiles to authenticated;
