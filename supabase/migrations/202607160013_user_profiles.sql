begin;
alter table public.profiles add column if not exists avatar_url text, add column if not exists birthday date, add column if not exists gender text, add column if not exists job_title text, add column if not exists display_name text, add column if not exists bio text, add column if not exists timezone text default 'UTC', add column if not exists avatar_visibility text not null default 'workspace' check (avatar_visibility in ('workspace','private'));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('avatars','avatars',true,2097152,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create or replace function public.update_my_profile(profile_display_name text, profile_birthday date, profile_gender text, profile_job_title text, profile_bio text, profile_timezone text, profile_avatar_url text, profile_avatar_visibility text)
returns public.profiles language plpgsql security definer set search_path=public as $$
declare result public.profiles%rowtype;
begin
 if profile_gender is not null and profile_gender not in ('female','male','non_binary','prefer_not_to_say') then raise exception 'Invalid gender'; end if;
 if profile_avatar_visibility not in ('workspace','private') then raise exception 'Invalid avatar visibility'; end if;
 update public.profiles set display_name=nullif(btrim(profile_display_name),''), birthday=profile_birthday, gender=profile_gender, job_title=nullif(btrim(profile_job_title),''), bio=nullif(btrim(profile_bio),''), timezone=coalesce(nullif(btrim(profile_timezone),''),'UTC'), avatar_url=nullif(btrim(profile_avatar_url),''), avatar_visibility=profile_avatar_visibility where id=auth.uid() returning * into result;
 if not found then raise exception 'Profile not found'; end if;
 return result;
end; $$;
alter table storage.objects enable row level security;
create policy avatars_public_read on storage.objects for select using (bucket_id='avatars');
create policy avatars_owner_insert on storage.objects for insert to authenticated with check (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatars_owner_delete on storage.objects for delete to authenticated using (bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
grant execute on function public.update_my_profile(text,date,text,text,text,text,text,text) to authenticated;
commit;
