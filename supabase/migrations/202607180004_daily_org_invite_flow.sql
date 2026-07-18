-- ============================================================================
-- Daily organization invite code flow
-- ============================================================================

alter table public.companies
  add column if not exists invite_code text,
  add column if not exists invite_code_expires_at timestamptz;

create unique index if not exists companies_invite_code_idx
  on public.companies (invite_code)
  where invite_code is not null;

create or replace function public.generate_daily_invite_code()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'DC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4)) || '-' ||
         upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
$$;

create or replace function public.refresh_company_invite_code(target_company uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  next_code text;
  company_row public.companies;
begin
  if caller is not null
     and not exists (
       select 1
       from public.profiles
       where id = caller
         and company_id = target_company
         and status = 'active'
         and role in ('super_admin', 'admin')
     ) then
    raise exception 'Admin access required';
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
    'companyId', company_row.id,
    'name', company_row.name,
    'code', company_row.invite_code,
    'expiresAt', company_row.invite_code_expires_at
  );
end;
$$;

grant execute on function public.refresh_company_invite_code(uuid) to authenticated;

do $$
declare
  company_row record;
begin
  for company_row in select id from public.companies loop
    perform public.refresh_company_invite_code(company_row.id);
  end loop;
end $$;

create or replace function public.find_company_for_join(search_name text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  normalized text := lower(trim(search_name));
begin
  if length(normalized) < 2 then
    raise exception 'Enter at least 2 characters of the organization name';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', matched.id,
      'name', matched.name,
      'slug', matched.slug
    ) order by matched.match_rank, matched.name)
    from (
      select
        c.id,
        c.name,
        c.slug,
        case
          when lower(c.name) = normalized then 0
          when lower(c.name) like normalized || '%' then 1
          else 2
        end as match_rank
      from public.companies c
      where lower(c.name) like '%' || normalized || '%'
      order by match_rank, c.name
      limit 8
    ) matched
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.find_company_for_join(text) to authenticated;

create or replace function public.get_departments_by_company(target_company uuid)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select d.id, d.name
    from public.departments d
    where d.company_id = target_company
    order by d.name;
end;
$$;

grant execute on function public.get_departments_by_company(uuid) to authenticated;

create or replace function public.join_company_with_daily_code(
  target_company uuid,
  invite_code text,
  target_department uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  existing_company uuid;
  company_row public.companies;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select company_id into existing_company
  from public.profiles
  where id = caller;

  if existing_company is not null then
    raise exception 'You already belong to an organization';
  end if;

  select * into company_row
  from public.companies
  where id = target_company;

  if company_row.id is null then
    raise exception 'Organization not found';
  end if;

  if company_row.invite_code is null
     or company_row.invite_code_expires_at <= now()
     or upper(trim(company_row.invite_code)) <> upper(trim(invite_code)) then
    raise exception 'Invitation code is invalid or expired';
  end if;

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
  values (target_company, caller, 'member.joined_pending', 'Joined via daily invite code; waiting for approval');

  insert into public.notifications (company_id, profile_id, title, body, link)
  select target_company,
         p.id,
         'Approval request pending',
         coalesce((select full_name from public.profiles where id = caller), (select email from public.profiles where id = caller), 'A user') || ' requested to join your organization.',
         '/admin/users'
  from public.profiles p
  where p.company_id = target_company
    and p.status = 'active'
    and p.role in ('super_admin', 'admin');

  return target_company;
end;
$$;

grant execute on function public.join_company_with_daily_code(uuid, text, uuid) to authenticated;

create or replace function public.get_admin_users_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  invite_info jsonb;
begin
  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active' and role in ('super_admin', 'admin');

  if caller_company is null then
    raise exception 'Admin access required';
  end if;

  invite_info := public.refresh_company_invite_code(caller_company);

  return jsonb_build_object(
    'orgInvite', invite_info,
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
