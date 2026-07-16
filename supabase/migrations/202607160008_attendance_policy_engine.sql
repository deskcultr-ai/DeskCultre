begin;

create or replace function public.classify_attendance_session(target_id uuid)
returns public.attendance_sessions language plpgsql security definer set search_path=public as $$
declare s public.attendance_sessions%rowtype; p public.attendance_policies%rowtype; local_day date; start_at timestamptz; end_at timestamptz; result public.attendance_sessions%rowtype;
begin
 select * into s from public.attendance_sessions where id=target_id;
 select * into p from public.attendance_policies where company_id=s.company_id;
 if not found then return s; end if;
 local_day := (s.login_at at time zone p.timezone)::date;
 start_at := make_timestamptz(extract(year from local_day)::int,extract(month from local_day)::int,extract(day from local_day)::int,extract(hour from p.workday_start)::int,extract(minute from p.workday_start)::int,0,p.timezone);
 end_at := make_timestamptz(extract(year from local_day)::int,extract(month from local_day)::int,extract(day from local_day)::int,extract(hour from p.workday_end)::int,extract(minute from p.workday_end)::int,0,p.timezone);
 update public.attendance_sessions set expected_start_at=start_at, expected_end_at=end_at, attendance_status=case when s.login_at > start_at + make_interval(mins=>p.late_grace_minutes) then 'late' else 'present' end where id=s.id returning * into result;
 return result;
end; $$;

create or replace function public.record_attendance_login(request_ip text default null, request_user_agent text default null)
returns public.attendance_sessions language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; session_key text; parsed_ip inet; attendance public.attendance_sessions%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into actor from public.profiles where id=auth.uid(); if not found then raise exception 'Profile setup is required'; end if;
 session_key := coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'session_id',auth.uid()::text||':'||current_date::text);
 begin parsed_ip := nullif(split_part(request_ip,',',1),'')::inet; exception when invalid_text_representation then parsed_ip:=null; end;
 insert into public.attendance_sessions(company_id,user_id,auth_session_id,ip_address,user_agent) values(actor.company_id,actor.id,session_key,parsed_ip,left(request_user_agent,500)) on conflict(user_id,auth_session_id) do update set last_seen_at=now() returning * into attendance;
 return public.classify_attendance_session(attendance.id);
end; $$;
grant execute on function public.classify_attendance_session(uuid) to authenticated;
commit;
