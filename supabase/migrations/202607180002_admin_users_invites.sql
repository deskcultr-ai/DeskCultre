-- ============================================================================
-- Admin Users & Teams live-data and invite/redeem support
-- ============================================================================

create table if not exists public.admin_user_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  code text not null unique,
  token text not null unique,
  role public.user_role not null default 'member',
  department_id uuid references public.departments (id) on delete set null,
  invited_by uuid references public.profiles (id) on delete set null,
  status text not null default 'sent' check (status in ('sent', 'redeemed', 'cancelled', 'expired')),
  expires_at timestamptz not null default now() + interval '14 days',
  redeemed_by uuid references public.profiles (id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_user_invites_company_idx on public.admin_user_invites (company_id, created_at desc);
create index if not exists admin_user_invites_email_idx on public.admin_user_invites (lower(email));
create index if not exists admin_user_invites_status_idx on public.admin_user_invites (company_id, status);

drop trigger if exists touch_admin_user_invites on public.admin_user_invites;
create trigger touch_admin_user_invites before update on public.admin_user_invites
  for each row execute function public.touch_updated_at();

alter table public.admin_user_invites enable row level security;

drop policy if exists admin_user_invites_admin_select on public.admin_user_invites;
create policy admin_user_invites_admin_select on public.admin_user_invites
  for select using (company_id = public.current_company_id() and public.is_admin());

drop policy if exists admin_user_invites_admin_update on public.admin_user_invites;
create policy admin_user_invites_admin_update on public.admin_user_invites
  for update using (company_id = public.current_company_id() and public.is_admin())
  with check (company_id = public.current_company_id() and public.is_admin());

create or replace function public.make_admin_invite_code()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'DC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
$$;

create or replace function public.create_user_invite(
  invite_email text,
  assigned_role public.user_role default 'member',
  target_department uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  normalized_email text := lower(trim(invite_email));
  invite_row public.admin_user_invites;
  invite_code text;
  invite_token text;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_admin() then
    raise exception 'Only admins can invite users';
  end if;

  if normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;

  if assigned_role = 'super_admin' then
    raise exception 'super_admin cannot be granted through an invite';
  end if;

  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'Admin has no active organization';
  end if;

  if target_department is not null
     and not exists (
       select 1 from public.departments
       where id = target_department and company_id = caller_company
     ) then
    raise exception 'That department does not belong to your organization';
  end if;

  select *
    into invite_row
  from public.admin_user_invites
  where company_id = caller_company
    and lower(email) = normalized_email
    and status = 'sent'
    and expires_at > now()
  order by created_at desc
  limit 1;

  if invite_row.id is null then
    invite_code := public.make_admin_invite_code();
    while exists (select 1 from public.admin_user_invites where code = invite_code) loop
      invite_code := public.make_admin_invite_code();
    end loop;

    invite_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

    insert into public.admin_user_invites (
      company_id, email, code, token, role, department_id, invited_by
    )
    values (
      caller_company, normalized_email, invite_code, invite_token, assigned_role, target_department, caller
    )
    returning * into invite_row;
  else
    update public.admin_user_invites
       set role = assigned_role,
           department_id = target_department,
           invited_by = caller,
           expires_at = now() + interval '14 days'
     where id = invite_row.id
     returning * into invite_row;
  end if;

  insert into public.activity_log (company_id, actor_id, action, entity_type, entity_id, summary)
  values (caller_company, caller, 'member.invited', 'admin_user_invite', invite_row.id, 'Invite sent to ' || normalized_email);

  return jsonb_build_object(
    'id', invite_row.id,
    'email', invite_row.email,
    'code', invite_row.code,
    'token', invite_row.token,
    'role', invite_row.role,
    'departmentId', invite_row.department_id,
    'expiresAt', invite_row.expires_at
  );
end;
$$;

grant execute on function public.create_user_invite(text, public.user_role, uuid) to authenticated;

drop function if exists public.get_departments_by_code(text);

create or replace function public.get_departments_by_code(lookup_code text)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company uuid;
begin
  select id into target_company
  from public.companies
  where join_code = upper(trim(lookup_code));

  if target_company is null then
    select company_id into target_company
    from public.admin_user_invites
    where upper(trim(admin_user_invites.code)) = upper(trim(lookup_code))
      and status = 'sent'
      and expires_at > now()
    order by created_at desc
    limit 1;
  end if;

  if target_company is not null then
    return query
      select d.id, d.name
      from public.departments d
      where d.company_id = target_company
      order by d.name;
  end if;
end;
$$;

grant execute on function public.get_departments_by_code(text) to authenticated, anon;

create or replace function public.redeem_user_invite(
  invite_code text,
  invite_token text,
  target_department uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_email text;
  target_invite public.admin_user_invites;
  final_department uuid;
  existing_company uuid;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select lower(email), company_id
    into caller_email, existing_company
  from public.profiles
  where id = caller;

  if existing_company is not null then
    raise exception 'You already belong to an organization';
  end if;

  select *
    into target_invite
  from public.admin_user_invites
  where upper(trim(code)) = upper(trim(invite_code))
    and token = trim(invite_token)
    and status = 'sent'
    and expires_at > now()
  limit 1;

  if target_invite.id is null then
    raise exception 'That invitation is invalid or expired';
  end if;

  if caller_email is not null and lower(target_invite.email) <> caller_email then
    raise exception 'This invite was sent to %, but you are signed in as %', target_invite.email, caller_email;
  end if;

  final_department := coalesce(target_department, target_invite.department_id);

  if final_department is not null
     and not exists (
       select 1 from public.departments
       where id = final_department and company_id = target_invite.company_id
     ) then
    raise exception 'That department does not belong to this organization';
  end if;

  perform set_config('app.privileged_profile_write', 'on', true);

  update public.profiles
     set company_id = target_invite.company_id,
         department_id = final_department,
         role = target_invite.role,
         status = 'pending'
   where id = caller;

  perform set_config('app.privileged_profile_write', 'off', true);

  update public.admin_user_invites
     set status = 'redeemed',
         redeemed_by = caller,
         redeemed_at = now()
   where id = target_invite.id;

  insert into public.activity_log (company_id, actor_id, action, entity_type, entity_id, summary)
  values (target_invite.company_id, caller, 'member.invite_redeemed', 'admin_user_invite', target_invite.id, 'Invite redeemed; waiting for admin approval');

  insert into public.notifications (company_id, profile_id, title, body, link)
  select target_invite.company_id,
         p.id,
         'Approval request pending',
         coalesce((select full_name from public.profiles where id = caller), target_invite.email) || ' redeemed an invite code.',
         '/admin/users'
  from public.profiles p
  where p.company_id = target_invite.company_id
    and p.status = 'active'
    and p.role in ('super_admin', 'admin');

  return target_invite.company_id;
end;
$$;

grant execute on function public.redeem_user_invite(text, text, uuid) to authenticated;

create or replace function public.get_admin_users_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
begin
  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active' and role in ('super_admin', 'admin');

  if caller_company is null then
    raise exception 'Admin access required';
  end if;

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'totalUsers', (select count(*) from public.profiles where company_id = caller_company),
      'newUsers', (select count(*) from public.profiles where company_id = caller_company and created_at >= now() - interval '7 days'),
      'activeToday', (
        select count(distinct actor_id)
        from public.activity_log
        where company_id = caller_company and actor_id is not null and created_at >= date_trunc('day', now())
      ),
      'pendingInvites', (
        (select count(*) from public.admin_user_invites where company_id = caller_company and status = 'sent' and expires_at > now()) +
        (select count(*) from public.profiles where company_id = caller_company and status = 'pending')
      ),
      'approvalsLeft', (select count(*) from public.profiles where company_id = caller_company and status = 'pending'),
      'deactivated', (
        select count(*)
        from public.profiles p
        left join (
          select actor_id, max(created_at) last_seen
          from public.activity_log
          where company_id = caller_company
          group by actor_id
        ) a on a.actor_id = p.id
        where p.company_id = caller_company
          and (p.status = 'suspended' or (p.status = 'active' and coalesce(a.last_seen, p.created_at) < now() - interval '30 days'))
      ),
      'admins', (select count(*) from public.profiles where company_id = caller_company and status = 'active' and role in ('super_admin', 'admin'))
    ),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'fullName', p.full_name,
        'firstName', p.first_name,
        'email', p.email,
        'avatarUrl', p.avatar_url,
        'jobTitle', p.job_title,
        'role', p.role,
        'status', p.status,
        'departmentId', p.department_id,
        'departmentName', d.name,
        'createdAt', p.created_at,
        'lastSeenAt', a.last_seen,
        'activeToday', coalesce(a.last_seen >= date_trunc('day', now()), false),
        'needsApproval', p.status = 'pending'
      ) order by p.created_at desc)
      from public.profiles p
      left join public.departments d on d.id = p.department_id
      left join (
        select actor_id, max(created_at) last_seen
        from public.activity_log
        where company_id = caller_company
        group by actor_id
      ) a on a.actor_id = p.id
      where p.company_id = caller_company
    ), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
      from public.departments d
      where d.company_id = caller_company
    ), '[]'::jsonb),
    'pendingInvites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'email', i.email,
        'code', i.code,
        'role', i.role,
        'departmentId', i.department_id,
        'departmentName', d.name,
        'status', i.status,
        'expiresAt', i.expires_at,
        'createdAt', i.created_at
      ) order by i.created_at desc)
      from public.admin_user_invites i
      left join public.departments d on d.id = i.department_id
      where i.company_id = caller_company and i.status = 'sent' and i.expires_at > now()
    ), '[]'::jsonb),
    'admins', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(p.full_name, p.email, 'Admin'),
        'email', p.email,
        'avatarUrl', p.avatar_url,
        'role', p.role,
        'departmentName', d.name,
        'responsibility', case
          when p.role = 'super_admin' then 'Organization owner'
          when p.department_id is not null then 'Department administration'
          else 'Organization administration'
        end
      ) order by p.created_at)
      from public.profiles p
      left join public.departments d on d.id = p.department_id
      where p.company_id = caller_company and p.status = 'active' and p.role in ('super_admin', 'admin')
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_admin_users_data() to authenticated;
