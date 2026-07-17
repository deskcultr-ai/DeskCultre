begin;

create or replace function public.request_workspace_access(
  request_first_name text,
  request_last_name text,
  request_phone_number text
)
returns public.registration_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.registration_requests%rowtype;
  current_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if length(btrim(request_first_name)) < 1 or length(btrim(request_first_name)) > 80 then
    raise exception 'First name is required';
  end if;

  if length(btrim(request_last_name)) < 1 or length(btrim(request_last_name)) > 80 then
    raise exception 'Last name is required';
  end if;

  if request_phone_number !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Use an international phone number, for example +919876543210';
  end if;

  select email into current_email from auth.users where id = auth.uid();

  insert into public.registration_requests(auth_user_id, first_name, last_name, email, phone_number)
  values (auth.uid(), btrim(request_first_name), btrim(request_last_name), coalesce(current_email, ''), request_phone_number)
  on conflict (auth_user_id) do update
  set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    phone_number = excluded.phone_number,
    status = case
      when public.registration_requests.status = 'rejected' then 'pending'
      else public.registration_requests.status
    end,
    reviewed_by = case
      when public.registration_requests.status = 'rejected' then null
      else public.registration_requests.reviewed_by
    end,
    reviewed_at = case
      when public.registration_requests.status = 'rejected' then null
      else public.registration_requests.reviewed_at
    end,
    review_note = case
      when public.registration_requests.status = 'rejected' then null
      else public.registration_requests.review_note
    end,
    updated_at = now()
  returning * into request_row;

  return request_row;
end;
$$;

grant execute on function public.request_workspace_access(text, text, text) to authenticated;

commit;
