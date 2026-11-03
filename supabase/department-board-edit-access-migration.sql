-- Let members granted department access work in their department's shared board.
-- Apply after role-departments-comments-logs-migration.sql and board-access-migration.sql.

create or replace function public.has_explicit_board_access(board_key uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.board_access a
    where a.board_id=board_key and lower(a.email)=lower(auth.jwt()->>'email')
  );
$$;
grant execute on function public.has_explicit_board_access(uuid) to authenticated;

create or replace function public.can_access_board(board_key uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_admin()
    or public.has_explicit_board_access(board_key)
    or exists (
      select 1 from public.boards b
      join public.departments d on (b.department_id is null or d.id=b.department_id)
      where b.id=board_key and public.can_access_department(d.name)
    );
$$;
grant execute on function public.can_access_board(uuid) to authenticated;

create or replace function public.can_manage_board_columns(board_key uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_admin()
    or exists (
      select 1 from public.boards b
      join public.departments d on (b.department_id is null or d.id=b.department_id)
      where b.id=board_key and public.can_access_department(d.name)
    );
$$;
grant execute on function public.can_manage_board_columns(uuid) to authenticated;

create or replace function public.can_access_task(task_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_admin() or exists (
    select 1 from public.workspace_tasks t
    where t.id=task_key and (
      public.can_access_department(t.department)
      or public.has_explicit_board_access(t.board_id)
    )
  );
$$;
grant execute on function public.can_access_task(text) to authenticated;

drop policy if exists "company boards readable" on public.boards;
drop policy if exists "department members read boards" on public.boards;
create policy "department members read boards" on public.boards for select to authenticated
  using (public.can_access_board(id));

drop policy if exists "company board columns readable" on public.board_columns;
drop policy if exists "department members read board columns" on public.board_columns;
create policy "department members read board columns" on public.board_columns for select to authenticated
  using (public.can_access_board(board_id));

drop policy if exists "admins manage board columns" on public.board_columns;
drop policy if exists "department members manage board columns" on public.board_columns;
create policy "department members manage board columns" on public.board_columns for all to authenticated
  using (
    public.can_manage_board_columns(board_id)
    and (column_type <> 'formula' or public.is_workspace_admin())
  )
  with check (
    public.can_manage_board_columns(board_id)
    and (column_type <> 'formula' or public.is_workspace_admin())
  );

-- Keep department scoped rows even though department members can see the shared board schema.
drop policy if exists "company employees read tasks" on public.workspace_tasks;
drop policy if exists "admin or department member reads tasks" on public.workspace_tasks;
drop policy if exists "department members read assigned tasks" on public.workspace_tasks;
create policy "department members read assigned tasks" on public.workspace_tasks for select to authenticated
  using (public.can_access_task(id));

drop policy if exists "company employees create tasks" on public.workspace_tasks;
drop policy if exists "admin or department member creates tasks" on public.workspace_tasks;
drop policy if exists "department members create assigned tasks" on public.workspace_tasks;
create policy "department members create assigned tasks" on public.workspace_tasks for insert to authenticated
  with check (
    public.is_company_workspace_user()
    and (created_by is null or created_by=auth.uid())
    and (public.is_workspace_admin() or public.can_access_department(department) or public.has_explicit_board_access(board_id))
  );

drop policy if exists "company employees update tasks" on public.workspace_tasks;
drop policy if exists "admin or department member updates tasks" on public.workspace_tasks;
drop policy if exists "department members update assigned tasks" on public.workspace_tasks;
create policy "department members update assigned tasks" on public.workspace_tasks for update to authenticated
  using (public.can_access_task(id))
  with check (public.can_access_task(id));

