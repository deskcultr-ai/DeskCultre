begin;

-- Batch 1 is additive and preserves every status used by the existing app.
alter table public.profiles
  add column if not exists can_create_tasks boolean not null default false,
  add column if not exists can_review_tasks boolean not null default false;

update public.profiles
set can_create_tasks = true
where role::text in ('admin', 'owner', 'manager');

update public.profiles
set can_review_tasks = true
where role::text in ('admin', 'owner', 'manager', 'reviewer');

alter table public.tasks
  add column if not exists task_type text not null default 'one_time',
  add column if not exists status_changed_at timestamptz not null default now(),
  add column if not exists reopened_at timestamptz;

do $$
declare constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.tasks drop constraint %I', constraint_row.conname);
  end loop;
end $$;

alter table public.tasks
  drop constraint if exists tasks_task_type_check,
  add constraint tasks_task_type_check
    check (task_type in ('one_time', 'daily_recurring', 'continuous')),
  add constraint tasks_status_check
    check (status in (
      'draft', 'pending', 'assigned', 'in_progress', 'waiting', 'blocked',
      'under_review', 'submitted', 'approved', 'completed', 'rework',
      'rejected', 'reopened'
    ));

create table if not exists public.task_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  from_status text not null,
  to_status text not null,
  comment text not null check (length(btrim(comment)) > 0),
  created_at timestamptz not null default now()
);

create index if not exists task_status_history_task_created_idx
  on public.task_status_history(task_id, created_at desc);
create index if not exists task_status_history_company_idx
  on public.task_status_history(company_id, created_at desc);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  auth_session_id text not null,
  login_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  logout_at timestamptz,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, auth_session_id)
);

create index if not exists attendance_sessions_company_login_idx
  on public.attendance_sessions(company_id, login_at desc);
create index if not exists attendance_sessions_user_login_idx
  on public.attendance_sessions(user_id, login_at desc);

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid();
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_company_manager(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and company_id = target_company_id
      and role::text in ('admin', 'owner', 'manager')
  );
$$;

create or replace function public.guard_task_status_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('flowdesk.workflow_rpc', true), '') <> 'on' then
    raise exception 'Task status must be changed through transition_task';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_task_status_update on public.tasks;
create trigger guard_task_status_update
before update of status on public.tasks
for each row execute function public.guard_task_status_update();

