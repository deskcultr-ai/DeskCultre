begin;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  phone_number text,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  subject text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'cancelled')),
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_outbox_status_idx on public.notification_outbox(status, created_at);

alter table public.notification_preferences enable row level security;
alter table public.notification_outbox enable row level security;
create policy notification_preferences_own on public.notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_outbox_manager_select on public.notification_outbox for select using (public.is_company_manager(company_id));

create or replace function public.guard_profile_sensitive_fields()
returns trigger language plpgsql set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.company_id is distinct from old.company_id or new.can_create_tasks is distinct from old.can_create_tasks or new.can_review_tasks is distinct from old.can_review_tasks)
     and not public.is_company_manager(old.company_id) then
    raise exception 'Only a manager or admin can change roles and permissions';
  end if;
  return new;
end; $$;
drop trigger if exists guard_profile_sensitive_fields on public.profiles;
create trigger guard_profile_sensitive_fields before update on public.profiles for each row execute function public.guard_profile_sensitive_fields();

create or replace function public.update_profile_permissions(target_user_id uuid, allow_task_creation boolean, allow_review boolean)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare actor public.profiles%rowtype; updated public.profiles%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid();
  if coalesce(actor.role::text,'') not in ('admin','manager') then raise exception 'Manager or admin permission required'; end if;
  update public.profiles set can_create_tasks = allow_task_creation, can_review_tasks = allow_review where id = target_user_id and company_id = actor.company_id returning * into updated;
  if not found then raise exception 'Team member not found'; end if;
  return updated;
end; $$;

create or replace function public.queue_enabled_notification(target_user_id uuid, notification_channel text, notification_subject text, notification_body text)
returns public.notification_outbox language plpgsql security definer set search_path = public as $$
declare actor public.profiles%rowtype; recipient public.profiles%rowtype; preference public.notification_preferences%rowtype; queued public.notification_outbox%rowtype;
begin
  select * into actor from public.profiles where id = auth.uid(); select * into recipient from public.profiles where id = target_user_id;
  if not found or recipient.company_id <> actor.company_id or not public.is_company_manager(actor.company_id) then raise exception 'Manager or admin permission required'; end if;
  select * into preference from public.notification_preferences where user_id = target_user_id;
  if notification_channel = 'email' and not coalesce(preference.email_enabled,false) then raise exception 'Recipient has not enabled email notifications'; end if;
  if notification_channel = 'whatsapp' and not coalesce(preference.whatsapp_enabled,false) then raise exception 'Recipient has not enabled WhatsApp notifications'; end if;
  insert into public.notification_outbox(company_id,user_id,channel,subject,body) values(actor.company_id,target_user_id,notification_channel,btrim(notification_subject),btrim(notification_body)) returning * into queued;
  return queued;
end; $$;

grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.notification_outbox to authenticated;
grant execute on function public.update_profile_permissions(uuid,boolean,boolean) to authenticated;
grant execute on function public.queue_enabled_notification(uuid,text,text,text) to authenticated;
commit;
