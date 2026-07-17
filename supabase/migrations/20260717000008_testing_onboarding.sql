-- ============================================================================
-- Support for Custom Domain, Industry Sector, and Testing Roles in Onboarding
-- ============================================================================

-- 1. Add fields to companies table
alter table public.companies add column if not exists custom_domain_url text;
alter table public.companies add column if not exists industry_sector text;

-- 2. Replace create_company to support custom domain and industry sector
create or replace function public.create_company(
  company_name text,
  custom_domain text default null,
  industry text default null
)
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

  insert into public.companies (name, slug, join_code, custom_domain_url, industry_sector)
  values (
    trim(company_name),
    lower(regexp_replace(trim(company_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' ||
      substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6),
    public.gen_join_code(),
    nullif(trim(custom_domain), ''),
    nullif(trim(industry), '')
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

grant execute on function public.create_company(text, text, text) to authenticated;

-- 3. Add join_company_for_testing to allow immediate onboarding activation with a chosen testing role
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
         status = 'active' -- set active immediately for rapid testing!
   where id = caller;

  perform set_config('app.privileged_profile_write', 'off', true);

  insert into public.activity_log (company_id, actor_id, action, summary)
  values (target_company, caller, 'member.joined_testing', 'Joined the organization via testing code as ' || target_role::text);

  return target_company;
end;
$$;

grant execute on function public.join_company_for_testing(text, user_role, uuid) to authenticated;
