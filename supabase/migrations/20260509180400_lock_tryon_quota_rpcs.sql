-- Harden try-on quota RPCs so users cannot read or mutate another user's quota.
--
-- Mutating quota RPCs are server-only and should be called with the service-role
-- key from Next.js API routes. Authenticated clients may read only their own
-- quota via get_tryon_quota.

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
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized to update try-on quota'
      using errcode = '42501';
  end if;

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

create or replace function public.decrement_tryon_usage(
  p_user_id uuid,
  p_date    date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Not authorized to update try-on quota'
      using errcode = '42501';
  end if;

  update public.tryon_usage
  set day_count   = greatest(0, day_count - 1),
      total_count = greatest(0, total_count - 1)
  where user_id = p_user_id and used_date = p_date;
end;
$$;

create or replace function public.get_tryon_quota(p_user_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_day   int;
  v_month int;
begin
  if auth.role() <> 'service_role' and auth.uid() <> p_user_id then
    raise exception 'Not authorized to read try-on quota'
      using errcode = '42501';
  end if;

  select
    coalesce(
      (select day_count from public.tryon_usage
        where user_id = p_user_id and used_date = current_date),
      0
    ),
    coalesce(
      (select sum(day_count) from public.tryon_usage
        where user_id = p_user_id
          and date_trunc('month', used_date) = date_trunc('month', current_date)),
      0
    )
  into v_day, v_month;

  return json_build_object('day_count', v_day, 'total_count', v_month);
end;
$$;

revoke execute on function public.increment_tryon_usage(uuid, date) from PUBLIC, anon, authenticated;
revoke execute on function public.decrement_tryon_usage(uuid, date) from PUBLIC, anon, authenticated;
revoke execute on function public.get_tryon_quota(uuid) from PUBLIC, anon;

grant execute on function public.increment_tryon_usage(uuid, date) to service_role;
grant execute on function public.decrement_tryon_usage(uuid, date) to service_role;
grant execute on function public.get_tryon_quota(uuid) to authenticated, service_role;
