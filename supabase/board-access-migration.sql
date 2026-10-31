-- Online workspace feature fields and board-scoped access grants.
alter table public.workspace_tasks
  add column if not exists custom_fields jsonb not null default '{}'::jsonb,
  add column if not exists attachments jsonb not null default '[]'::jsonb,
  add column if not exists links jsonb not null default '[]'::jsonb;

insert into public.boards(workspace_id,name,description)
select w.id,'Main Board','Company-wide task tracker'
from public.workspaces w
where not exists (select 1 from public.boards);

insert into public.board_columns(board_id,name,column_type,position,options)
select b.id,c.name,c.column_type,c.position,c.options::jsonb
from public.boards b
cross join (values
  ('Effort','number',1,'[]'),
  ('Start date','date',2,'[]'),
  ('Tags','dropdown',3,'["Urgent","Customer","Internal"]'),
  ('Approved','checkbox',4,'[]'),
  ('Reference link','link',5,'[]')
) as c(name,column_type,position,options)
where b.name='Main Board'
on conflict(board_id,name) do nothing;

update public.workspace_tasks set board_id=(select id from public.boards order by created_at limit 1)
where board_id is null and exists(select 1 from public.boards);

create table if not exists public.board_access (
  board_id uuid not null references public.boards(id) on delete cascade,
  email text not null check (split_part(lower(email),'@',2)='mindtechb2b.com'),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(board_id,email)
);
alter table public.board_access enable row level security;
drop policy if exists "company employees read board access" on public.board_access;
drop policy if exists "admins manage board access" on public.board_access;
create policy "company employees read board access" on public.board_access for select to authenticated
using (public.is_workspace_admin() or lower(email)=lower(auth.jwt()->>'email'));
create policy "admins manage board access" on public.board_access for all to authenticated
using (public.is_workspace_admin()) with check (public.is_workspace_admin());
grant select,insert,update,delete on public.board_access to authenticated;

create or replace function public.can_access_board(board_key uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_admin() or exists (
    select 1 from public.board_access a
    where a.board_id=board_key and lower(a.email)=lower(auth.jwt()->>'email')
  );
$$;
grant execute on function public.can_access_board(uuid) to authenticated;

drop policy if exists "company boards readable" on public.boards;
create policy "company boards readable" on public.boards for select to authenticated
using (public.can_access_board(id));
drop policy if exists "company board columns readable" on public.board_columns;
create policy "company board columns readable" on public.board_columns for select to authenticated
using (public.can_access_board(board_id));
drop policy if exists "company employees read tasks" on public.workspace_tasks;
create policy "company employees read tasks" on public.workspace_tasks for select to authenticated
using (public.can_access_board(board_id));
drop policy if exists "company employees create tasks" on public.workspace_tasks;
create policy "company employees create tasks" on public.workspace_tasks for insert to authenticated
with check (public.is_company_workspace_user() and (created_by is null or created_by=auth.uid()) and public.can_access_board(board_id));
drop policy if exists "company employees update tasks" on public.workspace_tasks;
create policy "company employees update tasks" on public.workspace_tasks for update to authenticated
using (public.can_access_board(board_id)) with check (public.can_access_board(board_id));

drop policy if exists "company task collaborators read" on public.task_assignees;
create policy "company task collaborators read" on public.task_assignees for select to authenticated
using (exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)));
drop policy if exists "company task collaborators manage" on public.task_assignees;
create policy "company task collaborators manage" on public.task_assignees for all to authenticated
using (exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)))
with check (exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)));
drop policy if exists "company dependencies read" on public.task_dependencies;
create policy "company dependencies read" on public.task_dependencies for select to authenticated
using (exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)));
drop policy if exists "company dependencies manage" on public.task_dependencies;
create policy "company dependencies manage" on public.task_dependencies for all to authenticated
using (exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)))
with check (exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)));
drop policy if exists "company task links read" on public.task_links;
create policy "company task links read" on public.task_links for select to authenticated
using (exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)));
drop policy if exists "company task links manage" on public.task_links;
create policy "company task links manage" on public.task_links for all to authenticated
using (exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)))
with check (exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)));
drop policy if exists "company task activity read" on public.task_activity;
create policy "company task activity read" on public.task_activity for select to authenticated
using (exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)));
drop policy if exists "company comments read" on public.task_comments;
create policy "company comments read" on public.task_comments for select to authenticated
using (exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)));
drop policy if exists "company comments add" on public.task_comments;
create policy "company comments add" on public.task_comments for insert to authenticated
with check (author_id=auth.uid() and exists(select 1 from public.workspace_tasks t where t.id=task_id and public.can_access_board(t.board_id)));

