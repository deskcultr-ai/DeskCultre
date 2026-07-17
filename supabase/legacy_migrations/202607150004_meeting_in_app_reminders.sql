begin;

create or replace function public.send_meeting_reminders(target_meeting_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare meeting_row public.meetings%rowtype; attendee record; sent_count integer := 0;
begin
  select * into meeting_row from public.meetings where id = target_meeting_id;
  if not found or not public.is_company_manager(meeting_row.company_id) then raise exception 'Manager or admin permission required'; end if;
  if meeting_row.status <> 'scheduled' then raise exception 'Only scheduled meetings can be reminded'; end if;
  for attendee in select user_id from public.meeting_attendees where meeting_id = meeting_row.id loop
    if not exists (select 1 from public.notifications where company_id = meeting_row.company_id and user_id = attendee.user_id and notification_type = 'meeting_reminder' and title = 'Meeting reminder: ' || meeting_row.title and created_at > now() - interval '6 hours') then
      insert into public.notifications(company_id, user_id, notification_type, title, body)
      values (meeting_row.company_id, attendee.user_id, 'meeting_reminder', 'Meeting reminder: ' || meeting_row.title, 'Scheduled for ' || to_char(meeting_row.scheduled_at, 'DD Mon YYYY, HH24:MI'));
      sent_count := sent_count + 1;
    end if;
  end loop;
  return sent_count;
end; $$;

grant execute on function public.send_meeting_reminders(uuid) to authenticated;

commit;
