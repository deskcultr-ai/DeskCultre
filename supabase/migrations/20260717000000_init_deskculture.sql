-- ============================================================================
-- DeskCulture — initial schema
--
-- Fresh, self-contained baseline. Replaces the legacy migration history
-- (archived in supabase/legacy_migrations/), which was incomplete: it altered
-- base tables (profiles/companies/tasks/departments) that were never created
-- by any migration.
--
-- Multi-tenant: every row belongs to a company. RLS isolates by company_id
-- via public.current_company_id(), a SECURITY DEFINER helper (which bypasses
-- RLS internally and therefore cannot recurse through profiles' own policy).
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- ENUMS
-- ============================================================================
create type user_role as enum ('super_admin', 'admin', 'manager', 'member', 'guest');
create type profile_status as enum ('pending', 'active', 'suspended');
create type task_status as enum ('todo', 'in_progress', 'review', 'completed', 'on_hold', 'overdue', 'cancelled');
create type task_priority as enum ('low', 'medium', 'high', 'urgent');
create type request_status as enum ('pending', 'accepted', 'in_progress', 'completed', 'rejected');
create type attendance_status as enum ('present', 'absent', 'on_leave', 'half_day');
create type leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type meeting_status as enum ('scheduled', 'live', 'completed', 'cancelled');
create type workload_level as enum ('low', 'medium', 'high');

-- ============================================================================
-- CORE TENANCY
-- ============================================================================
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  logo_url text,
  storage_limit_bytes bigint not null default 536870912000, -- 500 GB
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text,
  workload workload_level not null default 'medium',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  email text,
  first_name text,
  last_name text,
  full_name text,
  phone_number text,
  avatar_url text,
  job_title text,
  role user_role not null default 'member',
  status profile_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_company_idx on public.profiles (company_id);
create index profiles_department_idx on public.profiles (department_id);

-- ============================================================================
-- HELPERS (SECURITY DEFINER — bypass RLS to avoid recursive policy lookups)
-- ============================================================================
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('super_admin', 'admin', 'manager') from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role in ('super_admin', 'admin') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- create a pending profile whenever an auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, phone_number, full_name)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone_number',
    nullif(trim(
      coalesce(new.raw_user_meta_data ->> 'first_name', '') || ' ' ||
      coalesce(new.raw_user_meta_data ->> 'last_name', '')
    ), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- WORKSPACES
-- ============================================================================
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text,
  color text,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_company_idx on public.workspaces (company_id);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);

-- ============================================================================
-- TASKS
-- ============================================================================
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  department_id uuid references public.departments (id) on delete set null,
  title text not null,
  description text,
  status task_status not null default 'todo',
  priority task_priority not null default 'medium',
  assignee_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_company_idx on public.tasks (company_id);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_status_idx on public.tasks (company_id, status);
create index tasks_due_idx on public.tasks (company_id, due_date);

create table public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  label text not null,
  is_done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- REQUESTS (cross-team asks: "Need product images", "Stock availability"…)
-- ============================================================================
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  description text,
  requester_id uuid references public.profiles (id) on delete set null,
  from_department_id uuid references public.departments (id) on delete set null,
  to_department_id uuid references public.departments (id) on delete set null,
  status request_status not null default 'pending',
  priority task_priority not null default 'medium',
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index requests_company_idx on public.requests (company_id);
create index requests_status_idx on public.requests (company_id, status);

-- ============================================================================
-- MEETINGS
-- ============================================================================
create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  title text not null,
  description text,
  host_id uuid references public.profiles (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status meeting_status not null default 'scheduled',
  room_id text,
  join_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meetings_company_starts_idx on public.meetings (company_id, starts_at);

create table public.meeting_attendees (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  has_accepted boolean,
  primary key (meeting_id, profile_id)
);

-- ============================================================================
-- ATTENDANCE + LEAVE
-- ============================================================================
create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  work_date date not null default current_date,
  check_in_at timestamptz,
  check_out_at timestamptz,
  status attendance_status not null default 'present',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, work_date)
);
create index attendance_company_date_idx on public.attendance_sessions (company_id, work_date);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  reason text,
  status leave_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leave_company_status_idx on public.leave_requests (company_id, status);

