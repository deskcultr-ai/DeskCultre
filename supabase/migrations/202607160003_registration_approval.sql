begin;

create or replace function public.approve_registration_request(
  request_id uuid,
  target_company_id uuid,
  target_department_id uuid,
  target_role text,
  allow_task_creation boolean,
  allow_review boolean
)
returns public.profiles
language plpgsql security definer set search_path = public as $$
declare actor public.profiles%rowtype; request_row public.registration_requests%rowtype; approved_profile public.profiles%rowtype; full_name text;
begin
  select * into actor from public.profiles where id = auth.uid();
  if coalesce(actor.role::text,'') <> 'admin' then raise exception 'Admin permission required'; end if;
  select * into request_row from public.registration_requests where id = request_id for update;
  if not found or request_row.status <> 'pending' then raise exception 'Pending registration request not found'; end if;
  if target_role not in ('admin','manager','executive','member','reviewer') then raise exception 'Invalid role'; end if;
  if not exists (select 1 from public.companies where id = target_company_id) then raise exception 'Invalid company'; end if;
  if target_department_id is not null and not exists (select 1 from public.departments where id = target_department_id and company_id = target_company_id) then raise exception 'Invalid department'; end if;
  if not exists (select 1 from auth.users where id = request_row.auth_user_id and email_confirmed_at is not null) then raise exception 'The user must verify their email before approval'; end if;
  full_name := btrim(request_row.first_name || ' ' || request_row.last_name);
  insert into public.profiles(id, company_id, department_id, full_name, email, role, is_active, can_create_tasks, can_review_tasks)
  values (request_row.auth_user_id, target_company_id, target_department_id, full_name, request_row.email, target_role::public.user_role, true, allow_task_creation, allow_review)
  on conflict (id) do update set company_id = excluded.company_id, department_id = excluded.department_id, full_name = excluded.full_name, email = excluded.email, role = excluded.role, is_active = true, can_create_tasks = excluded.can_create_tasks, can_review_tasks = excluded.can_review_tasks
  returning * into approved_profile;
  update public.registration_requests set status = 'approved', reviewed_by = actor.id, reviewed_at = now(), updated_at = now() where id = request_row.id;
  return approved_profile;
end; $$;

create or replace function public.reject_registration_request(request_id uuid, rejection_note text)
returns public.registration_requests
language plpgsql security definer set search_path = public as $$
declare actor public.profiles%rowtype; request_row public.registration_requests%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  if coalesce(actor.role::text,'') <> 'admin' then raise exception 'Admin permission required'; end if;
  if btrim(rejection_note) = '' then raise exception 'A rejection note is required'; end if;
  update public.registration_requests set status = 'rejected', reviewed_by = actor.id, reviewed_at = now(), review_note = btrim(rejection_note), updated_at = now() where id = request_id and status = 'pending' returning * into request_row;
  if not found then raise exception 'Pending registration request not found'; end if;
  return request_row;
end; $$;

create or replace function public.resubmit_registration_request()
returns public.registration_requests
language plpgsql security definer set search_path = public as $$
declare request_row public.registration_requests%rowtype;
begin
  update public.registration_requests set status = 'pending', reviewed_by = null, reviewed_at = null, review_note = null, updated_at = now() where auth_user_id = auth.uid() and status = 'rejected' returning * into request_row;
  if not found then raise exception 'No rejected registration request found'; end if;
  return request_row;
end; $$;

grant execute on function public.approve_registration_request(uuid,uuid,uuid,text,boolean,boolean) to authenticated;
grant execute on function public.reject_registration_request(uuid,text) to authenticated;
grant execute on function public.resubmit_registration_request() to authenticated;
commit;
