-- ============================================================================
-- Employee dashboard, chat, task, and request RPCs
-- ============================================================================

alter table public.departments
  add column if not exists bio text;

alter table public.chat_channels
  add column if not exists department_id uuid references public.departments (id) on delete cascade,
  add column if not exists channel_type text not null default 'general',
  add column if not exists direct_key text;

alter table public.chat_channels
  drop constraint if exists chat_channels_channel_type_check;

alter table public.chat_channels
  add constraint chat_channels_channel_type_check
  check (channel_type in ('general', 'department', 'direct'));

create unique index if not exists chat_channels_department_unique_idx
  on public.chat_channels (company_id, department_id)
  where channel_type = 'department' and department_id is not null;

create unique index if not exists chat_channels_direct_unique_idx
  on public.chat_channels (company_id, direct_key)
  where channel_type = 'direct' and direct_key is not null;

update public.departments
   set bio = coalesce(bio, description, 'Team channel for department updates, handoffs, and daily collaboration.');

update public.chat_channels
   set channel_type = case when is_direct then 'direct' else 'general' end
 where channel_type = 'general';

create or replace function public.ensure_employee_chat_channels(target_company uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_channels (company_id, department_id, name, channel_type, is_direct)
  select d.company_id, d.id, d.name, 'department', false
  from public.departments d
  where d.company_id = target_company
  on conflict (company_id, department_id)
  where channel_type = 'department' and department_id is not null
  do update set name = excluded.name;

  insert into public.chat_channel_members (channel_id, profile_id)
  select c.id, p.id
  from public.chat_channels c
  join public.profiles p on p.company_id = c.company_id
  where c.company_id = target_company
    and c.channel_type = 'department'
    and p.status = 'active'
  on conflict (channel_id, profile_id) do nothing;
end;
$$;

grant execute on function public.ensure_employee_chat_channels(uuid) to authenticated;

create or replace function public.ensure_department_chat_channel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_employee_chat_channels(new.company_id);
  return new;
end;
$$;

drop trigger if exists ensure_department_chat_channel on public.departments;
create trigger ensure_department_chat_channel
  after insert or update of name on public.departments
  for each row execute function public.ensure_department_chat_channel();

do $$
declare
  company_row record;
begin
  for company_row in select id from public.companies loop
    perform public.ensure_employee_chat_channels(company_row.id);
  end loop;
end $$;

create or replace function public.get_employee_dashboard_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  caller_department uuid;
begin
  select company_id, department_id into caller_company, caller_department
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'No active organization found';
  end if;

  return jsonb_build_object(
    'stats', jsonb_build_object(
      'myTasks', (
        select count(*)
        from public.tasks
        where company_id = caller_company
          and status not in ('completed', 'cancelled')
          and (assignee_id = caller or (assignee_id is null and department_id = caller_department))
      ),
      'completedTasks', (
        select count(*)
        from public.tasks
        where company_id = caller_company
          and status = 'completed'
          and (assignee_id = caller or (assignee_id is null and department_id = caller_department))
      ),
      'myRequests', (
        select count(*)
        from public.requests
        where company_id = caller_company
          and requester_id = caller
      ),
      'departmentMessages', (
        select count(*)
        from public.chat_messages m
        join public.chat_channels c on c.id = m.channel_id
        where c.company_id = caller_company
          and c.channel_type = 'department'
          and m.created_at >= now() - interval '24 hours'
      )
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'description', t.description,
        'status', t.status,
        'priority', t.priority,
        'departmentName', d.name,
        'dueDate', t.due_date,
        'createdAt', t.created_at
      ) order by t.due_date asc nulls last, t.created_at desc)
      from public.tasks t
      left join public.departments d on d.id = t.department_id
      where t.company_id = caller_company
        and t.status not in ('completed', 'cancelled')
        and (t.assignee_id = caller or (t.assignee_id is null and t.department_id = caller_department))
      limit 6
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'status', r.status,
        'priority', r.priority,
        'toDepartmentName', d.name,
        'createdAt', r.created_at
      ) order by r.created_at desc)
      from public.requests r
      left join public.departments d on d.id = r.to_department_id
      where r.company_id = caller_company
        and r.requester_id = caller
      limit 5
    ), '[]'::jsonb),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'description', d.description,
        'bio', d.bio,
        'memberCount', coalesce(m.member_count, 0)
      ) order by d.name)
      from public.departments d
      left join lateral (
        select count(*)::integer as member_count
        from public.profiles p
        where p.company_id = caller_company
          and p.department_id = d.id
          and p.status = 'active'
      ) m on true
      where d.company_id = caller_company
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_employee_dashboard_data() to authenticated;

