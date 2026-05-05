-- Parity check for the wardrobe v2 rollout. Run after dual-write has been
-- live long enough for steady-state. All result sets should be empty.

-- 1. Users with mismatched wardrobe row counts between v1 and v2.
with v1_counts as (
  select user_id, count(*) as cnt
  from public.wardrobe_items
  group by user_id
), v2_counts as (
  select user_id, count(*) as cnt
  from public.wardrobe_items_v2
  where deleted_at is null
  group by user_id
)
select coalesce(v1.user_id, v2.user_id) as user_id,
       v1.cnt as v1_count,
       v2.cnt as v2_count
from v1_counts v1
full outer join v2_counts v2 using (user_id)
where coalesce(v1.cnt, 0) <> coalesce(v2.cnt, 0)
order by user_id;

-- 2. Wardrobe items present in v1 but missing in v2 (live rows only).
select w1.user_id, w1.code
from public.wardrobe_items w1
left join public.wardrobe_items_v2 w2
  on w2.user_id = w1.user_id and w2.client_item_id = w1.code and w2.deleted_at is null
where w2.id is null
order by w1.user_id, w1.code
limit 100;

-- 3. Saved outfits present in v1 but missing in v2.
select o1.user_id, o1.id
from public.saved_outfits o1
left join public.saved_outfits_v2 o2
  on o2.user_id = o1.user_id and o2.client_outfit_id = o1.id::text and o2.deleted_at is null
where o2.id is null
order by o1.user_id, o1.id
limit 100;

-- 4. Version monotonicity sanity: every v2 row should have version >= 1.
select id, user_id, version
from public.wardrobe_items_v2
where version < 1
limit 50;

select id, user_id, version
from public.saved_outfits_v2
where version < 1
limit 50;

-- 5. Orphan wardrobe references on saved outfits (snapshot ok, but ids should resolve).
select o.user_id,
       o.id,
       o.tops_client_item_id,
       o.bottoms_client_item_id,
       o.accessories_client_item_id
from public.saved_outfits_v2 o
left join public.wardrobe_items_v2 t
  on t.user_id = o.user_id and t.client_item_id = o.tops_client_item_id and t.deleted_at is null
left join public.wardrobe_items_v2 b
  on b.user_id = o.user_id and b.client_item_id = o.bottoms_client_item_id and b.deleted_at is null
left join public.wardrobe_items_v2 a
  on a.user_id = o.user_id and a.client_item_id = o.accessories_client_item_id and a.deleted_at is null
where (o.tops_client_item_id is not null and t.id is null)
   or (o.bottoms_client_item_id is not null and b.id is null)
   or (o.accessories_client_item_id is not null and a.id is null)
limit 100;
