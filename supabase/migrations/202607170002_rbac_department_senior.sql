begin;

alter table public.departments
  add column if not exists senior_manager_id uuid references public.profiles(id) on delete set null;

create index if not exists departments_senior_manager_idx
  on public.departments(senior_manager_id);

update public.profiles
set can_manage_people = true,
    can_manage_organization = true,
    can_view_reports = true,
    can_manage_meetings = true,
    can_create_tasks = true,
    can_review_tasks = true
where role::text in ('admin', 'owner');

update public.profiles
set can_manage_people = false,
    can_manage_organization = false,
    can_view_reports = false,
    can_manage_meetings = false
where role::text = 'manager';

create or replace function public.is_company_admin(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and company_id = target_company_id
      and is_active = true
      and role::text in ('admin', 'owner')
  );
$$;

create or replace function public.can_manage_company_people(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and company_id = target_company_id
      and is_active = true
      and (role::text in ('admin', 'owner') or can_manage_people = true)
  );
$$;

create or replace function public.can_manage_company_organization(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and company_id = target_company_id
      and is_active = true
      and (role::text in ('admin', 'owner') or can_manage_organization = true)
  );
$$;

create or replace function public.can_view_company_reports(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and company_id = target_company_id
      and is_active = true
      and (role::text in ('admin', 'owner') or can_view_reports = true)
  );
$$;

create or replace function public.can_manage_company_meetings(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and company_id = target_company_id
      and is_active = true
      and (role::text in ('admin', 'owner') or can_manage_meetings = true)
  );
$$;

create or replace function public.is_company_manager(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and company_id = target_company_id
      and is_active = true
      and (
        role::text in ('admin', 'owner')
        or can_manage_people = true
        or can_manage_organization = true
        or can_manage_meetings = true
        or can_view_reports = true
      )
  );
$$;

create or replace function public.guard_profile_sensitive_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    new.role is distinct from old.role
    or new.company_id is distinct from old.company_id
    or new.department_id is distinct from old.department_id
    or new.can_create_tasks is distinct from old.can_create_tasks
    or new.can_review_tasks is distinct from old.can_review_tasks
    or new.can_manage_people is distinct from old.can_manage_people
    or new.can_manage_organization is distinct from old.can_manage_organization
    or new.can_view_reports is distinct from old.can_view_reports
    or new.can_manage_meetings is distinct from old.can_manage_meetings
    or new.is_active is distinct from old.is_active
  ) and not public.is_company_admin(old.company_id) then
    raise exception 'Admin permission required to change roles and permissions';
  end if;
  return new;
end;
$$;

