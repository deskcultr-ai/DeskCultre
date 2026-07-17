-- ============================================================================
-- Bootstrap helper
--
-- Chicken-and-egg: handle_new_user() creates every signup as status='pending'
-- with company_id = null, and RLS only lets an *existing* admin assign one.
-- The very first company/admin therefore cannot be created through the app.
--
-- Run this ONCE from the Supabase SQL editor after the first user signs up:
--   select public.bootstrap_company('Acme Inc', 'you@company.com');
--
-- EXECUTE is revoked from anon/authenticated: it is SECURITY DEFINER, so if it
-- were callable over RPC any signed-in user could mint a company and make
-- themselves super_admin.
-- ============================================================================

create or replace function public.bootstrap_company(company_name text, admin_email text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_company_id uuid;
  target_profile uuid;
begin
  select id into target_profile from auth.users where lower(email) = lower(admin_email);
  if target_profile is null then
    raise exception 'No auth user found with email %. Sign up in the app first.', admin_email;
  end if;

  insert into public.companies (name, slug)
  values (
    company_name,
    lower(regexp_replace(company_name, '[^a-zA-Z0-9]+', '-', 'g'))
  )
  returning id into new_company_id;

  update public.profiles
     set company_id = new_company_id,
         role = 'super_admin',
         status = 'active'
   where id = target_profile;

  return new_company_id;
end;
$$;

revoke all on function public.bootstrap_company(text, text) from public;
revoke all on function public.bootstrap_company(text, text) from anon;
revoke all on function public.bootstrap_company(text, text) from authenticated;

-- ----------------------------------------------------------------------------
-- Approve a pending signup into the current admin's company.
-- Safe to expose: it checks the caller is an admin and scopes to their company.
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

  select company_id into caller_company from public.profiles where id = auth.uid();
  if caller_company is null then
    raise exception 'Admin has no company assigned';
  end if;

  update public.profiles
     set company_id = caller_company,
         role = assigned_role,
         status = 'active'
   where id = target_profile
     and status = 'pending';

  if not found then
    raise exception 'No pending profile found for %', target_profile;
  end if;
end;
$$;
