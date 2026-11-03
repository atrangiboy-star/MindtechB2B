-- Safely retire departments and let a table creator or Super Admin remove a department table.
-- Apply after role-departments-comments-logs-migration.sql and department-board-edit-access-migration.sql.

alter table public.departments
  add column if not exists is_active boolean not null default true;

create index if not exists departments_active_name_idx
  on public.departments (is_active, name);

create or replace function public.can_access_department(dept_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_admin() or exists (
    select 1
    from public.departments d
    where d.name = dept_name and d.is_active
      and (
        exists (select 1 from public.profiles p where p.id = auth.uid() and p.department = dept_name)
        or exists (
          select 1 from public.department_access da
          where da.department_id = d.id and lower(da.email) = lower(auth.jwt()->>'email')
        )
      )
  );
$$;

create or replace function public.can_access_board(board_key uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_admin() or exists (
    select 1
    from public.boards b
    where b.id = board_key and (
      (b.department_id is null and public.has_explicit_board_access(b.id))
      or exists (
        select 1 from public.departments d
        where d.id = b.department_id and d.is_active
          and (public.has_explicit_board_access(b.id) or public.can_access_department(d.name))
      )
    )
  );
$$;
grant execute on function public.can_access_board(uuid) to authenticated;

create or replace function public.can_access_task(task_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_admin() or exists (
    select 1 from public.workspace_tasks t
    where t.id = task_key
      and (public.can_access_department(t.department) or public.can_access_board(t.board_id))
  );
$$;
grant execute on function public.can_access_task(text) to authenticated;

-- Only Super Admins or the workspace admin who created a department table may delete it.
-- Its task rows, per-cell comments, row links, and activity history are removed together.
create or replace function public.delete_department_board(target_board_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare deleted_name text;
begin
  select b.name into deleted_name
  from public.boards b
  where b.id = target_board_id
    and b.department_id is not null
    and (
      public.is_super_admin()
      or (public.is_workspace_admin() and b.created_by = auth.uid())
    )
  for update;
  if deleted_name is null then
    raise exception 'Department table was not found or you do not have permission to delete it';
  end if;
  delete from public.task_activity
    where task_id in (select t.id from public.workspace_tasks t where t.board_id = target_board_id);
  delete from public.workspace_tasks where board_id = target_board_id;
  delete from public.boards where id = target_board_id;
  return deleted_name;
end;
$$;
revoke all on function public.delete_department_board(uuid) from public;
grant execute on function public.delete_department_board(uuid) to authenticated;

-- Block direct table deletion; deletions must go through the authorized cleanup function above.
drop policy if exists "admins manage boards" on public.boards;
drop policy if exists "workspace admins create boards" on public.boards;
drop policy if exists "workspace admins update boards" on public.boards;
drop policy if exists "super admins delete boards" on public.boards;
create policy "workspace admins create boards" on public.boards for insert to authenticated
  with check (public.is_workspace_admin());
create policy "workspace admins update boards" on public.boards for update to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());

drop policy if exists "company departments readable" on public.departments;
create policy "company departments readable" on public.departments for select to authenticated
  using (public.is_company_workspace_user() and (is_active or public.is_workspace_admin()));

drop policy if exists "admins manage departments" on public.departments;
drop policy if exists "workspace admins create departments" on public.departments;
drop policy if exists "super admins update departments" on public.departments;
create policy "workspace admins create departments" on public.departments for insert to authenticated
  with check (public.is_workspace_admin());
create policy "super admins update departments" on public.departments for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "department access self or admin read" on public.department_access;
create policy "department access self or admin read" on public.department_access for select to authenticated
  using (
    public.is_workspace_admin()
    or (lower(email) = lower(auth.jwt()->>'email') and exists (
      select 1 from public.departments d where d.id = department_access.department_id and d.is_active
    ))
  );

create or replace function public.archive_department(target_department_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare archived_name text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the Super Admin can delete a department';
  end if;
  update public.departments
    set is_active = false
    where id = target_department_id and is_active
    returning name into archived_name;
  if archived_name is null then
    raise exception 'Department was not found or is already archived';
  end if;
  return archived_name;
end;
$$;

create or replace function public.restore_department(target_department_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare restored_name text;
begin
  if not public.is_super_admin() then
    raise exception 'Only the Super Admin can restore a department';
  end if;
  update public.departments
    set is_active = true
    where id = target_department_id and not is_active
    returning name into restored_name;
  if restored_name is null then
    raise exception 'Department was not found or is already active';
  end if;
  return restored_name;
end;
$$;

revoke all on function public.archive_department(uuid) from public;
revoke all on function public.restore_department(uuid) from public;
grant execute on function public.archive_department(uuid) to authenticated;
grant execute on function public.restore_department(uuid) to authenticated;
