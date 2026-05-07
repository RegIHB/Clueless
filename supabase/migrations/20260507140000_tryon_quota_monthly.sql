-- Switch free-plan try-on quota from lifetime to per-calendar-month.
-- The tryon_usage table is unchanged; we just scope the sum to the current month.

create or replace function public.increment_tryon_usage(
  p_user_id uuid,
  p_date    date
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day   int;
  v_month int;
begin
  insert into public.tryon_usage (user_id, used_date, day_count, total_count)
  values (p_user_id, p_date, 1, 1)
  on conflict (user_id, used_date) do update
    set day_count   = tryon_usage.day_count + 1,
        total_count = tryon_usage.total_count + 1;

  select
    (select day_count from public.tryon_usage
      where user_id = p_user_id and used_date = p_date),
    (select coalesce(sum(day_count), 0) from public.tryon_usage
      where user_id = p_user_id
        and date_trunc('month', used_date) = date_trunc('month', p_date))
  into v_day, v_month;

  return json_build_object('day_count', v_day, 'total_count', v_month);
end;
$$;

create or replace function public.get_tryon_quota(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'day_count',
    coalesce(
      (select day_count from public.tryon_usage
        where user_id = p_user_id and used_date = current_date),
      0
    ),
    'total_count',
    coalesce(
      (select sum(day_count) from public.tryon_usage
        where user_id = p_user_id
          and date_trunc('month', used_date) = date_trunc('month', current_date)),
      0
    )
  );
$$;