create or replace function public.get_employee_tasks_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  caller_department uuid;
begin
  select company_id, department_id into caller_company, caller_department
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'No active organization found';
  end if;

  return jsonb_build_object(
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
        'assignedToMe', t.assignee_id = caller,
        'createdByName', coalesce(author.full_name, author.first_name, author.email, 'Admin'),
        'dueDate', t.due_date,
        'completedAt', t.completed_at,
        'createdAt', t.created_at,
        'checklistDone', coalesce(items.done_count, 0),
        'checklistTotal', coalesce(items.total_count, 0),
        'commentCount', coalesce(comments.comment_count, 0)
      ) order by
        case t.status when 'todo' then 1 when 'in_progress' then 2 when 'review' then 3 when 'completed' then 4 else 5 end,
        t.due_date asc nulls last,
        t.created_at desc)
      from public.tasks t
      left join public.departments d on d.id = t.department_id
      left join public.profiles author on author.id = t.created_by
      left join lateral (
        select count(*)::integer as total_count,
               count(*) filter (where is_done)::integer as done_count
        from public.task_checklist_items i
        where i.task_id = t.id
      ) items on true
      left join lateral (
        select count(*)::integer as comment_count
        from public.task_comments c
        where c.task_id = t.id
      ) comments on true
      where t.company_id = caller_company
        and (t.assignee_id = caller or (t.assignee_id is null and t.department_id = caller_department))
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_employee_tasks_data() to authenticated;

create or replace function public.complete_employee_task(target_task uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  caller_department uuid;
  task_title text;
begin
  select company_id, department_id into caller_company, caller_department
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'No active organization found';
  end if;

  update public.tasks
     set status = 'completed',
         completed_at = now(),
         updated_at = now()
   where id = target_task
     and company_id = caller_company
     and (assignee_id = caller or (assignee_id is null and department_id = caller_department))
   returning title into task_title;

  if task_title is null then
    raise exception 'Task not found for your department';
  end if;

  insert into public.activity_log (company_id, actor_id, action, entity_type, entity_id, summary)
  values (caller_company, caller, 'task.completed', 'task', target_task, 'Completed task: ' || task_title);
end;
$$;

grant execute on function public.complete_employee_task(uuid) to authenticated;

create or replace function public.get_employee_requests_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  caller_department uuid;
begin
  select company_id, department_id into caller_company, caller_department
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'No active organization found';
  end if;

  return jsonb_build_object(
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name) order by d.name)
      from public.departments d
      where d.company_id = caller_company
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'title', r.title,
        'description', r.description,
        'status', r.status,
        'priority', r.priority,
        'fromDepartmentName', from_d.name,
        'toDepartmentName', to_d.name,
        'requesterName', coalesce(p.full_name, p.first_name, p.email, 'Member'),
        'mine', r.requester_id = caller,
        'dueDate', r.due_date,
        'createdAt', r.created_at
      ) order by r.created_at desc)
      from public.requests r
      left join public.departments from_d on from_d.id = r.from_department_id
      left join public.departments to_d on to_d.id = r.to_department_id
      left join public.profiles p on p.id = r.requester_id
      where r.company_id = caller_company
        and (r.requester_id = caller or r.to_department_id = caller_department)
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_employee_requests_data() to authenticated;

