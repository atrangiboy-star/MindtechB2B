-- MindTechB2B RBAC, department access, per-cell comments, and scoped activity logs.
-- Apply after schema.sql, board-access-migration.sql, and member-photos-migration.sql.

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('Super Admin','Administrator','Department Manager','Team Lead','Team Member'));
update public.profiles set role='Super Admin' where lower(email)='amaan.d@mindtechb2b.com';

create table if not exists public.department_access (
  department_id uuid not null references public.departments(id) on delete cascade,
  email text not null check (split_part(lower(email),'@',2)='mindtechb2b.com'),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (department_id,email)
);

alter table public.task_comments add column if not exists column_id uuid references public.board_columns(id) on delete cascade;
alter table public.task_comments add column if not exists column_name text not null default 'Task';

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.jwt()->>'aal')='aal2' and (
    lower(coalesce(auth.jwt()->>'email',''))='amaan.d@mindtechb2b.com'
    or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Super Admin')
  );
$$;
create or replace function public.is_workspace_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.jwt()->>'aal')='aal2' and (
    public.is_super_admin()
    or exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='Administrator')
  );
$$;
create or replace function public.can_access_department(dept_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_admin() or exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.department=dept_name
  ) or exists (
    select 1 from public.department_access da join public.departments d on d.id=da.department_id
    where lower(da.email)=lower(auth.jwt()->>'email') and d.name=dept_name
  );
$$;
create or replace function public.can_access_task(task_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_workspace_admin() or exists (
    select 1 from public.workspace_tasks t
    where t.id=task_key and (
      public.can_access_department(t.department)
      or public.can_access_board(t.board_id)
    )
  );
$$;

alter table public.department_access enable row level security;
drop policy if exists "department access self or admin read" on public.department_access;
drop policy if exists "super admins manage department access" on public.department_access;
create policy "department access self or admin read" on public.department_access for select to authenticated
  using (public.is_workspace_admin() or lower(email)=lower(auth.jwt()->>'email'));
create policy "super admins manage department access" on public.department_access for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
grant select,insert,update,delete on public.department_access to authenticated;

-- Superadmins can assign any workspace role; regular admins retain all existing admin operations,
-- but cannot promote users or grant superadmin privileges.
drop policy if exists "admins manage profiles" on public.profiles;
drop policy if exists "company profiles readable" on public.profiles;
create policy "company profiles readable" on public.profiles for select to authenticated
  using (public.is_company_workspace_user());
create policy "super admins manage profiles" on public.profiles for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "company employees read tasks" on public.workspace_tasks;
create policy "admin or department member reads tasks" on public.workspace_tasks for select to authenticated
  using (public.can_access_task(id));
drop policy if exists "company employees create tasks" on public.workspace_tasks;
create policy "admin or department member creates tasks" on public.workspace_tasks for insert to authenticated
  with check (public.is_company_workspace_user() and (created_by is null or created_by=auth.uid()) and (public.is_workspace_admin() or public.can_access_department(department) or public.can_access_board(board_id)));
drop policy if exists "company employees update tasks" on public.workspace_tasks;
create policy "admin or department member updates tasks" on public.workspace_tasks for update to authenticated
  using (public.can_access_task(id)) with check (public.can_access_task(id));

-- All workspace admins can view logs; members only see activity for their department. The superadmin
-- can read every department's activity. Policy evaluates against the task's current department.
drop policy if exists "company task activity read" on public.task_activity;
create policy "scoped task activity read" on public.task_activity for select to authenticated
  using (public.is_super_admin() or public.can_access_department(coalesce(after_value->>'department',before_value->>'department')));

-- Per-cell comments inherit the task's department and board access rules.
drop policy if exists "company comments read" on public.task_comments;
drop policy if exists "company comments add" on public.task_comments;
create policy "scoped cell comments read" on public.task_comments for select to authenticated
  using (public.can_access_task(task_id));
create policy "scoped cell comments add" on public.task_comments for insert to authenticated
  with check (author_id=auth.uid() and public.can_access_task(task_id));

drop policy if exists "company departments readable" on public.departments;
create policy "company departments readable" on public.departments for select to authenticated
  using (public.is_company_workspace_user());
drop policy if exists "admins manage departments" on public.departments;
create policy "admins manage departments" on public.departments for all to authenticated
  using (public.is_workspace_admin()) with check (public.is_workspace_admin());

