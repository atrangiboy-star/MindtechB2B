-- Private organization profile photos. Members read company photos; each user
-- may create, replace, or delete only their own image.
create table if not exists public.member_photos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  image_data text not null check (length(image_data) between 1 and 500000),
  updated_at timestamptz not null default now()
);
alter table public.member_photos enable row level security;
drop policy if exists "company members read profile photos" on public.member_photos;
drop policy if exists "members add own profile photo" on public.member_photos;
drop policy if exists "members update own profile photo" on public.member_photos;
drop policy if exists "members delete own profile photo" on public.member_photos;
create policy "company members read profile photos" on public.member_photos
  for select to authenticated using (public.is_company_workspace_user());
create policy "members add own profile photo" on public.member_photos
  for insert to authenticated with check (user_id=auth.uid() and public.is_company_workspace_user());
create policy "members update own profile photo" on public.member_photos
  for update to authenticated using (user_id=auth.uid() and public.is_company_workspace_user())
  with check (user_id=auth.uid() and public.is_company_workspace_user());
create policy "members delete own profile photo" on public.member_photos
  for delete to authenticated using (user_id=auth.uid() and public.is_company_workspace_user());
grant select,insert,update,delete on public.member_photos to authenticated;

