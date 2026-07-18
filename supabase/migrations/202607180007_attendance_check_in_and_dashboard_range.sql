-- ============================================================================
-- Admin dashboard attendance controls + date range dashboard filtering
-- ============================================================================

create or replace function public.get_my_attendance_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  today_row public.attendance_sessions%rowtype;
begin
  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'Active company profile required';
  end if;

  select *
  into today_row
  from public.attendance_sessions
  where profile_id = caller and work_date = current_date
  limit 1;

  return jsonb_build_object(
    'id', today_row.id,
    'workDate', coalesce(today_row.work_date, current_date),
    'checkInAt', today_row.check_in_at,
    'checkOutAt', today_row.check_out_at,
    'isCheckedIn', today_row.check_in_at is not null and today_row.check_out_at is null,
    'elapsedSeconds', case
      when today_row.check_in_at is null then 0
      else extract(epoch from (coalesce(today_row.check_out_at, now()) - today_row.check_in_at))::integer
    end
  );
end;
$$;

create or replace function public.record_attendance_check_in()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
begin
  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'Active company profile required';
  end if;

  insert into public.attendance_sessions (company_id, profile_id, work_date, check_in_at, status)
  values (caller_company, caller, current_date, now(), 'present')
  on conflict (profile_id, work_date) do update
    set check_in_at = coalesce(public.attendance_sessions.check_in_at, excluded.check_in_at),
        check_out_at = null,
        status = 'present',
        updated_at = now();

  insert into public.activity_log (company_id, actor_id, action, entity_type, summary)
  values (caller_company, caller, 'attendance.check_in', 'attendance_sessions', 'Checked in for the day');

  return public.get_my_attendance_state();
end;
$$;

create or replace function public.record_attendance_check_out()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  updated_count integer;
begin
  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'Active company profile required';
  end if;

  update public.attendance_sessions
  set check_out_at = now(), updated_at = now()
  where profile_id = caller
    and company_id = caller_company
    and work_date = current_date
    and check_in_at is not null
    and check_out_at is null;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Check in before checking out';
  end if;

  insert into public.activity_log (company_id, actor_id, action, entity_type, summary)
  values (caller_company, caller, 'attendance.check_out', 'attendance_sessions', 'Checked out for the day');

  return public.get_my_attendance_state();
end;
$$;

