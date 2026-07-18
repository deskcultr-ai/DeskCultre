-- ============================================================================
-- Admin Departments + Tasks live workflow support
-- ============================================================================

alter table public.departments
  add column if not exists priority public.task_priority not null default 'medium';

create index if not exists departments_company_priority_idx on public.departments (company_id, priority);
create index if not exists tasks_department_idx on public.tasks (company_id, department_id);

create or replace function public.ensure_default_departments(target_company uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not exists (
       select 1
       from public.profiles
       where id = auth.uid()
         and company_id = target_company
         and status = 'active'
         and role in ('super_admin', 'admin')
     )
     and exists (select 1 from public.profiles where company_id = target_company) then
    raise exception 'Admin access required';
  end if;

  insert into public.departments (company_id, name, description, priority)
  values
    (target_company, 'Technical', 'Engineering, systems, integrations, and product support.', 'high'),
    (target_company, 'Graphics', 'Creative design, visuals, branding, and production assets.', 'medium'),
    (target_company, 'E-commerce', 'Storefront operations, catalog, sales, and marketplace work.', 'high'),
    (target_company, 'Logistic', 'Inventory movement, fulfillment, dispatch, and delivery coordination.', 'medium'),
    (target_company, 'Content Creation', 'Content planning, writing, publishing, and campaign materials.', 'medium')
  on conflict (company_id, name) do update
     set description = coalesce(public.departments.description, excluded.description),
         priority = public.departments.priority;
end;
$$;

grant execute on function public.ensure_default_departments(uuid) to authenticated;

create or replace function public.ensure_default_departments_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_default_departments(new.id);
  return new;
end;
$$;

drop trigger if exists create_default_departments on public.companies;
create trigger create_default_departments
  after insert on public.companies
  for each row execute function public.ensure_default_departments_trigger();

do $$
declare
  company_row record;
begin
  for company_row in select id from public.companies loop
    perform public.ensure_default_departments(company_row.id);
  end loop;
end $$;

create or replace function public.get_admin_departments_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_company uuid;
begin
  select company_id into caller_company
  from public.profiles
  where id = auth.uid() and status = 'active' and role in ('super_admin', 'admin');

  if caller_company is null then
    raise exception 'Admin access required';
  end if;

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'totalDepartments', (select count(*) from public.departments where company_id = caller_company),
      'totalMembers', (select count(*) from public.profiles where company_id = caller_company and status = 'active'),
      'departmentHeads', (
        select count(*)
        from public.profiles
        where company_id = caller_company
          and status = 'active'
          and role in ('super_admin', 'admin', 'manager')
      ),
      'avgCompletion', coalesce((
        select round((count(*) filter (where status = 'completed')::numeric / nullif(count(*), 0)::numeric) * 100)::integer
        from public.tasks
        where company_id = caller_company
      ), 0)
    ),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'description', d.description,
        'priority', d.priority,
        'memberCount', coalesce(m.member_count, 0),
        'taskCount', coalesce(t.task_count, 0),
        'openTaskCount', coalesce(t.open_task_count, 0),
        'completionRate', coalesce(t.completion_rate, 0),
        'headName', coalesce(h.head_name, 'Unassigned'),
        'headRole', h.head_role,
        'members', coalesce(m.members, '[]'::jsonb)
      ) order by
        case d.priority when 'urgent' then 1 when 'high' then 2 when 'medium' then 3 when 'low' then 4 else 5 end,
        d.name)
      from public.departments d
      left join lateral (
        select
          count(*)::integer as member_count,
          jsonb_agg(jsonb_build_object(
            'id', p.id,
            'name', coalesce(p.full_name, p.first_name, p.email, 'Member'),
            'email', p.email,
            'avatarUrl', p.avatar_url,
            'role', p.role,
            'status', p.status
          ) order by p.role, p.full_name, p.email) as members
        from public.profiles p
        where p.department_id = d.id
          and p.company_id = caller_company
      ) m on true
      left join lateral (
        select
          count(*)::integer as task_count,
          count(*) filter (where status not in ('completed', 'cancelled'))::integer as open_task_count,
          coalesce(round((count(*) filter (where status = 'completed')::numeric / nullif(count(*), 0)::numeric) * 100)::integer, 0) as completion_rate
        from public.tasks task
        where task.company_id = caller_company
          and task.department_id = d.id
      ) t on true
      left join lateral (
        select coalesce(p.full_name, p.first_name, p.email, 'Department head') as head_name,
               p.role as head_role
        from public.profiles p
        where p.company_id = caller_company
          and p.department_id = d.id
          and p.status = 'active'
          and p.role in ('super_admin', 'admin', 'manager')
        order by case p.role when 'super_admin' then 1 when 'admin' then 2 when 'manager' then 3 else 4 end, p.created_at
        limit 1
      ) h on true
      where d.company_id = caller_company
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_admin_departments_data() to authenticated;

