begin;

alter table public.tasks enable row level security;

drop policy if exists tasks_company_visibility on public.tasks;
create policy tasks_company_visibility on public.tasks for select using (
  company_id = public.current_company_id()
  and (
    public.current_profile_role() in ('admin','owner','manager')
    or assigned_to = auth.uid()
    or created_by = auth.uid()
    or (public.current_profile_role() = 'reviewer' and status in ('submitted','under_review'))
  )
);

revoke insert, update, delete on public.tasks from authenticated;
grant select on public.tasks to authenticated;

commit;