-- ============================================================================
-- ANNOUNCEMENTS + ACTIVITY + NOTIFICATIONS
-- ============================================================================
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  department_id uuid references public.departments (id) on delete set null,
  author_id uuid references public.profiles (id) on delete set null,
  title text not null,
  body text,
  created_at timestamptz not null default now()
);
create index announcements_company_idx on public.announcements (company_id, created_at desc);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  summary text,
  created_at timestamptz not null default now()
);
create index activity_company_idx on public.activity_log (company_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_profile_idx on public.notifications (profile_id, created_at desc);

-- ============================================================================
-- CHAT
-- ============================================================================
create table public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  name text,
  is_direct boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index chat_channels_company_idx on public.chat_channels (company_id);

create table public.chat_channel_members (
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  primary key (channel_id, profile_id)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.chat_channels (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  body text,
  attachment_url text,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index chat_messages_channel_idx on public.chat_messages (channel_id, created_at desc);

-- channel membership check, SECURITY DEFINER so chat policies don't recurse
create or replace function public.is_channel_member(target_channel uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_channel_members
    where channel_id = target_channel and profile_id = auth.uid()
  );
$$;

-- ============================================================================
-- DRIVE
-- ============================================================================
create table public.drive_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  parent_id uuid references public.drive_folders (id) on delete cascade,
  name text not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index drive_folders_company_idx on public.drive_folders (company_id);

create table public.drive_files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  folder_id uuid references public.drive_folders (id) on delete set null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0,
  owner_id uuid references public.profiles (id) on delete set null,
  is_starred boolean not null default false,
  is_trashed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index drive_files_company_idx on public.drive_files (company_id);
create index drive_files_folder_idx on public.drive_files (folder_id);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'departments', 'profiles', 'workspaces', 'tasks', 'requests',
    'meetings', 'attendance_sessions', 'leave_requests', 'drive_files'
  ]
  loop
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t
    );
  end loop;
end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.companies             enable row level security;
alter table public.departments           enable row level security;
alter table public.profiles              enable row level security;
alter table public.workspaces            enable row level security;
alter table public.workspace_members     enable row level security;
alter table public.tasks                 enable row level security;
alter table public.task_checklist_items  enable row level security;
alter table public.task_comments         enable row level security;
alter table public.requests              enable row level security;
alter table public.meetings              enable row level security;
alter table public.meeting_attendees     enable row level security;
alter table public.attendance_sessions   enable row level security;
alter table public.leave_requests        enable row level security;
alter table public.announcements         enable row level security;
alter table public.activity_log          enable row level security;
alter table public.notifications         enable row level security;
alter table public.chat_channels         enable row level security;
alter table public.chat_channel_members  enable row level security;
alter table public.chat_messages         enable row level security;
alter table public.drive_folders         enable row level security;
alter table public.drive_files           enable row level security;

-- Companies: you can see your own company; only admins may update it.
create policy companies_select on public.companies
  for select using (id = public.current_company_id());
create policy companies_update on public.companies
  for update using (id = public.current_company_id() and public.is_admin());

-- Profiles: see colleagues; update yourself; admins manage anyone in company.
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or company_id = public.current_company_id());
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_update on public.profiles
  for update using (company_id = public.current_company_id() and public.is_admin());
create policy profiles_admin_insert on public.profiles
  for insert with check (company_id = public.current_company_id() and public.is_admin());

-- Departments: everyone in company reads; admins write.
create policy departments_select on public.departments
  for select using (company_id = public.current_company_id());
create policy departments_admin_write on public.departments
  for all using (company_id = public.current_company_id() and public.is_admin())
  with check (company_id = public.current_company_id() and public.is_admin());

-- Generic company-scoped read + member write.
-- (Tables where any active company member may create/edit records.)
create policy workspaces_select on public.workspaces
  for select using (company_id = public.current_company_id());
create policy workspaces_write on public.workspaces
  for all using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id() and public.is_manager());

create policy workspace_members_select on public.workspace_members
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.company_id = public.current_company_id())
  );
create policy workspace_members_write on public.workspace_members
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.company_id = public.current_company_id())
    and public.is_manager()
  )
  with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.company_id = public.current_company_id())
    and public.is_manager()
  );

create policy tasks_select on public.tasks
  for select using (company_id = public.current_company_id());
create policy tasks_write on public.tasks
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy task_checklist_all on public.task_checklist_items
  for all using (
    exists (select 1 from public.tasks t
            where t.id = task_id and t.company_id = public.current_company_id())
  )
  with check (
    exists (select 1 from public.tasks t
            where t.id = task_id and t.company_id = public.current_company_id())
  );