create or replace function public.get_admin_tasks_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller_company uuid;
begin
  select company_id into caller_company
  from public.profiles
  where id = auth.uid() and status = 'active' and role in ('super_admin', 'admin', 'manager');

  if caller_company is null then
    raise exception 'Manager access required';
  end if;

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'totalTasks', (select count(*) from public.tasks where company_id = caller_company),
      'assignedToDepartments', (select count(*) from public.tasks where company_id = caller_company and department_id is not null and assignee_id is null),
      'assignedToEmployees', (select count(*) from public.tasks where company_id = caller_company and assignee_id is not null),
      'inProgress', (select count(*) from public.tasks where company_id = caller_company and status = 'in_progress'),
      'completed', (select count(*) from public.tasks where company_id = caller_company and status = 'completed')
    ),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'priority', d.priority
      ) order by d.name)
      from public.departments d
      where d.company_id = caller_company
    ), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(p.full_name, p.first_name, p.email, 'Member'),
        'email', p.email,
        'avatarUrl', p.avatar_url,
        'role', p.role,
        'departmentId', p.department_id,
        'departmentName', d.name
      ) order by d.name, p.full_name, p.email)
      from public.profiles p
      left join public.departments d on d.id = p.department_id
      where p.company_id = caller_company and p.status = 'active'
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'description', t.description,
        'status', t.status,
        'priority', t.priority,
        'departmentId', t.department_id,
        'departmentName', d.name,
        'assigneeId', t.assignee_id,
        'assigneeName', coalesce(p.full_name, p.first_name, p.email),
        'assigneeAvatarUrl', p.avatar_url,
        'createdBy', t.created_by,
        'dueDate', t.due_date,
        'createdAt', t.created_at
      ) order by t.created_at desc)
      from public.tasks t
      left join public.departments d on d.id = t.department_id
      left join public.profiles p on p.id = t.assignee_id
      where t.company_id = caller_company
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_admin_tasks_data() to authenticated;

create or replace function public.assign_admin_task(
  task_title text,
  task_description text default null,
  task_priority public.task_priority default 'medium',
  target_department uuid default null,
  target_assignee uuid default null,
  target_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  new_task uuid;
begin
  if caller is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_manager() then
    raise exception 'Only admins and managers can assign tasks';
  end if;

  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'No active organization found';
  end if;

  if target_department is not null
     and not exists (select 1 from public.departments where id = target_department and company_id = caller_company) then
    raise exception 'That department does not belong to your organization';
  end if;

  if target_assignee is not null then
    if not exists (
      select 1 from public.profiles
      where id = target_assignee
        and company_id = caller_company
        and status = 'active'
        and (target_department is null or department_id = target_department)
    ) then
      raise exception 'Assignee must be an active member of the selected department';
    end if;
  end if;

  insert into public.tasks (
    company_id, department_id, title, description, status, priority, assignee_id, created_by, due_date
  )
  values (
    caller_company, target_department, trim(task_title), nullif(trim(coalesce(task_description, '')), ''), 'todo', task_priority, target_assignee, caller, target_due_date
  )
  returning id into new_task;

  insert into public.activity_log (company_id, actor_id, action, entity_type, entity_id, summary)
  values (caller_company, caller, 'task.assigned', 'task', new_task, 'Task assigned: ' || trim(task_title));

  if target_assignee is not null then
    insert into public.notifications (company_id, profile_id, title, body, link)
    values (caller_company, target_assignee, 'New task assigned', trim(task_title), '/tasks');
  else
    insert into public.notifications (company_id, profile_id, title, body, link)
    select caller_company, p.id, 'New department task', trim(task_title), '/tasks'
    from public.profiles p
    where p.company_id = caller_company
      and p.status = 'active'
      and p.department_id = target_department
      and p.role in ('admin', 'manager');
  end if;

  return new_task;
end;
$$;

grant execute on function public.assign_admin_task(text, text, public.task_priority, uuid, uuid, date) to authenticated;

create or replace function public.reassign_admin_task(
  target_task uuid,
  target_department uuid default null,
  target_assignee uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_company uuid;
begin
  if not public.is_manager() then
    raise exception 'Only admins and managers can reassign tasks';
  end if;

  select company_id into caller_company
  from public.profiles
  where id = auth.uid() and status = 'active';

  if caller_company is null then
    raise exception 'No active organization found';
  end if;

  if target_department is not null
     and not exists (select 1 from public.departments where id = target_department and company_id = caller_company) then
    raise exception 'That department does not belong to your organization';
  end if;

  if target_assignee is not null
     and not exists (
       select 1 from public.profiles
       where id = target_assignee
         and company_id = caller_company
         and status = 'active'
         and (target_department is null or department_id = target_department)
     ) then
    raise exception 'Assignee must be an active member of the selected department';
  end if;

  update public.tasks
     set department_id = target_department,
         assignee_id = target_assignee,
         updated_at = now()
   where id = target_task
     and company_id = caller_company;

  if not found then
    raise exception 'Task not found';
  end if;

  insert into public.activity_log (company_id, actor_id, action, entity_type, entity_id, summary)
  values (caller_company, auth.uid(), 'task.reassigned', 'task', target_task, 'Task reassigned');
end;
$$;

grant execute on function public.reassign_admin_task(uuid, uuid, uuid) to authenticated;
