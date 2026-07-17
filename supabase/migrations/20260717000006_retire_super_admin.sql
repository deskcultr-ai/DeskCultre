-- ============================================================================
-- Retire super_admin from the product.
--
-- The product has exactly two entry points:
--   create organization -> you are that org's `admin`
--   join organization   -> you are a `member` (employee), pending approval
--
-- `super_admin` only ever existed because bootstrap_company() minted one via
-- the SQL editor. It has no place in a self-serve product: every customer org
-- is administered by an `admin`, and platform-level access belongs to the
-- service_role key / Supabase dashboard, not an in-app role.
--
-- The enum value is retained (Postgres cannot drop enum values that are still
-- referenced by a column default/history), but nothing can hold or grant it.
-- ============================================================================

-- 1. Demote any existing platform admins to org admins.
update public.profiles set role = 'admin' where role = 'super_admin';

-- 2. Remove the bootstrap hack. create_company() is the real onboarding path.
drop function if exists public.bootstrap_company(text, text);

-- 3. Block super_admin from ever being set again, from ANY context (the guard
--    trigger previously allowed it when auth.uid() was null, i.e. SQL editor).
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  -- super_admin is retired: reject it everywhere, including the SQL editor.
  if new.role = 'super_admin' then
    raise exception 'super_admin is retired. Use admin for organization owners.';
  end if;

  -- Trusted contexts: service_role / SQL editor, and the onboarding RPCs which
  -- flag themselves for the current transaction.
  if caller is null or coalesce(current_setting('app.privileged_profile_write', true), '') = 'on' then
    return new;
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.company_id is distinct from old.company_id then

    if not public.is_admin() then
      raise exception 'Only admins can change role, status or organization';
    end if;

    if new.id = caller and new.role is distinct from old.role then
      raise exception 'You cannot change your own role';
    end if;

    if old.company_id is not null
       and old.company_id is distinct from public.my_company_id() then
      raise exception 'You can only manage members of your own organization';
    end if;
  end if;

  return new;
end;
$$;

-- 4. is_admin() no longer needs to consider the retired role.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role in ('admin', 'manager') from public.profiles where id = auth.uid()), false);
$$;
