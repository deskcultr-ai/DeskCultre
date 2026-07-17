-- ============================================================================
-- FIX: infinite recursion in profiles RLS (Postgres 42P17)
--
-- 20260717000003 rewrote profiles_select_own with an inline subquery that reads
-- `profiles` from inside `profiles`' OWN select policy:
--
--     and company_id = (select company_id from public.profiles where id = auth.uid())
--
-- Evaluating the policy required reading the table, which re-evaluated the
-- policy, ... -> "infinite recursion detected in policy for relation profiles".
-- Every profile read returned 500, which broke sign-in redirects app-wide.
--
-- Rule: a policy on X must never SELECT from X directly. Go through a
-- SECURITY DEFINER function instead -- it runs as the table owner, bypasses RLS
-- internally, and therefore cannot re-enter the policy.
-- ============================================================================

-- Caller's company regardless of status. (current_company_id() only returns it
-- for ACTIVE members, so it can't answer "which org is this pending user in?".)
create or replace function public.my_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

grant execute on function public.my_company_id() to authenticated;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (
    -- always read your own row (this alone must never depend on a subquery)
    id = auth.uid()
    -- colleagues, once you're an active member
    or company_id = public.current_company_id()
    -- admins can see pending joiners in their own org
    or (
      status = 'pending'
      and public.is_admin()
      and company_id = public.my_company_id()
    )
  );
