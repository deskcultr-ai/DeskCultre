begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

create table if not exists public.task_escalations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  raised_by uuid not null references public.profiles(id) on delete restrict,
  severity text not null check (severity in ('low', 'medium', 'high', 'urgent')),
  reason text not null check (length(btrim(reason)) > 0),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index if not exists task_escalations_company_open_idx on public.task_escalations(company_id, created_at desc) where resolved_at is null;

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  title text not null,
  scheduled_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 15 and 480),
  agenda text,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_company_scheduled_idx on public.meetings(company_id, scheduled_at desc);

create table if not exists public.meeting_attendees (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response_status text not null default 'pending' check (response_status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  primary key (meeting_id, user_id)
);

create table if not exists public.meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  decision text not null check (length(btrim(decision)) > 0),
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.meeting_action_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  assigned_to uuid references public.profiles(id) on delete set null,
  due_date date,
  task_id uuid references public.tasks(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
alter table public.task_escalations enable row level security;
alter table public.meetings enable row level security;
alter table public.meeting_attendees enable row level security;
alter table public.meeting_decisions enable row level security;
alter table public.meeting_action_items enable row level security;

create policy notifications_select on public.notifications for select using (user_id = auth.uid() or public.is_company_manager(company_id));
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy escalations_select on public.task_escalations for select using (company_id = public.current_company_id());
create policy meetings_select on public.meetings for select using (company_id = public.current_company_id());
create policy meetings_manage on public.meetings for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));
create policy meeting_attendees_select on public.meeting_attendees for select using (exists (select 1 from public.meetings m where m.id = meeting_id and m.company_id = public.current_company_id()));
create policy meeting_attendees_manage on public.meeting_attendees for all using (exists (select 1 from public.meetings m where m.id = meeting_id and public.is_company_manager(m.company_id))) with check (exists (select 1 from public.meetings m where m.id = meeting_id and public.is_company_manager(m.company_id)));
create policy meeting_decisions_select on public.meeting_decisions for select using (company_id = public.current_company_id());
create policy meeting_decisions_manage on public.meeting_decisions for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));
create policy meeting_action_items_select on public.meeting_action_items for select using (company_id = public.current_company_id());

create or replace function public.create_task_escalation(target_task_id uuid, escalation_severity text, escalation_reason text)
returns public.task_escalations
language plpgsql security definer set search_path = public
as $$
declare actor public.profiles%rowtype; target_task public.tasks%rowtype; escalation public.task_escalations%rowtype; manager record;
begin
  select * into actor from public.profiles where id = auth.uid();
  select * into target_task from public.tasks where id = target_task_id;
  if not found or target_task.company_id <> actor.company_id then raise exception 'Task not found'; end if;
  if actor.role::text not in ('admin','owner','manager') and target_task.assigned_to is distinct from actor.id then raise exception 'Only the assignee or a manager can raise an escalation'; end if;
  if escalation_severity not in ('low','medium','high','urgent') or btrim(escalation_reason) = '' then raise exception 'A valid severity and reason are required'; end if;
  insert into public.task_escalations(company_id, task_id, raised_by, severity, reason) values (actor.company_id, target_task.id, actor.id, escalation_severity, btrim(escalation_reason)) returning * into escalation;
  for manager in select id from public.profiles where company_id = actor.company_id and role::text in ('admin','manager') and is_active loop
    insert into public.notifications(company_id, user_id, task_id, notification_type, title, body) values (actor.company_id, manager.id, target_task.id, 'escalation', 'Task escalation: ' || target_task.title, btrim(escalation_reason));
  end loop;
  insert into public.task_activity(company_id, task_id, user_id, action, details) values (actor.company_id, target_task.id, actor.id, 'task_escalated', jsonb_build_object('severity', escalation_severity, 'reason', escalation_reason));
  return escalation;
end; $$;

create or replace function public.resolve_task_escalation(target_escalation_id uuid, resolution text)
returns public.task_escalations
language plpgsql security definer set search_path = public
as $$
declare escalation public.task_escalations%rowtype; actor public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  select * into escalation from public.task_escalations where id = target_escalation_id for update;
  if not found or not public.is_company_manager(escalation.company_id) then raise exception 'Manager or admin permission required'; end if;
  if btrim(resolution) = '' then raise exception 'A resolution note is required'; end if;
  update public.task_escalations set resolved_at = now(), resolved_by = actor.id, resolution_note = btrim(resolution) where id = escalation.id returning * into escalation;
  return escalation;
end; $$;

create or replace function public.create_meeting_action_item(target_meeting_id uuid, action_title text, action_assigned_to uuid default null, action_due_date date default null)
returns public.meeting_action_items
language plpgsql security definer set search_path = public
as $$
declare meeting_row public.meetings%rowtype; actor public.profiles%rowtype; action_item public.meeting_action_items%rowtype; action_task public.tasks%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  select * into meeting_row from public.meetings where id = target_meeting_id;
  if not found or not public.is_company_manager(meeting_row.company_id) then raise exception 'Manager or admin permission required'; end if;
  if btrim(action_title) = '' then raise exception 'Action item title is required'; end if;
  if action_assigned_to is not null and not exists (select 1 from public.profiles where id = action_assigned_to and company_id = meeting_row.company_id and is_active) then raise exception 'Invalid assignee'; end if;
  insert into public.tasks(company_id, department_id, team_id, title, status, priority, assigned_to, created_by, due_date, task_type, status_changed_at)
  values (meeting_row.company_id, meeting_row.department_id, meeting_row.team_id, btrim(action_title), case when action_assigned_to is null then 'pending'::task_status else 'assigned'::task_status end, 'medium'::task_priority, action_assigned_to, actor.id, action_due_date, 'one_time', now()) returning * into action_task;
  insert into public.meeting_action_items(meeting_id, company_id, title, assigned_to, due_date, task_id, created_by) values (meeting_row.id, meeting_row.company_id, btrim(action_title), action_assigned_to, action_due_date, action_task.id, actor.id) returning * into action_item;
  insert into public.task_activity(company_id, task_id, user_id, action, details) values (meeting_row.company_id, action_task.id, actor.id, 'meeting_action_item_created', jsonb_build_object('meeting_id', meeting_row.id));
  return action_item;
end; $$;

grant select, update on public.notifications to authenticated;
grant select on public.task_escalations, public.meetings, public.meeting_attendees, public.meeting_decisions, public.meeting_action_items to authenticated;
grant insert, update, delete on public.meetings, public.meeting_attendees, public.meeting_decisions to authenticated;
grant execute on function public.create_task_escalation(uuid, text, text) to authenticated;
grant execute on function public.resolve_task_escalation(uuid, text) to authenticated;
grant execute on function public.create_meeting_action_item(uuid, text, uuid, date) to authenticated;

commit;