create or replace function public.record_attendance_login(
  request_ip text default null,
  request_user_agent text default null,
  request_context jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.record_attendance_check_in();
end;
$$;

create or replace function public.record_attendance_logout()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.record_attendance_check_out();
end;
$$;

create or replace function public.get_admin_dashboard_data_range(
  period text default 'week',
  range_start_date date default null,
  range_end_date date default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  base jsonb;
  start_day date;
  end_day date;
  range_start timestamptz;
  range_end timestamptz;
  previous_start timestamptz;
  new_users integer := 0;
  new_departments integer := 0;
  current_tasks integer := 0;
  previous_tasks integer := 0;
  new_projects integer := 0;
  meetings_in_range integer := 0;
  activity jsonb := '[]'::jsonb;
  performance jsonb := '[]'::jsonb;
  recent jsonb := '[]'::jsonb;
  meetings jsonb := '[]'::jsonb;
begin
  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active' and role in ('super_admin', 'admin');

  if caller_company is null then
    raise exception 'Admin access required';
  end if;

  if range_start_date is null and range_end_date is null then
    return public.get_admin_dashboard_data(period);
  end if;

  start_day := coalesce(range_start_date, current_date);
  end_day := greatest(coalesce(range_end_date, start_day), start_day);
  range_start := start_day::timestamptz;
  range_end := (end_day + 1)::timestamptz;
  previous_start := range_start - (range_end - range_start);
  base := public.get_admin_dashboard_data(period);

  select count(*) into new_users
  from public.profiles
  where company_id = caller_company and status = 'active' and created_at >= range_start and created_at < range_end;

  select count(*) into new_departments
  from public.departments
  where company_id = caller_company and created_at >= range_start and created_at < range_end;

  select count(*) into current_tasks
  from public.tasks
  where company_id = caller_company and created_at >= range_start and created_at < range_end;

  select count(*) into previous_tasks
  from public.tasks
  where company_id = caller_company and created_at >= previous_start and created_at < range_start;

  select count(*) into new_projects
  from public.projects
  where company_id = caller_company and created_at >= range_start and created_at < range_end;

  select count(*) into meetings_in_range
  from public.meetings
  where company_id = caller_company and starts_at >= range_start and starts_at < range_end and status <> 'cancelled';

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', days.day::date,
    'label', to_char(days.day, 'Dy'),
    'count', coalesce(activity_rows.count, 0)
  ) order by days.day), '[]'::jsonb)
  into activity
  from generate_series(start_day, end_day, interval '1 day') days(day)
  left join (
    select date_trunc('day', created_at)::date as day, count(*)::integer as count
    from public.activity_log
    where company_id = caller_company and created_at >= range_start and created_at < range_end
    group by date_trunc('day', created_at)::date
  ) activity_rows on activity_rows.day = days.day::date;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id,
    'name', d.name,
    'total', coalesce(tc.total, 0),
    'completed', coalesce(tc.completed, 0),
    'percent', case when coalesce(tc.total, 0) > 0 then round((tc.completed::numeric / tc.total::numeric) * 100)::integer else 0 end
  ) order by case when coalesce(tc.total, 0) > 0 then (tc.completed::numeric / tc.total::numeric) else 0 end desc, d.name), '[]'::jsonb)
  into performance
  from public.departments d
  left join (
    select department_id,
           count(*)::integer as total,
           count(*) filter (where status = 'completed')::integer as completed
    from public.tasks
    where company_id = caller_company and created_at >= range_start and created_at < range_end
    group by department_id
  ) tc on tc.department_id = d.id
  where d.company_id = caller_company;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'title', coalesce(a.summary, a.action),
    'detail', a.action,
    'createdAt', a.created_at
  ) order by a.created_at desc), '[]'::jsonb)
  into recent
  from (
    select id, summary, action, created_at
    from public.activity_log
    where company_id = caller_company and created_at >= range_start and created_at < range_end
    order by created_at desc
    limit 5
  ) a;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'title', m.title,
    'startsAt', m.starts_at,
    'endsAt', m.ends_at,
    'joinUrl', m.join_url
  ) order by m.starts_at), '[]'::jsonb)
  into meetings
  from (
    select id, title, starts_at, ends_at, join_url
    from public.meetings
    where company_id = caller_company
      and starts_at >= range_start
      and starts_at < range_end
      and status <> 'cancelled'
    order by starts_at
    limit 3
  ) m;

  base := jsonb_set(base, '{stats,newUsers}', to_jsonb(new_users), true);
  base := jsonb_set(base, '{stats,newDepartments}', to_jsonb(new_departments), true);
  base := jsonb_set(base, '{stats,currentTasks}', to_jsonb(current_tasks), true);
  base := jsonb_set(base, '{stats,previousTasks}', to_jsonb(previous_tasks), true);
  base := jsonb_set(base, '{stats,newProjects}', to_jsonb(new_projects), true);
  base := jsonb_set(base, '{stats,meetingsToday}', to_jsonb(meetings_in_range), true);
  base := jsonb_set(base, '{organizationActivity}', activity, true);
  base := jsonb_set(base, '{departmentPerformance}', performance, true);
  base := jsonb_set(base, '{recentActivity}', recent, true);
  base := jsonb_set(base, '{upcomingMeetings}', meetings, true);

  return base;
end;
$$;

grant execute on function public.get_my_attendance_state() to authenticated;
grant execute on function public.record_attendance_check_in() to authenticated;
grant execute on function public.record_attendance_check_out() to authenticated;
grant execute on function public.record_attendance_login(text, text, jsonb) to authenticated;
grant execute on function public.record_attendance_logout() to authenticated;
grant execute on function public.get_admin_dashboard_data_range(text, date, date) to authenticated;
