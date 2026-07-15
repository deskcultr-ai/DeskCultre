begin;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (name),
  unique (slug)
);

create table if not exists public.company_brands (
  company_id uuid not null references public.companies(id) on delete cascade,
  brand_id uuid not null references public.brands(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (company_id, brand_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  slug text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, name),
  unique (company_id, slug)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.task_tags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  color text not null default '#06b6d4' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.task_tag_assignments (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id uuid not null references public.task_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, tag_id)
);

alter table public.tasks
  add column if not exists brand_id uuid references public.brands(id) on delete set null,
  add column if not exists channel_id uuid references public.channels(id) on delete set null,
  add column if not exists team_id uuid references public.teams(id) on delete set null,
  add column if not exists parent_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists start_date date,
  add column if not exists recurrence_start_date date,
  add column if not exists recurrence_end_date date,
  add column if not exists next_recurrence_on date,
  add column if not exists recurrence_active boolean not null default true;

create index if not exists tasks_brand_id_idx on public.tasks(brand_id);
create index if not exists tasks_channel_id_idx on public.tasks(channel_id);
create index if not exists tasks_team_id_idx on public.tasks(team_id);
create index if not exists tasks_recurrence_idx on public.tasks(task_type, next_recurrence_on)
  where task_type = 'daily_recurring' and recurrence_active;

-- Validate attachment references even if a client bypasses the application UI.
create or replace function public.guard_task_file_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.tasks where id = new.task_id and company_id = new.company_id
  ) then
    raise exception 'File company must match task company';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_task_file_tenant on public.task_files;
create trigger guard_task_file_tenant
before insert or update of task_id, company_id on public.task_files
for each row execute function public.guard_task_file_tenant();

alter table public.brands enable row level security;
alter table public.company_brands enable row level security;
alter table public.channels enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.task_tags enable row level security;
alter table public.task_tag_assignments enable row level security;

drop policy if exists brands_select on public.brands;
create policy brands_select on public.brands for select
using (exists (select 1 from public.company_brands cb where cb.brand_id = id and cb.company_id = public.current_company_id()));

drop policy if exists company_brands_select on public.company_brands;
create policy company_brands_select on public.company_brands for select
using (company_id = public.current_company_id());
drop policy if exists company_brands_manage on public.company_brands;
create policy company_brands_manage on public.company_brands for all
using (public.is_company_manager(company_id))
with check (public.is_company_manager(company_id));

drop policy if exists channels_select on public.channels;
create policy channels_select on public.channels for select using (company_id = public.current_company_id());
drop policy if exists channels_manage on public.channels;
create policy channels_manage on public.channels for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select using (company_id = public.current_company_id());
drop policy if exists teams_manage on public.teams;
create policy teams_manage on public.teams for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members for select
using (exists (select 1 from public.teams t where t.id = team_id and t.company_id = public.current_company_id()));
drop policy if exists team_members_manage on public.team_members;
create policy team_members_manage on public.team_members for all
using (exists (select 1 from public.teams t where t.id = team_id and public.is_company_manager(t.company_id)))
with check (exists (select 1 from public.teams t where t.id = team_id and public.is_company_manager(t.company_id)));

drop policy if exists task_tags_select on public.task_tags;
create policy task_tags_select on public.task_tags for select using (company_id = public.current_company_id());
drop policy if exists task_tags_manage on public.task_tags;
create policy task_tags_manage on public.task_tags for all using (public.is_company_manager(company_id)) with check (public.is_company_manager(company_id));

drop policy if exists task_tag_assignments_select on public.task_tag_assignments;
create policy task_tag_assignments_select on public.task_tag_assignments for select
using (exists (select 1 from public.tasks t where t.id = task_id and t.company_id = public.current_company_id()));

create or replace function public.update_company_settings(company_name text, company_slug text default null)
returns public.companies
language plpgsql
security definer
set search_path = public
as $$
declare updated_company public.companies%rowtype; target_company_id uuid;
begin
  target_company_id := public.current_company_id();
  if target_company_id is null or not public.is_company_manager(target_company_id) then raise exception 'Manager or admin permission required'; end if;
  if btrim(company_name) = '' then raise exception 'Company name is required'; end if;
  update public.companies set name = btrim(company_name), slug = nullif(lower(btrim(company_slug)), '')
  where id = target_company_id returning * into updated_company;
  return updated_company;
end;
$$;

