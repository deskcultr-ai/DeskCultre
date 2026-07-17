-- ============================================================================
-- Self-serve organization onboarding + role model
--
-- bootstrap_company() was a bootstrap hack: it required SQL-editor access and
-- minted a `super_admin`. That cannot work for customers signing up from the
-- market. This adds the real flows:
--
--   create_company(name)      -> caller becomes `admin` of a NEW org (active)
--   join_company(join_code)   -> caller attaches to an EXISTING org (pending)
--   approve_member(id, role)  -> org admin activates a pending member
--
-- Role model:
--   super_admin  platform staff (us). Never granted by these functions.
--   admin        the customer's org owner/admin. Scoped to their company.
--   manager      department manager.
--   member       employee.
--   guest        limited access.
-- ============================================================================

-- Human-friendly code employees use to join an org.
alter table public.companies
  add column if not exists join_code text unique;

create or replace function public.gen_join_code()
returns text
language sql
volatile
as $$
  select upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));
$$;

-- Backfill existing companies
update public.companies set join_code = public.gen_join_code() where join_code is null;

alter table public.companies
  alter column join_code set default public.gen_join_code();

-- ----------------------------------------------------------------------------
-- Create a new organization. Caller becomes its admin.
-- ----------------------------------------------------------------------------
create or replace function public.create_company(company_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_company_id uuid;
  existing_company uuid;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(company_name), '') is null then
    raise exception 'Organization name is required';
  end if;

  select company_id into existing_company from public.profiles where id = caller;
  if existing_company is not null then
    raise exception 'You already belong to an organization';
  end if;

  insert into public.companies (name, slug, join_code)
  values (
    trim(company_name),
    lower(regexp_replace(trim(company_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
      substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6),
    public.gen_join_code()
  )
  returning id into new_company_id;

  -- `admin`, deliberately not `super_admin`: super_admin is a platform role.
  update public.profiles
     set company_id = new_company_id,
         role = 'admin',
         status = 'active'
   where id = caller;

  insert into public.activity_log (company_id, actor_id, action, summary)
  values (new_company_id, caller, 'company.created', 'Organization created');

  return new_company_id;
end;
$$;

grant execute on function public.create_company(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Join an existing organization with its join code. Lands as pending/member;
-- an admin must approve. Cannot self-assign a role or activate.
-- ----------------------------------------------------------------------------
create or replace function public.join_company(code text)
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

  select id into target_company
    from public.companies
   where join_code = upper(trim(code));

  if target_company is null then
    raise exception 'That join code is not valid';
  end if;

  update public.profiles
     set company_id = target_company,
         role = 'member',
         status = 'pending'
   where id = caller;

  insert into public.activity_log (company_id, actor_id, action, summary)
  values (target_company, caller, 'member.requested', 'Requested to join the organization');

  return target_company;
end;
$$;

grant execute on function public.join_company(text) to authenticated;

-- ----------------------------------------------------------------------------
-- approve_member: now also handles members who joined via a code (they already
-- have company_id set) and records activity. Admin-only, own-company only.
-- Cannot grant super_admin.
-- ----------------------------------------------------------------------------
create or replace function public.approve_member(target_profile uuid, assigned_role user_role default 'member')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_company uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve members';
  end if;

  if assigned_role = 'super_admin' then
    raise exception 'super_admin is a platform role and cannot be granted here';
  end if;

  select company_id into caller_company from public.profiles where id = auth.uid();
  if caller_company is null then
    raise exception 'Admin has no organization assigned';
  end if;

  update public.profiles
     set company_id = caller_company,
         role = assigned_role,
         status = 'active'
   where id = target_profile
     and status = 'pending'
     and (company_id = caller_company or company_id is null);

  if not found then
    raise exception 'No pending profile found for % in your organization', target_profile;
  end if;

  insert into public.activity_log (company_id, actor_id, action, entity_id, summary)
  values (caller_company, auth.uid(), 'member.approved', target_profile, 'Member approved');
end;
$$;

grant execute on function public.approve_member(uuid, user_role) to authenticated;

-- ----------------------------------------------------------------------------
-- Pending members have company_id set but status='pending'. current_company_id()
-- would otherwise expose company data to them before approval, so scope it to
-- active profiles only. Admins still see pending rows via profiles' own policy.
-- ----------------------------------------------------------------------------
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles
   where id = auth.uid() and status = 'active';
$$;

-- Admins must still be able to see pending profiles awaiting approval.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (
    id = auth.uid()
    or company_id = public.current_company_id()
    or (
      status = 'pending'
      and public.is_admin()
      and company_id = (select company_id from public.profiles where id = auth.uid())
    )
  );
