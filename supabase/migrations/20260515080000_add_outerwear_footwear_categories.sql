-- Add 'outerwear' and 'footwear' to wardrobe category constraints.
-- Run in Supabase SQL Editor after previous migrations.

-- v1 wardrobe_items
alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_category_check;

alter table public.wardrobe_items
  add constraint wardrobe_items_category_check
  check (category in ('tops', 'bottoms', 'outerwear', 'footwear', 'accessories'));

-- v2 wardrobe_items_v2
alter table public.wardrobe_items_v2
  drop constraint if exists wardrobe_items_v2_category_check;

alter table public.wardrobe_items_v2
  add constraint wardrobe_items_v2_category_check
  check (category in ('tops', 'bottoms', 'outerwear', 'footwear', 'accessories'));

-- saved_outfits_v2: add optional item reference columns for new categories
alter table public.saved_outfits_v2
  add column if not exists outerwear_client_item_id text,
  add column if not exists footwear_client_item_id text;
