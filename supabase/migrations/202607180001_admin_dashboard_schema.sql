-- ============================================================================
-- Admin dashboard live-data support
--
-- Adds the missing projects schema used by the Admin dashboard and exposes a
-- single RPC for the dashboard widgets. The UI should call this RPC instead of
-- rendering hardcoded mock metrics.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum ('planning', 'in_progress', 'on_hold', 'completed', 'cancelled');
  end if;
end $$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  department_id uuid references public.departments (id) on delete set null,
  title text not null,
  description text,
  owner_id uuid references public.profiles (id) on delete set null,
  status public.project_status not null default 'planning',
  progress integer not null default 0 check (progress between 0 and 100),
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_company_idx on public.projects (company_id);
create index if not exists projects_department_idx on public.projects (department_id);
create index if not exists projects_status_idx on public.projects (company_id, status);

drop trigger if exists touch_projects on public.projects;
create trigger touch_projects before update on public.projects
  for each row execute function public.touch_updated_at();

alter table public.projects enable row level security;

drop policy if exists projects_select_company on public.projects;
create policy projects_select_company on public.projects
  for select using (company_id = public.current_company_id());

drop policy if exists projects_manager_write on public.projects;
create policy projects_manager_write on public.projects
  for all using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id() and public.is_manager());

create or replace function public.get_admin_dashboard_data(period text default 'week')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  range_start timestamptz;
  range_end timestamptz := now();
  previous_start timestamptz;
  total_users integer := 0;
  new_users integer := 0;
  total_departments integer := 0;
  new_departments integer := 0;
  total_tasks integer := 0;
  current_tasks integer := 0;
  previous_tasks integer := 0;
  active_projects integer := 0;
  new_projects integer := 0;
  pending_approvals integer := 0;
  meetings_today integer := 0;
  storage_used bigint := 0;
  storage_limit bigint := 536870912000;
  team_goal_percent integer := 0;
