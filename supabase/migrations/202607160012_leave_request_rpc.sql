begin;
create or replace function public.request_leave(leave_kind text, leave_start date, leave_end date, leave_reason text default null)
returns public.leave_requests language plpgsql security definer set search_path=public as $$
declare actor public.profiles%rowtype; result public.leave_requests%rowtype;
begin
 select * into actor from public.profiles where id=auth.uid();
 if not found or actor.role::text='admin' then raise exception 'Leave requests are available to non-admin users'; end if;
 if leave_kind not in ('casual','sick','work_from_home') then raise exception 'Invalid leave type'; end if;
 if leave_end < leave_start then raise exception 'End date must not precede start date'; end if;
 insert into public.leave_requests(company_id,employee_id,leave_type,starts_on,ends_on,reason) values(actor.company_id,actor.id,leave_kind,leave_start,leave_end,nullif(btrim(leave_reason),'')) returning * into result;
 return result;
end; $$;
grant execute on function public.request_leave(text,date,date,text) to authenticated;
commit;
