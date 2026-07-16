begin;

create or replace function public.record_attendance_logout()
returns public.attendance_sessions language plpgsql security definer set search_path=public as $$
declare result public.attendance_sessions%rowtype;
begin
  with active as (select id from public.attendance_sessions where user_id=auth.uid() and logout_at is null order by login_at desc limit 1)
  update public.attendance_sessions a set logout_at=now(), last_seen_at=now(),
    attendance_status=case when a.expected_end_at is not null and now() > a.expected_end_at then 'overtime' else a.attendance_status end
  from active where a.id=active.id returning a.* into result;
  if not found then raise exception 'Active attendance session not found'; end if;
  return result;
end; $$;

grant execute on function public.record_attendance_logout() to authenticated;
commit;