begin
  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active' and role in ('super_admin', 'admin');

  if caller_company is null then
    raise exception 'Admin access required';
  end if;

  range_start := case lower(coalesce(period, 'week'))
    when 'today' then date_trunc('day', now())
    when 'month' then date_trunc('month', now())
    else now() - interval '6 days'
  end;
  previous_start := range_start - (range_end - range_start);

  select count(*) into total_users
  from public.profiles
  where company_id = caller_company and status = 'active';

  select count(*) into new_users
  from public.profiles
  where company_id = caller_company and status = 'active' and created_at >= range_start;

  select count(*) into total_departments
  from public.departments
  where company_id = caller_company;

  select count(*) into new_departments
  from public.departments
  where company_id = caller_company and created_at >= range_start;

  select count(*) into total_tasks
  from public.tasks
  where company_id = caller_company;

  select count(*) into current_tasks
  from public.tasks
  where company_id = caller_company and created_at >= range_start and created_at <= range_end;

  select count(*) into previous_tasks
  from public.tasks
  where company_id = caller_company and created_at >= previous_start and created_at < range_start;

  select count(*) into active_projects
  from public.projects
  where company_id = caller_company and status in ('planning', 'in_progress');

  select count(*) into new_projects
  from public.projects
  where company_id = caller_company and created_at >= range_start;

  select
    coalesce((select count(*) from public.profiles where company_id = caller_company and status = 'pending'), 0) +
    coalesce((select count(*) from public.requests where company_id = caller_company and status = 'pending'), 0) +
    coalesce((select count(*) from public.leave_requests where company_id = caller_company and status = 'pending'), 0)
  into pending_approvals;

  select count(*) into meetings_today
  from public.meetings
  where company_id = caller_company
    and starts_at >= date_trunc('day', now())
    and starts_at < date_trunc('day', now()) + interval '1 day'
    and status <> 'cancelled';

  select coalesce(sum(size_bytes), 0) into storage_used
  from public.drive_files
  where company_id = caller_company and is_trashed = false;

  select coalesce(c.storage_limit_bytes, 536870912000) into storage_limit
  from public.companies c
  where c.id = caller_company;

  if total_tasks > 0 then
    select round((count(*) filter (where status = 'completed')::numeric / total_tasks::numeric) * 100)::integer
    into team_goal_percent
    from public.tasks
    where company_id = caller_company;
  end if;

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'totalUsers', total_users,
      'newUsers', new_users,
      'departments', total_departments,
      'newDepartments', new_departments,
      'totalTasks', total_tasks,
      'currentTasks', current_tasks,
      'previousTasks', previous_tasks,
      'activeProjects', active_projects,
      'newProjects', new_projects,
      'pendingApprovals', pending_approvals,
      'meetingsToday', meetings_today,
      'storageUsed', storage_used,
      'storageLimit', storage_limit,
      'teamGoalPercent', team_goal_percent
    ),
    'organizationActivity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', days.day::date,
        'label', to_char(days.day, 'Dy'),
        'count', coalesce(activity.count, 0)
      ) order by days.day)
      from generate_series(date_trunc('day', now()) - interval '6 days', date_trunc('day', now()), interval '1 day') days(day)
      left join (
        select date_trunc('day', created_at) as day, count(*)::integer as count
        from public.activity_log
        where company_id = caller_company and created_at >= date_trunc('day', now()) - interval '6 days'
        group by date_trunc('day', created_at)
      ) activity on activity.day = days.day
    ), '[]'::jsonb),
    'departmentDistribution', coalesce((
      with active_people as (
        select department_id, count(*)::integer as count
        from public.profiles
        where company_id = caller_company and status = 'active'
        group by department_id
      ),
      total as (
        select greatest(sum(count), 0)::numeric as value from active_people
      )
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'count', coalesce(ap.count, 0),
        'percent', case when total.value > 0 then round((coalesce(ap.count, 0)::numeric / total.value) * 100)::integer else 0 end
      ) order by coalesce(ap.count, 0) desc, d.name)
      from public.departments d
      cross join total
      left join active_people ap on ap.department_id = d.id
      where d.company_id = caller_company
    ), '[]'::jsonb),
    'departmentPerformance', coalesce((
      with task_counts as (
        select department_id,
               count(*)::integer as total,
               count(*) filter (where status = 'completed')::integer as completed
        from public.tasks
        where company_id = caller_company
        group by department_id
      )
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'total', coalesce(tc.total, 0),
        'completed', coalesce(tc.completed, 0),
        'percent', case when coalesce(tc.total, 0) > 0 then round((tc.completed::numeric / tc.total::numeric) * 100)::integer else 0 end
      ) order by case when coalesce(tc.total, 0) > 0 then (tc.completed::numeric / tc.total::numeric) else 0 end desc, d.name)
      from public.departments d
      left join task_counts tc on tc.department_id = d.id
      where d.company_id = caller_company
      limit 5
    ), '[]'::jsonb),
    'recentActivity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'title', coalesce(a.summary, a.action),
        'detail', a.action,
        'createdAt', a.created_at
      ) order by a.created_at desc)
      from (
        select id, summary, action, created_at
        from public.activity_log
        where company_id = caller_company
        order by created_at desc
        limit 5
      ) a
    ), '[]'::jsonb),
    'upcomingMeetings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'title', m.title,
        'startsAt', m.starts_at,
        'endsAt', m.ends_at,
        'joinUrl', m.join_url
      ) order by m.starts_at)
      from (
        select id, title, starts_at, ends_at, join_url
        from public.meetings
        where company_id = caller_company
          and starts_at >= now()
          and status <> 'cancelled'
        order by starts_at
        limit 3
      ) m
    ), '[]'::jsonb),
    'pendingApprovals', coalesce((
      select jsonb_agg(item order by (item ->> 'createdAt')::timestamptz desc)
      from (
        select jsonb_build_object(
          'id', p.id,
          'kind', 'access',
          'title', 'Access approval',
          'person', coalesce(p.full_name, p.email, 'Pending user'),
          'priority', 'High',
          'createdAt', p.created_at,
          'href', '/admin/users'
        ) item
        from public.profiles p
        where p.company_id = caller_company and p.status = 'pending'
        union all
        select jsonb_build_object(
          'id', r.id,
          'kind', 'request',
          'title', r.title,
          'person', coalesce(p.full_name, p.email, 'Requester'),
          'priority', initcap(r.priority::text),
          'createdAt', r.created_at,
          'href', '/admin/requests'
        )
        from public.requests r
        left join public.profiles p on p.id = r.requester_id
        where r.company_id = caller_company and r.status = 'pending'
        union all
        select jsonb_build_object(
          'id', l.id,
          'kind', 'leave',
          'title', 'Leave request',
          'person', coalesce(p.full_name, p.email, 'Team member'),
          'priority', 'Medium',
          'createdAt', l.created_at,
          'href', '/settings/attendance'
        )
        from public.leave_requests l
        left join public.profiles p on p.id = l.profile_id
        where l.company_id = caller_company and l.status = 'pending'
      ) approvals
      limit 5
    ), '[]'::jsonb),
    'storageBreakdown', coalesce((
      select jsonb_agg(jsonb_build_object('label', label, 'bytes', bytes) order by bytes desc)
      from (
        select
          case
            when mime_type like 'image/%' or mime_type like 'video/%' then 'Media'
            when mime_type in ('application/pdf', 'text/plain') or mime_type like 'application/vnd.%' then 'Documents'
            else 'Others'
          end as label,
          sum(size_bytes)::bigint as bytes
        from public.drive_files
        where company_id = caller_company and is_trashed = false
        group by 1
      ) storage_rows
    ), '[]'::jsonb),
    'notifications', jsonb_build_object(
      'unreadCount', coalesce((
        select count(*) from public.notifications
        where profile_id = caller and read_at is null
      ), 0),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', n.id,
          'title', n.title,
          'body', n.body,
          'link', n.link,
          'readAt', n.read_at,
          'createdAt', n.created_at
        ) order by n.created_at desc)
        from (
          select id, title, body, link, read_at, created_at
          from public.notifications
          where profile_id = caller
          order by created_at desc
          limit 5
        ) n
      ), '[]'::jsonb)
    ),
    'teamMembers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(p.full_name, p.email, 'Team member'),
        'avatarUrl', p.avatar_url,
        'role', p.role
      ) order by p.created_at desc)
      from (
        select id, full_name, email, avatar_url, role, created_at
        from public.profiles
        where company_id = caller_company and status = 'active'
        order by created_at desc
        limit 5
      ) p
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_admin_dashboard_data(text) to authenticated;
