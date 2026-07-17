begin;
update public.attendance_policies set workday_start='10:00', workday_end='18:30';
alter table public.attendance_policies alter column workday_start set default '10:00';
alter table public.attendance_policies alter column workday_end set default '18:30';
commit;
