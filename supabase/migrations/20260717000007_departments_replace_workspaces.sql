-- ============================================================================
-- Departments replace workspaces
--
-- The org structure is departments: an admin creates departments, assigns
-- roles/permissions, and routes tasks, meetings, files, chat and requests
-- through them. Workspaces were a parallel grouping with no owner in this
-- model, so they are removed rather than left half-wired.
--
-- Everything that pointed at a workspace now points at a department. tasks
-- already had department_id, so its workspace_id is simply dropped.
--
-- Also adds:
--   companies.employee_count_range  - captured right after org creation
--   lookup_org_by_code()            - lets a joiner see the org + its
--                                     departments BEFORE they belong to it
--   join_company(code, department)  - joiner picks their department up front
-- ============================================================================

-- 1. Point the remaining tables at departments.
alter table public.meetings       add column if not exists department_id uuid references public.departments (id) on delete set null;
alter table public.chat_channels  add column if not exists department_id uuid references public.departments (id) on delete set null;
alter table public.drive_folders  add column if not exists department_id uuid references public.departments (id) on delete set null;
alter table public.drive_files    add column if not exists department_id uuid references public.departments (id) on delete set null;

create index if not exists meetings_department_idx      on public.meetings (department_id);
create index if not exists chat_channels_department_idx on public.chat_channels (department_id);
create index if not exists drive_files_department_idx   on public.drive_files (department_id);

-- 2. Drop the workspace linkage.
alter table public.tasks          drop column if exists workspace_id;
alter table public.meetings       drop column if exists workspace_id;
alter table public.chat_channels  drop column if exists workspace_id;
alter table public.drive_folders  drop column if exists workspace_id;
alter table public.drive_files    drop column if exists workspace_id;

drop table if exists public.workspace_members;
drop table if exists public.workspaces cascade;

-- 3. Org size, captured in onboarding.
alter table public.companies add column if not exists employee_count_range text;

-- 4. A joiner is not a member yet, so RLS hides the org and its departments.
--    This SECURITY DEFINER lookup exposes only what the join screen needs:
--    the org name and its department list, keyed by a code they already hold.
create or replace function public.lookup_org_by_code(code text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'company_id', c.id,
    'company_name', c.name,
    'departments', coalesce(
      (select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
         from public.departments d
        where d.company_id = c.id),
      '[]'::jsonb
    )
  )
  from public.companies c
  where c.join_code = upper(trim(code));
$$;

grant execute on function public.lookup_org_by_code(text) to authenticated;

-- 5. Joining now records the chosen department. Still lands pending: picking a
--    department is not the same as being approved into it.
drop function if exists public.join_company(text);

create or replace function public.join_company(code text, target_department uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_company uuid;
  existing_company uuid;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select company_id into existing_company from public.profiles where id = caller;
  if existing_company is not null then
    raise exception 'You already belong to an organization';
  end if;

  select id into target_company from public.companies where join_code = upper(trim(code));
  if target_company is null then
    raise exception 'That join code is not valid';
  end if;

  -- A department from another org would leak cross-tenant data.
  if target_department is not null
     and not exists (
       select 1 from public.departments
        where id = target_department and company_id = target_company
     ) then
    raise exception 'That department does not belong to this organization';
  end if;

  perform set_config('app.privileged_profile_write', 'on', true);

  update public.profiles
     set company_id = target_company,
         department_id = target_department,
         role = 'member',
         status = 'pending'
   where id = caller;

  perform set_config('app.privileged_profile_write', 'off', true);

  insert into public.activity_log (company_id, actor_id, action, summary)
  values (target_company, caller, 'member.requested', 'Requested to join the organization');

  return target_company;
end;
$$;

grant execute on function public.join_company(text, uuid) to authenticated;
