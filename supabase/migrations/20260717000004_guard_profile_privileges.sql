-- ============================================================================
-- Close two privilege-escalation holes in profiles.
--
-- 1. profiles_update_own allowed `using (id = auth.uid())` with no column
--    restriction, so ANY member could run
--        update profiles set role = 'admin' where id = <self>
--    and promote themselves. RLS gates *rows*, not *columns*.
--
-- 2. profiles_admin_update had no WITH CHECK on role, so a customer's org admin
--    could set role = 'super_admin' and escalate to the platform role.
--
-- Postgres RLS can't express "these columns are immutable", so a BEFORE UPDATE
-- trigger enforces it. The onboarding RPCs are SECURITY DEFINER but auth.uid()
-- is still the caller there, so they mark themselves privileged with a
-- transaction-local flag that the trigger honours.
-- ============================================================================

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  -- Trusted contexts: service_role / SQL editor (no auth.uid()), and the
  -- onboarding RPCs which set this flag for the current transaction.
  if caller is null or coalesce(current_setting('app.privileged_profile_write', true), '') = 'on' then
    return new;
  end if;

  -- super_admin is a platform role: never grantable from the app.
  if new.role = 'super_admin' and old.role is distinct from 'super_admin' then
    raise exception 'super_admin is a platform role and cannot be granted from the app';
  end if;

  -- role / status / company_id are privileged columns.
  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.company_id is distinct from old.company_id then

    if not public.is_admin() then
      raise exception 'Only admins can change role, status or organization';
    end if;

    -- An admin must not change their own role (no self-escalation, no
    -- accidentally locking the org out of its last admin).
    if new.id = caller and new.role is distinct from old.role then
      raise exception 'You cannot change your own role';
    end if;

    -- Admins may only act inside their own organization.
    if old.company_id is not null
       and old.company_id is distinct from (select company_id from public.profiles where id = caller) then
      raise exception 'You can only manage members of your own organization';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_profile_privileges on public.profiles;
create trigger guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ----------------------------------------------------------------------------
-- Onboarding RPCs mark themselves privileged so the trigger lets their
-- legitimate role/status/company_id writes through.
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

  perform set_config('app.privileged_profile_write', 'on', true);

  update public.profiles
     set company_id = new_company_id,
         role = 'admin',
         status = 'active'
   where id = caller;

  perform set_config('app.privileged_profile_write', 'off', true);

  insert into public.activity_log (company_id, actor_id, action, summary)
  values (new_company_id, caller, 'company.created', 'Organization created');

  return new_company_id;
end;
$$;

grant execute on function public.create_company(text) to authenticated;

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

  select id into target_company from public.companies where join_code = upper(trim(code));
  if target_company is null then
    raise exception 'That join code is not valid';
  end if;

  perform set_config('app.privileged_profile_write', 'on', true);

  update public.profiles
     set company_id = target_company,
         role = 'member',
         status = 'pending'
   where id = caller;

  perform set_config('app.privileged_profile_write', 'off', true);

  insert into public.activity_log (company_id, actor_id, action, summary)
  values (target_company, caller, 'member.requested', 'Requested to join the organization');

  return target_company;
end;
$$;

grant execute on function public.join_company(text) to authenticated;

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

  perform set_config('app.privileged_profile_write', 'on', true);

  update public.profiles
     set company_id = caller_company,
         role = assigned_role,
         status = 'active'
   where id = target_profile
     and status = 'pending'
     and (company_id = caller_company or company_id is null);

  perform set_config('app.privileged_profile_write', 'off', true);

  if not found then
    raise exception 'No pending profile found for % in your organization', target_profile;
  end if;

  insert into public.activity_log (company_id, actor_id, action, entity_id, summary)
  values (caller_company, auth.uid(), 'member.approved', target_profile, 'Member approved');
end;
$$;

grant execute on function public.approve_member(uuid, user_role) to authenticated;

-- ----------------------------------------------------------------------------
-- Remove a pending/active member from the organization (admin only).
-- ----------------------------------------------------------------------------
create or replace function public.remove_member(target_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_company uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove members';
  end if;

  if target_profile = auth.uid() then
    raise exception 'You cannot remove yourself';
  end if;

  select company_id into caller_company from public.profiles where id = auth.uid();

  perform set_config('app.privileged_profile_write', 'on', true);

  update public.profiles
     set company_id = null,
         department_id = null,
         role = 'member',
         status = 'pending'
   where id = target_profile
     and company_id = caller_company;

  perform set_config('app.privileged_profile_write', 'off', true);

  if not found then
    raise exception 'No such member in your organization';
  end if;

  insert into public.activity_log (company_id, actor_id, action, entity_id, summary)
  values (caller_company, auth.uid(), 'member.removed', target_profile, 'Member removed from organization');
end;
$$;

grant execute on function public.remove_member(uuid) to authenticated;
