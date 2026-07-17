begin;
alter table public.profiles add column if not exists availability text not null default 'available' check (availability in ('available','away','do_not_disturb')), add column if not exists email_visibility text not null default 'workspace' check (email_visibility in ('workspace','private')), add column if not exists phone_visibility text not null default 'private' check (phone_visibility in ('workspace','private'));
commit;