create or replace function public.transition_task(
  target_task_id uuid,
  next_status text,
  transition_comment text
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  current_task public.tasks%rowtype;
  actor public.profiles%rowtype;
  result_task public.tasks%rowtype;
  normalized_status text := lower(btrim(next_status));
  normalized_comment text := btrim(transition_comment);
  actor_can_manage boolean;
  actor_can_review boolean;
  transition_allowed boolean;
  now_at timestamptz := now();
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if normalized_comment = '' then raise exception 'A written comment is required'; end if;

  select * into actor from public.profiles where id = auth.uid();
  if not found then raise exception 'Profile setup is required'; end if;

  select * into current_task from public.tasks where id = target_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if current_task.company_id <> actor.company_id then raise exception 'Task not found'; end if;

  actor_can_manage := coalesce(actor.role::text, '') in ('admin', 'owner', 'manager');
  actor_can_review := actor_can_manage or coalesce(actor.can_review_tasks, false);
  if not actor_can_manage and current_task.assigned_to is distinct from actor.id then
    raise exception 'Only the assignee or a manager can update this task';
  end if;

  transition_allowed := case current_task.status
    when 'draft' then normalized_status in ('pending', 'assigned')
    when 'pending' then normalized_status in ('assigned', 'in_progress')
    when 'assigned' then normalized_status = 'in_progress'
    when 'in_progress' then normalized_status in ('waiting', 'blocked', 'under_review', 'submitted')
    when 'waiting' then normalized_status in ('in_progress', 'blocked')
    when 'blocked' then normalized_status = 'in_progress'
    when 'under_review' then normalized_status in ('approved', 'rejected', 'rework')
    when 'submitted' then normalized_status in ('approved', 'rejected', 'rework')
    when 'rejected' then normalized_status in ('in_progress', 'under_review', 'submitted')
    when 'rework' then normalized_status in ('in_progress', 'under_review')
    when 'approved' then normalized_status = 'completed'
    when 'completed' then normalized_status = 'reopened'
    when 'reopened' then normalized_status = 'in_progress'
    else false
  end;

  if not transition_allowed then
    raise exception 'Invalid transition from % to %', current_task.status, normalized_status;
  end if;

  if normalized_status in ('approved', 'rejected', 'rework') and not actor_can_review then
    raise exception 'Review permission required';
  end if;
  if normalized_status in ('completed', 'reopened') and not actor_can_manage then
    raise exception 'Manager or admin permission required';
  end if;
  if normalized_status = 'completed' and current_task.status <> 'approved' then
    raise exception 'A task must be approved before completion';
  end if;

  perform set_config('flowdesk.workflow_rpc', 'on', true);
  update public.tasks
  set status = normalized_status,
      status_changed_at = now_at,
      submitted_at = case when normalized_status in ('under_review', 'submitted') then now_at else submitted_at end,
      approved_at = case when normalized_status = 'approved' then now_at else approved_at end,
      approved_by = case when normalized_status = 'approved' then actor.id else approved_by end,
      rejected_at = case when normalized_status in ('rejected', 'rework') then now_at else rejected_at end,
      completed_at = case when normalized_status = 'completed' then now_at else completed_at end,
      reopened_at = case when normalized_status = 'reopened' then now_at else reopened_at end
  where id = current_task.id
  returning * into result_task;

  insert into public.task_comments(task_id, company_id, user_id, comment)
  values (current_task.id, current_task.company_id, actor.id, normalized_comment);

  insert into public.task_status_history(
    company_id, task_id, actor_id, from_status, to_status, comment
  ) values (
    current_task.company_id, current_task.id, actor.id,
    current_task.status, normalized_status, normalized_comment
  );

  insert into public.task_activity(company_id, task_id, user_id, action, details)
  values (
    current_task.company_id, current_task.id, actor.id, 'status_changed',
    jsonb_build_object('from', current_task.status, 'to', normalized_status, 'comment', normalized_comment)
  );

  if normalized_status in ('under_review', 'submitted', 'approved', 'rejected', 'rework') then
    insert into public.task_approvals(company_id, task_id, user_id, decision)
    values (
      current_task.company_id,
      current_task.id,
      actor.id,
      case
        when normalized_status = 'under_review' then 'submitted'
        when normalized_status = 'rework' then 'rejected'
        else normalized_status
      end
    );
  end if;

  return result_task;
end;
$$;

create or replace function public.create_task_secure(
  task_title text,
  task_description text,
  task_department_id uuid,
  task_assigned_to uuid,
  task_priority text,
  task_due_date date,
  requested_task_type text default 'one_time'
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare actor public.profiles%rowtype; created_task public.tasks%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found then raise exception 'Profile setup is required'; end if;
  if coalesce(actor.role::text, '') not in ('admin', 'owner', 'manager')
     and not coalesce(actor.can_create_tasks, false) then
    raise exception 'You do not have permission to create tasks';
  end if;
  if btrim(task_title) = '' then raise exception 'Title is required'; end if;
  if task_priority not in ('low', 'medium', 'high', 'urgent') then raise exception 'Invalid priority'; end if;
  if requested_task_type not in ('one_time', 'daily_recurring', 'continuous') then raise exception 'Invalid task type'; end if;
  if task_assigned_to is not null and not exists (
    select 1 from public.profiles where id = task_assigned_to and company_id = actor.company_id and is_active = true
  ) then raise exception 'Invalid assignee'; end if;
  if task_department_id is not null and not exists (
    select 1 from public.departments where id = task_department_id and company_id = actor.company_id
  ) then raise exception 'Invalid department'; end if;

  insert into public.tasks(
    company_id, title, description, department_id, assigned_to, priority,
    due_date, created_by, status, task_type, status_changed_at
  ) values (
    actor.company_id, btrim(task_title), nullif(btrim(task_description), ''),
    task_department_id, task_assigned_to, task_priority, task_due_date,
    actor.id, case when task_assigned_to is null then 'pending' else 'assigned' end,
    requested_task_type, now()
  ) returning * into created_task;

  insert into public.task_activity(company_id, task_id, user_id, action, details)
  values (actor.company_id, created_task.id, actor.id, 'task_created', jsonb_build_object('status', created_task.status));
  return created_task;
end;
$$;

create or replace function public.record_attendance_login(
  request_ip text default null,
  request_user_agent text default null
)
returns public.attendance_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  session_key text;
  parsed_ip inet;
  attendance public.attendance_sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into actor from public.profiles where id = auth.uid();
  if not found then raise exception 'Profile setup is required'; end if;
  session_key := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id',
    auth.uid()::text || ':' || current_date::text
  );
  begin parsed_ip := nullif(split_part(request_ip, ',', 1), '')::inet;
  exception when invalid_text_representation then parsed_ip := null; end;

  insert into public.attendance_sessions(
    company_id, user_id, auth_session_id, ip_address, user_agent
  ) values (
    actor.company_id, actor.id, session_key, parsed_ip, left(request_user_agent, 500)
  )
  on conflict (user_id, auth_session_id) do update
    set last_seen_at = now()
  returning * into attendance;
  return attendance;
end;
$$;

alter table public.task_status_history enable row level security;
alter table public.attendance_sessions enable row level security;

drop policy if exists task_status_history_select on public.task_status_history;
create policy task_status_history_select on public.task_status_history for select
using (company_id = public.current_company_id());

drop policy if exists attendance_sessions_select on public.attendance_sessions;
create policy attendance_sessions_select on public.attendance_sessions for select
using (
  user_id = auth.uid()
  or public.is_company_manager(company_id)
);

revoke insert, update, delete on public.task_status_history from authenticated;
revoke insert, update, delete on public.attendance_sessions from authenticated;
grant select on public.task_status_history, public.attendance_sessions to authenticated;
grant execute on function public.transition_task(uuid, text, text) to authenticated;
grant execute on function public.create_task_secure(text, text, uuid, uuid, text, date, text) to authenticated;
grant execute on function public.record_attendance_login(text, text) to authenticated;

commit;