create or replace function public.set_profile_access(
  target_user_id uuid,
  target_role text,
  target_department_id uuid,
  allow_task_creation boolean,
  allow_review boolean,
  allow_people boolean,
  allow_organization boolean,
  allow_reports boolean,
  allow_meetings boolean,
  active boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  updated public.profiles%rowtype;
  normalized_role text := lower(btrim(target_role));
  next_create boolean := coalesce(allow_task_creation, false);
  next_review boolean := coalesce(allow_review, false);
  next_people boolean := coalesce(allow_people, false);
  next_organization boolean := coalesce(allow_organization, false);
  next_reports boolean := coalesce(allow_reports, false);
  next_meetings boolean := coalesce(allow_meetings, false);
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found or coalesce(actor.role::text, '') not in ('admin', 'owner') then
    raise exception 'Admin permission required';
  end if;

  if normalized_role not in ('admin', 'owner', 'manager', 'executive', 'member', 'reviewer') then
    raise exception 'Invalid role';
  end if;

  if target_user_id = actor.id and (normalized_role not in ('admin', 'owner') or active = false) then
    raise exception 'Admins cannot remove their own admin access';
  end if;

  if target_department_id is not null and not exists (
    select 1 from public.departments
    where id = target_department_id and company_id = actor.company_id
  ) then
    raise exception 'Invalid department';
  end if;

  if normalized_role in ('admin', 'owner') then
    next_create := true;
    next_review := true;
    next_people := true;
    next_organization := true;
    next_reports := true;
    next_meetings := true;
  elsif normalized_role <> 'manager' then
    next_people := false;
    next_organization := false;
    next_reports := false;
    next_meetings := false;
  end if;

  if normalized_role = 'reviewer' then
    next_review := true;
  end if;

  update public.profiles
  set role = normalized_role::public.user_role,
      department_id = target_department_id,
      can_create_tasks = next_create,
      can_review_tasks = next_review,
      can_manage_people = next_people,
      can_manage_organization = next_organization,
      can_view_reports = next_reports,
      can_manage_meetings = next_meetings,
      is_active = coalesce(active, true)
  where id = target_user_id
    and company_id = actor.company_id
  returning * into updated;

  if not found then
    raise exception 'Team member not found';
  end if;

  insert into public.access_audit_log(company_id, actor_id, target_user_id, action, details)
  values (
    actor.company_id,
    actor.id,
    target_user_id,
    'profile_access_updated',
    jsonb_build_object(
      'role', normalized_role,
      'department_id', target_department_id,
      'active', active,
      'can_create_tasks', next_create,
      'can_review_tasks', next_review,
      'can_manage_people', next_people,
      'can_manage_organization', next_organization,
      'can_view_reports', next_reports,
      'can_manage_meetings', next_meetings
    )
  );

  return updated;
end;
$$;

create or replace function public.update_profile_permissions(
  target_user_id uuid,
  allow_task_creation boolean,
  allow_review boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
begin
  select * into target from public.profiles where id = target_user_id;
  if not found then
    raise exception 'Team member not found';
  end if;

  return public.set_profile_access(
    target_user_id,
    target.role::text,
    target.department_id,
    allow_task_creation,
    allow_review,
    target.can_manage_people,
    target.can_manage_organization,
    target.can_view_reports,
    target.can_manage_meetings,
    target.is_active
  );
end;
$$;

create or replace function public.set_department_senior_manager(
  target_department_id uuid,
  senior_user_id uuid
)
returns public.departments
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  department_row public.departments%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found or coalesce(actor.role::text, '') not in ('admin', 'owner') then
    raise exception 'Admin permission required';
  end if;

  select * into department_row
  from public.departments
  where id = target_department_id
    and company_id = actor.company_id
  for update;

  if not found then
    raise exception 'Department not found';
  end if;

  if senior_user_id is not null and not exists (
    select 1
    from public.profiles
    where id = senior_user_id
      and company_id = actor.company_id
      and department_id = target_department_id
      and is_active = true
      and role::text in ('admin', 'owner', 'manager')
  ) then
    raise exception 'Senior manager must be an active admin or manager in this department';
  end if;

  update public.departments
  set senior_manager_id = senior_user_id
  where id = target_department_id
  returning * into department_row;

  insert into public.access_audit_log(company_id, actor_id, target_user_id, action, details)
  values (
    actor.company_id,
    actor.id,
    senior_user_id,
    'department_senior_manager_updated',
    jsonb_build_object('department_id', target_department_id)
  );

  return department_row;
end;
$$;

drop function if exists public.approve_registration_request(uuid, uuid, uuid, text, boolean, boolean);
drop function if exists public.approve_registration_request(uuid, uuid, uuid, uuid, text, boolean, boolean, boolean, boolean, boolean, boolean);

create function public.approve_registration_request(
  request_id uuid,
  target_company_id uuid,
  target_department_id uuid,
  target_team_id uuid,
  target_role text,
  allow_task_creation boolean,
  allow_review boolean,
  allow_people boolean,
  allow_organization boolean,
  allow_reports boolean,
  allow_meetings boolean,
  make_department_senior boolean
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  r public.registration_requests%rowtype;
  p public.profiles%rowtype;
  full_name text;
  normalized_role text := lower(btrim(target_role));
  next_create boolean := coalesce(allow_task_creation, false);
  next_review boolean := coalesce(allow_review, false);
  next_people boolean := coalesce(allow_people, false);
  next_organization boolean := coalesce(allow_organization, false);
  next_reports boolean := coalesce(allow_reports, false);
  next_meetings boolean := coalesce(allow_meetings, false);
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found or coalesce(actor.role::text, '') not in ('admin', 'owner') then
    raise exception 'Admin permission required';
  end if;

  select * into r from public.registration_requests where id = request_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'Pending registration request not found';
  end if;

  if normalized_role not in ('admin', 'owner', 'manager', 'executive', 'member', 'reviewer') then
    raise exception 'Invalid role';
  end if;

  if not exists (select 1 from public.companies where id = target_company_id) then
    raise exception 'Invalid company';
  end if;

  if target_department_id is not null and not exists (
    select 1 from public.departments
    where id = target_department_id and company_id = target_company_id
  ) then
    raise exception 'Invalid department';
  end if;

  if target_team_id is not null and not exists (
    select 1 from public.teams
    where id = target_team_id and company_id = target_company_id
  ) then
    raise exception 'Invalid team';
  end if;

  if not exists (select 1 from auth.users where id = r.auth_user_id and email_confirmed_at is not null) then
    raise exception 'Email verification required';
  end if;

  if normalized_role in ('admin', 'owner') then
    next_create := true;
    next_review := true;
    next_people := true;
    next_organization := true;
    next_reports := true;
    next_meetings := true;
  elsif normalized_role <> 'manager' then
    next_people := false;
    next_organization := false;
    next_reports := false;
    next_meetings := false;
  end if;

  if normalized_role = 'reviewer' then
    next_review := true;
  end if;

  full_name := btrim(r.first_name || ' ' || r.last_name);

  insert into public.profiles(
    id, company_id, department_id, full_name, email, role, is_active,
    can_create_tasks, can_review_tasks, can_manage_people,
    can_manage_organization, can_view_reports, can_manage_meetings
  )
  values (
    r.auth_user_id, target_company_id, target_department_id, full_name, r.email,
    normalized_role::public.user_role, true, next_create, next_review,
    next_people, next_organization, next_reports, next_meetings
  )
  on conflict (id) do update
  set company_id = excluded.company_id,
      department_id = excluded.department_id,
      full_name = excluded.full_name,
      email = excluded.email,
      role = excluded.role,
      is_active = true,
      can_create_tasks = excluded.can_create_tasks,
      can_review_tasks = excluded.can_review_tasks,
      can_manage_people = excluded.can_manage_people,
      can_manage_organization = excluded.can_manage_organization,
      can_view_reports = excluded.can_view_reports,
      can_manage_meetings = excluded.can_manage_meetings
  returning * into p;

  if target_team_id is not null then
    insert into public.team_members(team_id, user_id)
    values (target_team_id, r.auth_user_id)
    on conflict do nothing;
  end if;

  if coalesce(make_department_senior, false) then
    if target_department_id is null then
      raise exception 'Department is required for a senior manager';
    end if;
    perform public.set_department_senior_manager(target_department_id, r.auth_user_id);
  end if;

  update public.registration_requests
  set status = 'approved',
      team_id = target_team_id,
      reviewed_by = actor.id,
      reviewed_at = now(),
      updated_at = now()
  where id = r.id;

  insert into public.access_audit_log(company_id, actor_id, target_user_id, action, details)
  values (
    target_company_id,
    actor.id,
    r.auth_user_id,
    'registration_approved',
    jsonb_build_object(
      'role', normalized_role,
      'team_id', target_team_id,
      'department_id', target_department_id,
      'senior_manager', coalesce(make_department_senior, false)
    )
  );

  return p;
end;
$$;

create or replace function public.create_task_secure(
  task_title text,
  task_description text,
  task_department_id uuid,
  task_assigned_to uuid,
  task_priority text,
  task_due_date date,
  requested_task_type text default 'one_time'
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare actor public.profiles%rowtype; created_task public.tasks%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found then raise exception 'Profile setup is required'; end if;
  if coalesce(actor.role::text, '') not in ('admin', 'owner')
     and not coalesce(actor.can_create_tasks, false) then
    raise exception 'You do not have permission to create tasks';
  end if;
  if btrim(task_title) = '' then raise exception 'Title is required'; end if;
  if task_priority not in ('low', 'medium', 'high', 'urgent') then raise exception 'Invalid priority'; end if;
  if requested_task_type not in ('one_time', 'daily_recurring', 'continuous') then raise exception 'Invalid task type'; end if;
  if task_assigned_to is not null and not exists (
    select 1 from public.profiles where id = task_assigned_to and company_id = actor.company_id and is_active = true
  ) then raise exception 'Invalid assignee'; end if;
  if task_department_id is not null and not exists (
    select 1 from public.departments where id = task_department_id and company_id = actor.company_id
  ) then raise exception 'Invalid department'; end if;

  insert into public.tasks(
    company_id, title, description, department_id, assigned_to, priority,
    due_date, created_by, status, task_type, status_changed_at
  ) values (
    actor.company_id, btrim(task_title), nullif(btrim(task_description), ''),
    task_department_id, task_assigned_to, task_priority, task_due_date,
    actor.id, case when task_assigned_to is null then 'pending' else 'assigned' end,
    requested_task_type, now()
  ) returning * into created_task;

  insert into public.task_activity(company_id, task_id, user_id, action, details)
  values (actor.company_id, created_task.id, actor.id, 'task_created', jsonb_build_object('status', created_task.status));
  return created_task;
end;
$$;

create or replace function public.create_task_secure_v2(
  task_title text,
  task_description text,
  task_department_id uuid,
  task_assigned_to uuid,
  task_priority text,
  task_due_date date,
  requested_task_type text default 'one_time',
  task_brand_id uuid default null,
  task_channel_id uuid default null,
  task_team_id uuid default null,
  requested_start_date date default null,
  requested_recurrence_end_date date default null,
  requested_tag_ids uuid[] default array[]::uuid[]
)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare actor public.profiles%rowtype; created_task public.tasks%rowtype; recurrence_start date;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found then raise exception 'Profile setup is required'; end if;
  if coalesce(actor.role::text, '') not in ('admin', 'owner') and not coalesce(actor.can_create_tasks, false) then raise exception 'You do not have permission to create tasks'; end if;
  if btrim(task_title) = '' then raise exception 'Title is required'; end if;
  if task_priority not in ('low', 'medium', 'high', 'urgent') then raise exception 'Invalid priority'; end if;
  if requested_task_type not in ('one_time', 'daily_recurring', 'continuous') then raise exception 'Invalid task type'; end if;
  if task_assigned_to is not null and not exists (select 1 from public.profiles where id = task_assigned_to and company_id = actor.company_id and is_active) then raise exception 'Invalid assignee'; end if;
  if task_department_id is not null and not exists (select 1 from public.departments where id = task_department_id and company_id = actor.company_id) then raise exception 'Invalid department'; end if;
  if task_brand_id is not null and not exists (select 1 from public.company_brands where company_id = actor.company_id and brand_id = task_brand_id) then raise exception 'Brand is not enabled for this company'; end if;
  if task_channel_id is not null and not exists (select 1 from public.channels where id = task_channel_id and company_id = actor.company_id and is_active) then raise exception 'Invalid channel'; end if;
  if task_team_id is not null and not exists (select 1 from public.teams where id = task_team_id and company_id = actor.company_id and is_active) then raise exception 'Invalid team'; end if;
  if coalesce(array_length(requested_tag_ids, 1), 0) > 0 and exists (select 1 from unnest(requested_tag_ids) tag_id where not exists (select 1 from public.task_tags where id = tag_id and company_id = actor.company_id)) then raise exception 'Invalid tag'; end if;
  if requested_task_type = 'daily_recurring' and requested_recurrence_end_date is not null and requested_recurrence_end_date < coalesce(requested_start_date, task_due_date, current_date) then raise exception 'Recurrence end date must not precede its start date'; end if;

  recurrence_start := coalesce(requested_start_date, task_due_date, current_date);
  insert into public.tasks(
    company_id, title, description, department_id, assigned_to, priority, due_date, created_by, status, task_type,
    status_changed_at, brand_id, channel_id, team_id, start_date, recurrence_start_date, recurrence_end_date, next_recurrence_on
  ) values (
    actor.company_id, btrim(task_title), nullif(btrim(task_description), ''), task_department_id, task_assigned_to,
    task_priority::task_priority, task_due_date, actor.id, case when task_assigned_to is null then 'pending'::task_status else 'assigned'::task_status end,
    requested_task_type, now(), task_brand_id, task_channel_id, task_team_id, requested_start_date,
    case when requested_task_type = 'daily_recurring' then recurrence_start else null end,
    case when requested_task_type = 'daily_recurring' then requested_recurrence_end_date else null end,
    case when requested_task_type = 'daily_recurring' then recurrence_start else null end
  ) returning * into created_task;

  insert into public.task_tag_assignments(task_id, tag_id)
  select created_task.id, tag_id from unnest(requested_tag_ids) tag_id;
  insert into public.task_activity(company_id, task_id, user_id, action, details)
  values (actor.company_id, created_task.id, actor.id, 'task_created', jsonb_build_object('status', created_task.status, 'task_type', requested_task_type));
  return created_task;
end;
$$;

create or replace function public.queue_enabled_notification(
  target_user_id uuid,
  notification_channel text,
  notification_subject text,
  notification_body text
)
returns public.notification_outbox
language plpgsql
security definer
set search_path = public
as $$
declare actor public.profiles%rowtype; recipient public.profiles%rowtype; preference public.notification_preferences%rowtype; queued public.notification_outbox%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  select * into recipient from public.profiles where id = target_user_id;
  if not found or recipient.company_id <> actor.company_id or not public.can_manage_company_people(actor.company_id) then
    raise exception 'People management permission required';
  end if;
  select * into preference from public.notification_preferences where user_id = target_user_id;
  if notification_channel = 'email' and not coalesce(preference.email_enabled,false) then raise exception 'Recipient has not enabled email notifications'; end if;
  if notification_channel = 'whatsapp' and not coalesce(preference.whatsapp_enabled,false) then raise exception 'Recipient has not enabled WhatsApp notifications'; end if;
  insert into public.notification_outbox(company_id,user_id,channel,subject,body) values(actor.company_id,target_user_id,notification_channel,btrim(notification_subject),btrim(notification_body)) returning * into queued;
  return queued;
end;
$$;

create or replace function public.resolve_attendance_correction(target_id uuid, decision text, note text default null)
returns public.attendance_corrections
language plpgsql
security definer
set search_path = public
as $$
declare actor public.profiles%rowtype; c public.attendance_corrections%rowtype; result public.attendance_corrections%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found or not public.can_manage_company_people(actor.company_id) then raise exception 'People management permission required'; end if;
  select * into c from public.attendance_corrections where id = target_id and company_id = actor.company_id for update;
  if not found then raise exception 'Correction not found'; end if;
  if decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  update public.attendance_corrections set status=decision,reviewed_by=actor.id,reviewed_at=now(),review_note=nullif(btrim(note),'') where id=c.id returning * into result;
  if decision='approved' and c.attendance_session_id is not null then
    update public.attendance_sessions set login_at=coalesce(c.requested_login_at,login_at),logout_at=c.requested_logout_at,last_seen_at=coalesce(c.requested_logout_at,last_seen_at) where id=c.attendance_session_id;
  end if;
  return result;
end;
$$;

create or replace function public.resolve_leave_request(target_id uuid, decision text, note text default null)
returns public.leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare actor public.profiles%rowtype; l public.leave_requests%rowtype; result public.leave_requests%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  if not found or not public.can_manage_company_people(actor.company_id) then raise exception 'People management permission required'; end if;
  select * into l from public.leave_requests where id=target_id and company_id=actor.company_id for update;
  if not found then raise exception 'Leave request not found'; end if;
  if decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  update public.leave_requests set status=decision,reviewed_by=actor.id,reviewed_at=now(),review_note=nullif(btrim(note),'') where id=l.id returning * into result;
  return result;
end;
$$;

drop policy if exists channels_manage on public.channels;
create policy channels_manage on public.channels for all
using (public.can_manage_company_organization(company_id))
with check (public.can_manage_company_organization(company_id));

drop policy if exists teams_manage on public.teams;
create policy teams_manage on public.teams for all
using (public.can_manage_company_organization(company_id))
with check (public.can_manage_company_organization(company_id));

drop policy if exists team_members_manage on public.team_members;
create policy team_members_manage on public.team_members for all
using (exists (select 1 from public.teams t where t.id = team_id and public.can_manage_company_organization(t.company_id)))
with check (exists (select 1 from public.teams t where t.id = team_id and public.can_manage_company_organization(t.company_id)));

drop policy if exists task_tags_manage on public.task_tags;
create policy task_tags_manage on public.task_tags for all
using (public.can_manage_company_organization(company_id))
with check (public.can_manage_company_organization(company_id));

drop policy if exists meetings_manage on public.meetings;
create policy meetings_manage on public.meetings for all
using (public.can_manage_company_meetings(company_id))
with check (public.can_manage_company_meetings(company_id));

drop policy if exists meeting_attendees_manage on public.meeting_attendees;
create policy meeting_attendees_manage on public.meeting_attendees for all
using (exists (select 1 from public.meetings m where m.id = meeting_id and public.can_manage_company_meetings(m.company_id)))
with check (exists (select 1 from public.meetings m where m.id = meeting_id and public.can_manage_company_meetings(m.company_id)));

drop policy if exists meeting_decisions_manage on public.meeting_decisions;
create policy meeting_decisions_manage on public.meeting_decisions for all
using (public.can_manage_company_meetings(company_id))
with check (public.can_manage_company_meetings(company_id));

drop policy if exists notification_outbox_manager_select on public.notification_outbox;
create policy notification_outbox_manager_select on public.notification_outbox for select
using (public.can_manage_company_people(company_id));

drop policy if exists attendance_corrections_company_select on public.attendance_corrections;
create policy attendance_corrections_company_select on public.attendance_corrections for select
using (employee_id = auth.uid() or public.can_manage_company_people(company_id));

drop policy if exists leave_requests_company_select on public.leave_requests;
create policy leave_requests_company_select on public.leave_requests for select
using (employee_id = auth.uid() or public.can_manage_company_people(company_id));

drop policy if exists tasks_company_visibility on public.tasks;
create policy tasks_company_visibility on public.tasks for select
using (
  company_id = public.current_company_id()
  and (
    public.is_company_admin(company_id)
    or public.can_view_company_reports(company_id)
    or assigned_to = auth.uid()
    or created_by = auth.uid()
    or (coalesce((select p.can_review_tasks from public.profiles p where p.id = auth.uid()), false) and status in ('submitted','under_review'))
  )
);

grant execute on function public.is_company_admin(uuid) to authenticated;
grant execute on function public.can_manage_company_people(uuid) to authenticated;
grant execute on function public.can_manage_company_organization(uuid) to authenticated;
grant execute on function public.can_view_company_reports(uuid) to authenticated;
grant execute on function public.can_manage_company_meetings(uuid) to authenticated;
grant execute on function public.set_profile_access(uuid,text,uuid,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
grant execute on function public.set_department_senior_manager(uuid,uuid) to authenticated;
grant execute on function public.approve_registration_request(uuid,uuid,uuid,uuid,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;

commit;
