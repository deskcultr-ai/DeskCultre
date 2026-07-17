-- ============================================================================
-- OAuth (Google) support
--
-- 1. handle_new_user() previously only understood the email-signup metadata
--    shape (first_name / last_name / phone_number). Google OAuth populates a
--    different shape (given_name / family_name / full_name / name / picture /
--    avatar_url), so Google users landed with NULL names and no avatar.
--    This version accepts both.
--
-- 2. request_workspace_access() is called by /auth/callback after a Google
--    *registration* to attach the details collected before the redirect. It
--    existed in the legacy schema but was never recreated.
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
  -- email signup sends first_name/last_name; Google sends given_name/family_name
  meta_first := nullif(trim(coalesce(meta ->> 'first_name', meta ->> 'given_name', '')), '');
  meta_last := nullif(trim(coalesce(meta ->> 'last_name', meta ->> 'family_name', '')), '');

  -- Google sends full_name or name; otherwise compose from the parts
  meta_full := nullif(trim(coalesce(
    meta ->> 'full_name',
    meta ->> 'name',
    concat_ws(' ', meta_first, meta_last)
  )), '');

  -- Google sends avatar_url or picture
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
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Attach registration details to the caller's own (still pending) profile.
-- Safe to expose: it only ever writes the row belonging to auth.uid(), and it
-- deliberately cannot set company_id, role or status.
-- ----------------------------------------------------------------------------
create or replace function public.request_workspace_access(
  request_first_name text,
  request_last_name text,
  request_phone_number text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
     set first_name = coalesce(nullif(trim(request_first_name), ''), first_name),
         last_name = coalesce(nullif(trim(request_last_name), ''), last_name),
         phone_number = coalesce(nullif(trim(request_phone_number), ''), phone_number),
         full_name = coalesce(
           nullif(trim(concat_ws(' ', nullif(trim(request_first_name), ''), nullif(trim(request_last_name), ''))), ''),
           full_name
         )
   where id = auth.uid();
end;
$$;

grant execute on function public.request_workspace_access(text, text, text) to authenticated;
