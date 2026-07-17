-- ============================================================================
-- Support for get_departments_by_code and onboarding pending approval flow
-- ============================================================================

-- 1. Create function to fetch departments by join code (bypasses RLS)
create or replace function public.get_departments_by_code(code text)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company uuid;
begin
  select id into target_company from public.companies where join_code = upper(trim(code));
  if target_company is not null then
    return query select d.id, d.name from public.departments d where d.company_id = target_company order by d.name;
  end if;
end;
$$;

grant execute on function public.get_departments_by_code(text) to authenticated, anon;

-- 2. Update join_company_for_testing function to set status = 'pending' instead of 'active'
create or replace function public.join_company_for_testing(
  code text,
  target_role user_role,
  target_department uuid default null
)
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
         role = target_role,
         status = 'pending' -- set pending to wait for admin approval!
   where id = caller;

  perform set_config('app.privileged_profile_write', 'off', true);

  insert into public.activity_log (company_id, actor_id, action, summary)
  values (target_company, caller, 'member.joined_pending', 'Joined the organization via code as ' || target_role::text || ', awaiting approval');

  return target_company;
end;
$$;

grant execute on function public.join_company_for_testing(text, user_role, uuid) to authenticated;

-- 3. Function to activate a user via an activation link (bypasses guard trigger)
create or replace function public.activate_user_via_link(target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.privileged_profile_write', 'on', true);
  
  update public.profiles
     set status = 'active'
   where id = target_id
     and status = 'pending';
     
  perform set_config('app.privileged_profile_write', 'off', true);
end;
$$;

grant execute on function public.activate_user_via_link(uuid) to authenticated, anon;

-- 4. Function to cancel pending join request and leave company (bypasses guard trigger)
create or replace function public.leave_company_for_testing()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  perform set_config('app.privileged_profile_write', 'on', true);
  
  update public.profiles
     set company_id = null,
         department_id = null,
         role = 'member',
         status = 'pending'
   where id = caller;
   
  perform set_config('app.privileged_profile_write', 'off', true);
end;
$$;

grant execute on function public.leave_company_for_testing() to authenticated;


