begin;

-- Company-level attendance rules. Login remains the source event; these rules
-- only classify it for managers and reports.
create table if not exists public.attendance_policies (
  company_id uuid primary key references public.companies(id) on delete cascade,
  timezone text not null default 'UTC',
  workday_start time not null default '09:00',
  workday_end time not null default '17:30',
  late_grace_minutes integer not null default 15 check (late_grace_minutes between 0 and 240),
  overtime_grace_minutes integer not null default 0 check (overtime_grace_minutes between 0 and 240),
  workdays smallint[] not null default '{1,2,3,4,5}',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

alter table public.attendance_sessions add column if not exists attendance_status text not null default 'present' check (attendance_status in ('present','late','absent','overtime','on_leave'));
alter table public.attendance_sessions add column if not exists expected_start_at timestamptz;
alter table public.attendance_sessions add column if not exists expected_end_at timestamptz;
alter table public.attendance_sessions add column if not exists work_mode text not null default 'office' check (work_mode in ('office','remote','hybrid','field'));

create table if not exists public.attendance_corrections (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  attendance_session_id uuid references public.attendance_sessions(id) on delete set null,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  requested_login_at timestamptz, requested_logout_at timestamptz, reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, review_note text,
  created_at timestamptz not null default now()
);
create index if not exists attendance_corrections_company_status_idx on public.attendance_corrections(company_id,status,created_at desc);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  leave_type text not null check (leave_type in ('casual','sick','earned','unpaid','work_from_home')),
  starts_on date not null, ends_on date not null, reason text, status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id), reviewed_at timestamptz, review_note text, created_at timestamptz not null default now(), check (ends_on >= starts_on)
);
create index if not exists leave_requests_company_dates_idx on public.leave_requests(company_id,starts_on,ends_on);

create or replace function public.touch_attendance_session(session_id uuid)
returns public.attendance_sessions language plpgsql security definer set search_path=public as $$
declare result public.attendance_sessions%rowtype;
begin
  update public.attendance_sessions set last_seen_at=now() where id=session_id and user_id=auth.uid() and logout_at is null returning * into result;
  if not found then raise exception 'Active attendance session not found'; end if;
  return result;
end; $$;

create or replace function public.record_attendance_logout()
returns public.attendance_sessions language plpgsql security definer set search_path=public as $$
declare result public.attendance_sessions%rowtype;
begin
  with active as (select id from public.attendance_sessions where user_id=auth.uid() and logout_at is null order by login_at desc limit 1)
  update public.attendance_sessions a set logout_at=now(), last_seen_at=now(),
    attendance_status=case when a.expected_end_at is not null and now() > a.expected_end_at then 'overtime' else a.attendance_status end
  from active where a.id=active.id returning a.* into result;
  if not found then raise exception 'Active attendance session not found'; end if;
  return result;
end; $$;

create or replace function public.request_attendance_correction(target_session_id uuid, requested_login timestamptz, requested_logout timestamptz, correction_reason text)
returns public.attendance_corrections language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; result public.attendance_corrections%rowtype;
begin
  select * into actor from public.profiles where id=auth.uid();
  if not found then raise exception 'Profile setup is required'; end if;
  if nullif(btrim(correction_reason),'') is null then raise exception 'A reason is required'; end if;
  insert into public.attendance_corrections(company_id,attendance_session_id,employee_id,requested_login_at,requested_logout_at,reason)
  values(actor.company_id,target_session_id,actor.id,requested_login,requested_logout,btrim(correction_reason)) returning * into result;
  return result;
end; $$;

alter table public.attendance_policies enable row level security;
alter table public.attendance_corrections enable row level security;
alter table public.leave_requests enable row level security;
create policy attendance_policies_company_select on public.attendance_policies for select using (company_id=public.current_company_id());
create policy attendance_corrections_company_select on public.attendance_corrections for select using (employee_id=auth.uid() or public.is_company_manager(company_id));
create policy leave_requests_company_select on public.leave_requests for select using (employee_id=auth.uid() or public.is_company_manager(company_id));
revoke insert,update,delete on public.attendance_policies,public.attendance_corrections,public.leave_requests from authenticated;
grant select on public.attendance_policies,public.attendance_corrections,public.leave_requests to authenticated;
grant execute on function public.touch_attendance_session(uuid), public.request_attendance_correction(uuid,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.record_attendance_logout() to authenticated;

commit;
