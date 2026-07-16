begin;

alter table public.registration_requests add column if not exists team_id uuid references public.teams(id) on delete set null;
alter table public.profiles
  add column if not exists can_manage_people boolean not null default false,
  add column if not exists can_manage_organization boolean not null default false,
  add column if not exists can_view_reports boolean not null default false,
  add column if not exists can_manage_meetings boolean not null default false;

update public.profiles set can_manage_people = true, can_manage_organization = true, can_view_reports = true, can_manage_meetings = true where role::text in ('admin','manager');

create table if not exists public.access_audit_log (
  id uuid primary key default gen_random_uuid(), company_id uuid references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null, target_user_id uuid references auth.users(id) on delete set null,
  action text not null, details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists access_audit_company_created_idx on public.access_audit_log(company_id, created_at desc);
alter table public.access_audit_log enable row level security;
create policy access_audit_admin_select on public.access_audit_log for select using (exists (select 1 from public.profiles p where p.id=auth.uid() and p.company_id=access_audit_log.company_id and p.role::text='admin'));

create or replace function public.get_my_registration_status()
returns public.registration_requests language sql stable security definer set search_path=public as $$
 select * from public.registration_requests where auth_user_id = auth.uid();
$$;

create or replace function public.resubmit_registration_request()
returns public.registration_requests language plpgsql security definer set search_path=public as $$
declare request_row public.registration_requests%rowtype;
begin
 update public.registration_requests set status='pending', reviewed_by=null, reviewed_at=null, review_note=null, updated_at=now() where auth_user_id=auth.uid() and status='rejected' returning * into request_row;
 if not found then raise exception 'No rejected registration request found'; end if;
 return request_row;
end; $$;

create or replace function public.approve_registration_request(
 request_id uuid, target_company_id uuid, target_department_id uuid, target_team_id uuid, target_role text,
 allow_task_creation boolean, allow_review boolean, allow_people boolean, allow_organization boolean, allow_reports boolean, allow_meetings boolean
) returns public.profiles language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; r public.registration_requests%rowtype; p public.profiles%rowtype; full_name text;
begin
 select * into actor from public.profiles where id=auth.uid(); if coalesce(actor.role::text,'')<>'admin' then raise exception 'Admin permission required'; end if;
 select * into r from public.registration_requests where id=request_id for update; if not found or r.status<>'pending' then raise exception 'Pending registration request not found'; end if;
 if target_role not in ('admin','manager','executive','member','reviewer') then raise exception 'Invalid role'; end if;
 if not exists(select 1 from public.companies where id=target_company_id) then raise exception 'Invalid company'; end if;
 if target_department_id is not null and not exists(select 1 from public.departments where id=target_department_id and company_id=target_company_id) then raise exception 'Invalid department'; end if;
 if target_team_id is not null and not exists(select 1 from public.teams where id=target_team_id and company_id=target_company_id) then raise exception 'Invalid team'; end if;
 if not exists(select 1 from auth.users where id=r.auth_user_id and email_confirmed_at is not null) then raise exception 'Email verification required'; end if;
 full_name:=btrim(r.first_name||' '||r.last_name);
 insert into public.profiles(id,company_id,department_id,full_name,email,role,is_active,can_create_tasks,can_review_tasks,can_manage_people,can_manage_organization,can_view_reports,can_manage_meetings)
 values(r.auth_user_id,target_company_id,target_department_id,full_name,r.email,target_role::public.user_role,true,allow_task_creation,allow_review,allow_people,allow_organization,allow_reports,allow_meetings)
 on conflict(id) do update set company_id=excluded.company_id,department_id=excluded.department_id,full_name=excluded.full_name,email=excluded.email,role=excluded.role,is_active=true,can_create_tasks=excluded.can_create_tasks,can_review_tasks=excluded.can_review_tasks,can_manage_people=excluded.can_manage_people,can_manage_organization=excluded.can_manage_organization,can_view_reports=excluded.can_view_reports,can_manage_meetings=excluded.can_manage_meetings returning * into p;
 if target_team_id is not null then insert into public.team_members(team_id,user_id) values(target_team_id,r.auth_user_id) on conflict do nothing; end if;
 update public.registration_requests set status='approved',team_id=target_team_id,reviewed_by=actor.id,reviewed_at=now(),updated_at=now() where id=r.id;
 insert into public.access_audit_log(company_id,actor_id,target_user_id,action,details) values(target_company_id,actor.id,r.auth_user_id,'registration_approved',jsonb_build_object('role',target_role,'team_id',target_team_id));
 return p;
end; $$;

create or replace function public.reject_registration_request(request_id uuid,rejection_note text)
returns public.registration_requests language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; r public.registration_requests%rowtype;
begin
 select * into actor from public.profiles where id=auth.uid(); if coalesce(actor.role::text,'')<>'admin' then raise exception 'Admin permission required'; end if;
 update public.registration_requests set status='rejected',reviewed_by=actor.id,reviewed_at=now(),review_note=btrim(rejection_note),updated_at=now() where id=request_id and status='pending' returning * into r;
 if not found then raise exception 'Pending registration request not found'; end if;
 insert into public.access_audit_log(company_id,actor_id,target_user_id,action,details) values(actor.company_id,actor.id,r.auth_user_id,'registration_rejected',jsonb_build_object('reason',r.review_note)); return r;
end; $$;
grant select on public.access_audit_log to authenticated;
grant execute on function public.get_my_registration_status() to authenticated;
grant execute on function public.resubmit_registration_request() to authenticated;
grant execute on function public.approve_registration_request(uuid,uuid,uuid,uuid,text,boolean,boolean,boolean,boolean,boolean,boolean) to authenticated;
commit;