create policy task_comments_select on public.task_comments
  for select using (
    exists (select 1 from public.tasks t
            where t.id = task_id and t.company_id = public.current_company_id())
  );
create policy task_comments_insert on public.task_comments
  for insert with check (
    author_id = auth.uid()
    and exists (select 1 from public.tasks t
                where t.id = task_id and t.company_id = public.current_company_id())
  );

create policy requests_select on public.requests
  for select using (company_id = public.current_company_id());
create policy requests_write on public.requests
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy meetings_select on public.meetings
  for select using (company_id = public.current_company_id());
create policy meetings_write on public.meetings
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy meeting_attendees_all on public.meeting_attendees
  for all using (
    exists (select 1 from public.meetings m
            where m.id = meeting_id and m.company_id = public.current_company_id())
  )
  with check (
    exists (select 1 from public.meetings m
            where m.id = meeting_id and m.company_id = public.current_company_id())
  );

-- Attendance: you manage your own; managers see the whole company.
create policy attendance_select on public.attendance_sessions
  for select using (
    profile_id = auth.uid()
    or (company_id = public.current_company_id() and public.is_manager())
  );
create policy attendance_write_own on public.attendance_sessions
  for all using (profile_id = auth.uid())
  with check (profile_id = auth.uid() and company_id = public.current_company_id());
create policy attendance_manager_write on public.attendance_sessions
  for all using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id() and public.is_manager());

-- Leave: own requests, managers review all.
create policy leave_select on public.leave_requests
  for select using (
    profile_id = auth.uid()
    or (company_id = public.current_company_id() and public.is_manager())
  );
create policy leave_insert_own on public.leave_requests
  for insert with check (profile_id = auth.uid() and company_id = public.current_company_id());
create policy leave_manager_write on public.leave_requests
  for all using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id() and public.is_manager());

create policy announcements_select on public.announcements
  for select using (company_id = public.current_company_id());
create policy announcements_write on public.announcements
  for all using (company_id = public.current_company_id() and public.is_manager())
  with check (company_id = public.current_company_id() and public.is_manager());

-- Activity log: read within company; append-only for members.
create policy activity_select on public.activity_log
  for select using (company_id = public.current_company_id());
create policy activity_insert on public.activity_log
  for insert with check (company_id = public.current_company_id());

-- Notifications: strictly your own.
create policy notifications_select on public.notifications
  for select using (profile_id = auth.uid());
create policy notifications_update on public.notifications
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Chat: only channel members can read/post.
create policy chat_channels_select on public.chat_channels
  for select using (company_id = public.current_company_id() and public.is_channel_member(id));
create policy chat_channels_insert on public.chat_channels
  for insert with check (company_id = public.current_company_id());

create policy chat_members_select on public.chat_channel_members
  for select using (public.is_channel_member(channel_id));
create policy chat_members_write on public.chat_channel_members
  for all using (profile_id = auth.uid() or public.is_channel_member(channel_id))
  with check (public.is_channel_member(channel_id) or profile_id = auth.uid());

create policy chat_messages_select on public.chat_messages
  for select using (public.is_channel_member(channel_id));
create policy chat_messages_insert on public.chat_messages
  for insert with check (sender_id = auth.uid() and public.is_channel_member(channel_id));
create policy chat_messages_update_own on public.chat_messages
  for update using (sender_id = auth.uid()) with check (sender_id = auth.uid());

-- Drive
create policy drive_folders_select on public.drive_folders
  for select using (company_id = public.current_company_id());
create policy drive_folders_write on public.drive_folders
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

create policy drive_files_select on public.drive_files
  for select using (company_id = public.current_company_id());
create policy drive_files_write on public.drive_files
  for all using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- ============================================================================
-- STORAGE (Drive bucket)
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('drive', 'drive', false)
on conflict (id) do nothing;

create policy "drive read for authenticated"
  on storage.objects for select
  using (bucket_id = 'drive' and auth.role() = 'authenticated');

create policy "drive upload for authenticated"
  on storage.objects for insert
  with check (bucket_id = 'drive' and auth.role() = 'authenticated');

create policy "drive update own"
  on storage.objects for update
  using (bucket_id = 'drive' and owner = auth.uid());

create policy "drive delete own"
  on storage.objects for delete
  using (bucket_id = 'drive' and owner = auth.uid());
