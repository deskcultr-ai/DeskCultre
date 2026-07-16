begin;
alter table public.attendance_sessions add column if not exists device_context jsonb not null default '{}'::jsonb;
create or replace function public.record_attendance_login(request_ip text default null, request_user_agent text default null, request_context jsonb default '{}'::jsonb)
returns public.attendance_sessions language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; session_key text; parsed_ip inet; attendance public.attendance_sessions%rowtype;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select * into actor from public.profiles where id=auth.uid(); if not found then raise exception 'Profile setup is required'; end if;
 session_key := coalesce(nullif(current_setting('request.jwt.claims', true),'')::jsonb ->> 'session_id',auth.uid()::text||':'||current_date::text);
 begin parsed_ip := nullif(split_part(request_ip,',',1),'')::inet; exception when invalid_text_representation then parsed_ip:=null; end;
 insert into public.attendance_sessions(company_id,user_id,auth_session_id,ip_address,user_agent,device_context) values(actor.company_id,actor.id,session_key,parsed_ip,left(request_user_agent,500),coalesce(request_context,'{}'::jsonb)) on conflict(user_id,auth_session_id) do update set last_seen_at=now(),device_context=coalesce(nullif(attendance_sessions.device_context,'{}'::jsonb),excluded.device_context) returning * into attendance;
 return public.classify_attendance_session(attendance.id);
end; $$;
grant execute on function public.record_attendance_login(text,text,jsonb) to authenticated;
commit;
