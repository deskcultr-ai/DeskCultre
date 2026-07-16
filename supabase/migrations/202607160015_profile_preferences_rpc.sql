begin;
create or replace function public.update_my_profile(profile_display_name text, profile_birthday date, profile_gender text, profile_job_title text, profile_bio text, profile_timezone text, profile_avatar_url text, profile_avatar_visibility text, profile_availability text, profile_email_visibility text, profile_phone_visibility text)
returns public.profiles language plpgsql security definer set search_path=public as $$
declare result public.profiles%rowtype;
begin
 if profile_gender is not null and profile_gender not in ('female','male','non_binary','prefer_not_to_say') then raise exception 'Invalid gender'; end if;
 if profile_avatar_visibility not in ('workspace','private') or profile_email_visibility not in ('workspace','private') or profile_phone_visibility not in ('workspace','private') then raise exception 'Invalid visibility'; end if;
 if profile_availability not in ('available','away','do_not_disturb') then raise exception 'Invalid availability'; end if;
 update public.profiles set display_name=nullif(btrim(profile_display_name),''), birthday=profile_birthday, gender=profile_gender, job_title=nullif(btrim(profile_job_title),''), bio=nullif(btrim(profile_bio),''), timezone=coalesce(nullif(btrim(profile_timezone),''),'UTC'), avatar_url=nullif(btrim(profile_avatar_url),''), avatar_visibility=profile_avatar_visibility, availability=profile_availability, email_visibility=profile_email_visibility, phone_visibility=profile_phone_visibility where id=auth.uid() returning * into result;
 return result;
end; $$;
grant execute on function public.update_my_profile(text,date,text,text,text,text,text,text,text,text,text) to authenticated;
commit;