create or replace function public.create_or_link_brand(brand_name text, brand_slug text default null)
returns public.brands
language plpgsql
security definer
set search_path = public
as $$
declare target_company_id uuid; managed_brand public.brands%rowtype;
begin
  target_company_id := public.current_company_id();
  if target_company_id is null or not public.is_company_manager(target_company_id) then raise exception 'Manager or admin permission required'; end if;
  if btrim(brand_name) = '' then raise exception 'Brand name is required'; end if;
  select * into managed_brand from public.brands where lower(name) = lower(btrim(brand_name));
  if not found then
    insert into public.brands(name, slug) values (btrim(brand_name), nullif(lower(btrim(brand_slug)), '')) returning * into managed_brand;
  end if;
  insert into public.company_brands(company_id, brand_id) values (target_company_id, managed_brand.id) on conflict do nothing;
  return managed_brand;
end;
$$;

create or replace function public.create_task_secure_v2(
  task_title text,
  task_description text,
  task_department_id uuid,
  task_assigned_to uuid,
  task_priority text,
  task_due_date date,
  requested_task_type text default 'one_time',
  task_brand_id uuid default null,
  task_channel_id uuid default null,
  task_team_id uuid default null,
  requested_start_date date default null,
  requested_recurrence_end_date date default null,
  requested_tag_ids uuid[] default array[]::uuid[]
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare actor public.profiles%rowtype; created_task public.tasks%rowtype; recurrence_start date;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found then raise exception 'Profile setup is required'; end if;
  if coalesce(actor.role::text, '') not in ('admin', 'owner', 'manager') and not coalesce(actor.can_create_tasks, false) then raise exception 'You do not have permission to create tasks'; end if;
  if btrim(task_title) = '' then raise exception 'Title is required'; end if;
  if task_priority not in ('low', 'medium', 'high', 'urgent') then raise exception 'Invalid priority'; end if;
  if requested_task_type not in ('one_time', 'daily_recurring', 'continuous') then raise exception 'Invalid task type'; end if;
  if task_assigned_to is not null and not exists (select 1 from public.profiles where id = task_assigned_to and company_id = actor.company_id and is_active) then raise exception 'Invalid assignee'; end if;
  if task_department_id is not null and not exists (select 1 from public.departments where id = task_department_id and company_id = actor.company_id) then raise exception 'Invalid department'; end if;
  if task_brand_id is not null and not exists (select 1 from public.company_brands where company_id = actor.company_id and brand_id = task_brand_id) then raise exception 'Brand is not enabled for this company'; end if;
  if task_channel_id is not null and not exists (select 1 from public.channels where id = task_channel_id and company_id = actor.company_id and is_active) then raise exception 'Invalid channel'; end if;
  if task_team_id is not null and not exists (select 1 from public.teams where id = task_team_id and company_id = actor.company_id and is_active) then raise exception 'Invalid team'; end if;
  if coalesce(array_length(requested_tag_ids, 1), 0) > 0 and exists (select 1 from unnest(requested_tag_ids) tag_id where not exists (select 1 from public.task_tags where id = tag_id and company_id = actor.company_id)) then raise exception 'Invalid tag'; end if;
  if requested_task_type = 'daily_recurring' and requested_recurrence_end_date is not null and requested_recurrence_end_date < coalesce(requested_start_date, task_due_date, current_date) then raise exception 'Recurrence end date must not precede its start date'; end if;

  recurrence_start := coalesce(requested_start_date, task_due_date, current_date);
  insert into public.tasks(
    company_id, title, description, department_id, assigned_to, priority, due_date, created_by, status, task_type,
    status_changed_at, brand_id, channel_id, team_id, start_date, recurrence_start_date, recurrence_end_date, next_recurrence_on
  ) values (
    actor.company_id, btrim(task_title), nullif(btrim(task_description), ''), task_department_id, task_assigned_to,
    task_priority::task_priority, task_due_date, actor.id, case when task_assigned_to is null then 'pending'::task_status else 'assigned'::task_status end,
    requested_task_type, now(), task_brand_id, task_channel_id, task_team_id, requested_start_date,
    case when requested_task_type = 'daily_recurring' then recurrence_start else null end,
    case when requested_task_type = 'daily_recurring' then requested_recurrence_end_date else null end,
    case when requested_task_type = 'daily_recurring' then recurrence_start else null end
  ) returning * into created_task;

  insert into public.task_tag_assignments(task_id, tag_id)
  select created_task.id, tag_id from unnest(requested_tag_ids) tag_id;
  insert into public.task_activity(company_id, task_id, user_id, action, details)
  values (actor.company_id, created_task.id, actor.id, 'task_created', jsonb_build_object('status', created_task.status, 'task_type', requested_task_type));
  return created_task;
end;
$$;

create or replace function public.create_next_daily_occurrence(template_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare template_task public.tasks%rowtype; actor_company uuid; occurrence public.tasks%rowtype; occurrence_date date;
begin
  actor_company := public.current_company_id();
  if actor_company is null or not public.is_company_manager(actor_company) then raise exception 'Manager or admin permission required'; end if;
  select * into template_task from public.tasks where id = template_task_id for update;
  if not found or template_task.company_id <> actor_company or template_task.task_type <> 'daily_recurring' or not template_task.recurrence_active then raise exception 'Active daily task template not found'; end if;
  occurrence_date := greatest(coalesce(template_task.next_recurrence_on, current_date), current_date);
  if template_task.recurrence_end_date is not null and occurrence_date > template_task.recurrence_end_date then raise exception 'This recurrence has ended'; end if;
  if exists (select 1 from public.tasks where parent_task_id = template_task.id and due_date = occurrence_date) then raise exception 'An occurrence already exists for this day'; end if;
  insert into public.tasks(company_id, department_id, title, description, status, priority, assigned_to, created_by, due_date, task_type, status_changed_at, brand_id, channel_id, team_id, parent_task_id, start_date)
  values (template_task.company_id, template_task.department_id, template_task.title, template_task.description,
    case when template_task.assigned_to is null then 'pending'::task_status else 'assigned'::task_status end, template_task.priority,
    template_task.assigned_to, auth.uid(), occurrence_date, 'one_time', now(), template_task.brand_id, template_task.channel_id,
    template_task.team_id, template_task.id, occurrence_date)
  returning * into occurrence;
  insert into public.task_tag_assignments(task_id, tag_id) select occurrence.id, tag_id from public.task_tag_assignments where task_id = template_task.id;
  update public.tasks set next_recurrence_on = occurrence_date + 1 where id = template_task.id;
  insert into public.task_activity(company_id, task_id, user_id, action, details)
  values (actor_company, occurrence.id, auth.uid(), 'daily_occurrence_created', jsonb_build_object('template_task_id', template_task.id, 'date', occurrence_date));
  return occurrence;
end;
$$;

create or replace function public.register_task_file(target_task_id uuid, uploaded_file_name text, uploaded_file_path text, uploaded_file_type text default null)
returns public.task_files
language plpgsql
security definer
set search_path = public
as $$
declare actor public.profiles%rowtype; target_task public.tasks%rowtype; created_file public.task_files%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  select * into target_task from public.tasks where id = target_task_id;
  if not found or target_task.company_id <> actor.company_id then raise exception 'Task not found'; end if;
  if actor.role::text not in ('admin', 'owner', 'manager') and target_task.assigned_to is distinct from actor.id then raise exception 'Only the assignee or a manager can attach files'; end if;
  if btrim(uploaded_file_name) = '' or btrim(uploaded_file_path) = '' then raise exception 'File name and path are required'; end if;
  if split_part(uploaded_file_path, '/', 1) <> actor.company_id::text then raise exception 'Invalid file path'; end if;
  insert into public.task_files(task_id, company_id, uploaded_by, file_name, file_url, file_type)
  values (target_task.id, actor.company_id, actor.id, btrim(uploaded_file_name), btrim(uploaded_file_path), nullif(btrim(uploaded_file_type), ''))
  returning * into created_file;
  insert into public.task_activity(company_id, task_id, user_id, action, details)
  values (actor.company_id, target_task.id, actor.id, 'file_attached', jsonb_build_object('file_name', uploaded_file_name));
  return created_file;
end;
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('task-files', 'task-files', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists task_files_storage_select on storage.objects;
create policy task_files_storage_select on storage.objects for select to authenticated
using (bucket_id = 'task-files' and (storage.foldername(name))[1] = public.current_company_id()::text);
drop policy if exists task_files_storage_insert on storage.objects;
create policy task_files_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'task-files' and (storage.foldername(name))[1] = public.current_company_id()::text);

grant select, insert, update, delete on public.brands, public.company_brands, public.channels, public.teams, public.team_members, public.task_tags, public.task_tag_assignments to authenticated;
grant execute on function public.update_company_settings(text, text) to authenticated;
grant execute on function public.create_or_link_brand(text, text) to authenticated;
grant execute on function public.create_task_secure_v2(text, text, uuid, uuid, text, date, text, uuid, uuid, uuid, date, date, uuid[]) to authenticated;
grant execute on function public.create_next_daily_occurrence(uuid) to authenticated;
grant execute on function public.register_task_file(uuid, text, text, text) to authenticated;

commit;
