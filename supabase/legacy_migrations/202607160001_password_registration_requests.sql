begin;

create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text not null check (length(btrim(first_name)) between 1 and 80),
  last_name text not null check (length(btrim(last_name)) between 1 and 80),
  email text not null,
  phone_number text not null check (phone_number ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'suspended')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists registration_requests_status_idx on public.registration_requests(status, created_at desc);

create or replace function public.capture_registration_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'registration_type', '') = 'workspace_join_request' then
    insert into public.registration_requests(auth_user_id, first_name, last_name, email, phone_number)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'first_name', ''),
      coalesce(new.raw_user_meta_data ->> 'last_name', ''),
      new.email,
      coalesce(new.raw_user_meta_data ->> 'phone_number', '')
    ) on conflict (auth_user_id) do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists capture_registration_request on auth.users;
create trigger capture_registration_request after insert on auth.users for each row execute function public.capture_registration_request();

alter table public.registration_requests enable row level security;
create policy registration_requests_admin_select on public.registration_requests for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role::text = 'admin'));

commit;
