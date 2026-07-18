-- ============================================================================
-- Employee join-org invite-code email lookup
-- ============================================================================

alter table public.admin_user_invites
  add column if not exists last_code_email_sent_at timestamptz,
  add column if not exists last_code_email_error text;

create or replace function public.get_join_org_email_payload(target_company uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  invite_row public.admin_user_invites;
  company_row public.companies;
  next_code text;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select lower(email)
    into caller_email
  from public.profiles
  where id = caller;

  if caller_email is null then
    raise exception 'Your account does not have an email address';
  end if;

  select *
    into invite_row
  from public.admin_user_invites
  where company_id = target_company
    and lower(email) = caller_email
    and status = 'sent'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if invite_row.id is null then
    raise exception 'No pending admin invite was found for % in this organization', caller_email;
  end if;

  select *
    into company_row
  from public.companies
  where id = target_company;

  if company_row.id is null then
    raise exception 'Organization not found';
  end if;

  if company_row.invite_code is null or company_row.invite_code_expires_at <= now() then
    next_code := public.generate_daily_invite_code();
    while exists (select 1 from public.companies where invite_code = next_code and id <> target_company) loop
      next_code := public.generate_daily_invite_code();
    end loop;

    update public.companies
       set invite_code = next_code,
           invite_code_expires_at = now() + interval '24 hours'
     where id = target_company
     returning * into company_row;
  end if;

  return jsonb_build_object(
    'inviteId', invite_row.id,
    'email', invite_row.email,
    'companyId', company_row.id,
    'companyName', company_row.name,
    'code', company_row.invite_code,
    'expiresAt', company_row.invite_code_expires_at
  );
end;
$$;

grant execute on function public.get_join_org_email_payload(uuid) to authenticated;

create or replace function public.mark_join_org_code_email(
  invite_id uuid,
  delivered boolean,
  delivery_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_email text;
begin
  select lower(email)
    into caller_email
  from public.profiles
  where id = auth.uid();

  update public.admin_user_invites
     set last_code_email_sent_at = case when delivered then now() else last_code_email_sent_at end,
         last_code_email_error = case when delivered then null else left(coalesce(delivery_error, 'Email delivery failed'), 1000) end
   where id = invite_id
     and lower(email) = caller_email;
end;
$$;

grant execute on function public.mark_join_org_code_email(uuid, boolean, text) to authenticated;
