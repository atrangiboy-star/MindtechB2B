-- Enforce verified authenticator MFA (AAL2) on every authenticated data path.
-- Apply after schema.sql and all workspace migrations, including department-archive-migration.sql.

begin;

create or replace function public.has_explicit_board_access(board_key uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (auth.jwt()->>'aal') = 'aal2' and exists (
    select 1 from public.board_access a
    where a.board_id = board_key
      and lower(a.email) = lower(auth.jwt()->>'email')
  );
$$;
grant execute on function public.has_explicit_board_access(uuid) to authenticated;

create or replace function public.can_access_department(dept_name text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (auth.jwt()->>'aal') = 'aal2' and (
    public.is_workspace_admin()
    or exists (
      select 1 from public.departments d
      where d.name = dept_name and d.is_active
        and (
          exists (select 1 from public.profiles p where p.id = auth.uid() and p.department = dept_name)
          or exists (
            select 1 from public.department_access da
            where da.department_id = d.id and lower(da.email) = lower(auth.jwt()->>'email')
          )
        )
    )
  );
$$;
grant execute on function public.can_access_department(text) to authenticated;

create or replace function public.can_access_board(board_key uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (auth.jwt()->>'aal') = 'aal2' and (
    public.is_workspace_admin()
    or exists (
      select 1 from public.boards b
      where b.id = board_key and b.department_id is null
        and public.has_explicit_board_access(b.id)
    )
    or exists (
      select 1 from public.boards b
      join public.departments d on d.id = b.department_id
      where b.id = board_key and d.is_active
        and (public.has_explicit_board_access(b.id) or public.can_access_department(d.name))
    )
  );
$$;
grant execute on function public.can_access_board(uuid) to authenticated;

create or replace function public.can_manage_board_columns(board_key uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (auth.jwt()->>'aal') = 'aal2' and (
    public.is_workspace_admin()
    or exists (
      select 1 from public.boards b
      join public.departments d on d.id = b.department_id
      where b.id = board_key and d.is_active and public.can_access_department(d.name)
    )
  );
$$;
grant execute on function public.can_manage_board_columns(uuid) to authenticated;

create or replace function public.can_access_task(task_key text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select (auth.jwt()->>'aal') = 'aal2' and (
    public.is_workspace_admin()
    or exists (
      select 1 from public.workspace_tasks t
      where t.id = task_key
        and (public.can_access_department(t.department) or public.can_access_board(t.board_id))
    )
  );
$$;
grant execute on function public.can_access_task(text) to authenticated;

drop policy if exists "department access self or admin read" on public.department_access;
create policy "department access self or admin read" on public.department_access
  for select to authenticated
  using (
    (auth.jwt()->>'aal') = 'aal2'
    and (
      public.is_workspace_admin()
      or (lower(email) = lower(auth.jwt()->>'email') and exists (
        select 1 from public.departments d
        where d.id = department_access.department_id and d.is_active
      ))
    )
  );

drop policy if exists "owners manage saved views" on public.saved_views;
create policy "owners manage saved views" on public.saved_views
  for all to authenticated
  using (
    (auth.jwt()->>'aal') = 'aal2'
    and (owner_id = auth.uid() or public.is_workspace_admin())
  )
  with check (
    (auth.jwt()->>'aal') = 'aal2'
    and (owner_id = auth.uid() or public.is_workspace_admin())
  );

commit;
