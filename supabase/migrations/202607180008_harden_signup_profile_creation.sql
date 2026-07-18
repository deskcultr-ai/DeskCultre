-- ============================================================================
-- Harden signup/profile creation for email + Google auth
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  meta_first text;
  meta_last text;
  meta_full text;
  meta_avatar text;
begin
  meta_first := nullif(trim(coalesce(meta ->> 'first_name', meta ->> 'given_name', '')), '');
  meta_last := nullif(trim(coalesce(meta ->> 'last_name', meta ->> 'family_name', '')), '');
  meta_full := nullif(trim(coalesce(meta ->> 'full_name', meta ->> 'name', concat_ws(' ', meta_first, meta_last))), '');
  meta_avatar := nullif(trim(coalesce(meta ->> 'avatar_url', meta ->> 'picture', '')), '');

  insert into public.profiles (
    id, email, first_name, last_name, full_name, phone_number, avatar_url
  )
  values (
    new.id,
    new.email,
    meta_first,
    meta_last,
    meta_full,
    nullif(trim(coalesce(meta ->> 'phone_number', '')), ''),
    meta_avatar
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email),
        first_name = coalesce(public.profiles.first_name, excluded.first_name),
        last_name = coalesce(public.profiles.last_name, excluded.last_name),
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        phone_number = coalesce(public.profiles.phone_number, excluded.phone_number),
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url),
        updated_at = now();

  return new;
exception
  when others then
    -- Never block auth.users creation because a profile helper failed.
    return new;
end;
$$;

create or replace function public.ensure_profile_for_current_user(
  request_first_name text default null,
  request_last_name text default null,
  request_phone_number text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  user_row auth.users%rowtype;
  meta jsonb;
  profile_row public.profiles%rowtype;
  meta_first text;
  meta_last text;
  meta_full text;
  meta_phone text;
  meta_avatar text;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  select * into user_row
  from auth.users
  where id = caller;

  if user_row.id is null then
    raise exception 'Auth user was not found';
  end if;

  meta := coalesce(user_row.raw_user_meta_data, '{}'::jsonb);
  meta_first := nullif(trim(coalesce(request_first_name, meta ->> 'first_name', meta ->> 'given_name', '')), '');
  meta_last := nullif(trim(coalesce(request_last_name, meta ->> 'last_name', meta ->> 'family_name', '')), '');
  meta_full := nullif(trim(coalesce(meta ->> 'full_name', meta ->> 'name', concat_ws(' ', meta_first, meta_last))), '');
  meta_phone := nullif(trim(coalesce(request_phone_number, meta ->> 'phone_number', '')), '');
  meta_avatar := nullif(trim(coalesce(meta ->> 'avatar_url', meta ->> 'picture', '')), '');

  insert into public.profiles (
    id, email, first_name, last_name, full_name, phone_number, avatar_url
  )
  values (
    caller,
    user_row.email,
    meta_first,
    meta_last,
    meta_full,
    meta_phone,
    meta_avatar
  )
  on conflict (id) do update
    set email = coalesce(excluded.email, public.profiles.email),
        first_name = coalesce(excluded.first_name, public.profiles.first_name),
        last_name = coalesce(excluded.last_name, public.profiles.last_name),
        full_name = coalesce(
          nullif(trim(concat_ws(' ', excluded.first_name, excluded.last_name)), ''),
          excluded.full_name,
          public.profiles.full_name
        ),
        phone_number = coalesce(excluded.phone_number, public.profiles.phone_number),
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
        updated_at = now()
  returning * into profile_row;

  return profile_row;
end;
$$;

grant execute on function public.ensure_profile_for_current_user(text, text, text) to authenticated;