create or replace function public.create_employee_request(
  request_title text,
  request_description text default null,
  target_department uuid default null,
  request_priority public.task_priority default 'medium',
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
  caller_department uuid;
  new_request uuid;
begin
  select company_id, department_id into caller_company, caller_department
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'No active organization found';
  end if;

  if target_department is not null
     and not exists (select 1 from public.departments where id = target_department and company_id = caller_company) then
    raise exception 'That department does not belong to your organization';
  end if;

  insert into public.requests (
    company_id, title, description, requester_id, from_department_id, to_department_id, priority, due_date, status
  )
  values (
    caller_company, trim(request_title), nullif(trim(coalesce(request_description, '')), ''), caller,
    caller_department, target_department, request_priority, target_due_date, 'pending'
  )
  returning id into new_request;

  insert into public.activity_log (company_id, actor_id, action, entity_type, entity_id, summary)
  values (caller_company, caller, 'request.created', 'request', new_request, 'Created request: ' || trim(request_title));

  insert into public.notifications (company_id, profile_id, title, body, link)
  select caller_company, p.id, 'New department request', trim(request_title), '/requests'
  from public.profiles p
  where p.company_id = caller_company
    and p.status = 'active'
    and p.department_id = target_department
    and p.role in ('super_admin', 'admin', 'manager');

  return new_request;
end;
$$;

grant execute on function public.create_employee_request(text, text, uuid, public.task_priority, date) to authenticated;

create or replace function public.get_employee_chat_data()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
begin
  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'No active organization found';
  end if;

  perform public.ensure_employee_chat_channels(caller_company);

  return jsonb_build_object(
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'name', d.name,
        'description', d.description,
        'bio', d.bio,
        'channelId', c.id,
        'memberCount', coalesce(m.member_count, 0)
      ) order by d.name)
      from public.departments d
      left join public.chat_channels c on c.company_id = d.company_id and c.department_id = d.id and c.channel_type = 'department'
      left join lateral (
        select count(*)::integer as member_count
        from public.profiles p
        where p.company_id = caller_company
          and p.department_id = d.id
          and p.status = 'active'
      ) m on true
      where d.company_id = caller_company
    ), '[]'::jsonb),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'name', coalesce(p.full_name, p.first_name, p.email, 'Member'),
        'email', p.email,
        'avatarUrl', p.avatar_url,
        'departmentName', d.name
      ) order by d.name, p.full_name, p.email)
      from public.profiles p
      left join public.departments d on d.id = p.department_id
      where p.company_id = caller_company
        and p.status = 'active'
        and p.id <> caller
    ), '[]'::jsonb),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', case
          when c.channel_type = 'direct' then coalesce(dm.dm_name, 'Direct message')
          else coalesce(c.name, d.name, 'Channel')
        end,
        'channelType', c.channel_type,
        'departmentId', c.department_id,
        'departmentName', d.name,
        'isDirect', c.is_direct,
        'messages', coalesce(msg.messages, '[]'::jsonb)
      ) order by c.channel_type, coalesce(c.name, d.name, dm.dm_name))
      from public.chat_channels c
      join public.chat_channel_members mine on mine.channel_id = c.id and mine.profile_id = caller
      left join public.departments d on d.id = c.department_id
      left join lateral (
        select coalesce(p.full_name, p.first_name, p.email, 'Direct message') as dm_name
        from public.chat_channel_members m
        join public.profiles p on p.id = m.profile_id
        where m.channel_id = c.id and p.id <> caller
        limit 1
      ) dm on true
      left join lateral (
        select jsonb_agg(jsonb_build_object(
          'id', listed.id,
          'body', listed.body,
          'createdAt', listed.created_at,
          'senderId', listed.sender_id,
          'senderName', listed.sender_name,
          'senderAvatarUrl', listed.sender_avatar_url
        ) order by listed.created_at) as messages
        from (
          select m.id,
                 m.body,
                 m.created_at,
                 m.sender_id,
                 coalesce(p.full_name, p.first_name, p.email, 'Member') as sender_name,
                 p.avatar_url as sender_avatar_url
          from public.chat_messages m
          left join public.profiles p on p.id = m.sender_id
          where m.channel_id = c.id
          order by m.created_at desc
          limit 40
        ) listed
      ) msg on true
      where c.company_id = caller_company
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_employee_chat_data() to authenticated;

create or replace function public.start_employee_direct_chat(target_profile uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  sorted_key text;
  channel uuid;
begin
  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'No active organization found';
  end if;

  if target_profile = caller then
    raise exception 'Choose another team member';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = target_profile
      and company_id = caller_company
      and status = 'active'
  ) then
    raise exception 'Team member not found';
  end if;

  sorted_key := least(caller::text, target_profile::text) || ':' || greatest(caller::text, target_profile::text);

  insert into public.chat_channels (company_id, name, is_direct, channel_type, direct_key, created_by)
  values (caller_company, null, true, 'direct', sorted_key, caller)
  on conflict (company_id, direct_key)
  where channel_type = 'direct' and direct_key is not null
  do update set is_direct = true
  returning id into channel;

  insert into public.chat_channel_members (channel_id, profile_id)
  values (channel, caller), (channel, target_profile)
  on conflict (channel_id, profile_id) do nothing;

  return channel;
end;
$$;

grant execute on function public.start_employee_direct_chat(uuid) to authenticated;

create or replace function public.send_employee_chat_message(target_channel uuid, message_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_company uuid;
  new_message uuid;
begin
  select company_id into caller_company
  from public.profiles
  where id = caller and status = 'active';

  if caller_company is null then
    raise exception 'No active organization found';
  end if;

  if length(trim(coalesce(message_body, ''))) = 0 then
    raise exception 'Message cannot be empty';
  end if;

  if not exists (
    select 1
    from public.chat_channels c
    join public.chat_channel_members m on m.channel_id = c.id
    where c.id = target_channel
      and c.company_id = caller_company
      and m.profile_id = caller
  ) then
    raise exception 'You are not a member of this channel';
  end if;

  insert into public.chat_messages (channel_id, sender_id, body)
  values (target_channel, caller, trim(message_body))
  returning id into new_message;

  return new_message;
end;
$$;

grant execute on function public.send_employee_chat_message(uuid, text) to authenticated;
