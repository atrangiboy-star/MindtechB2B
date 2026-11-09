-- Restrict Reports to the Super Admin, keep department names and related records scoped,
-- and persist the Super Admin's in-progress report builder draft online.

begin;

-- Department cards, pickers, and table metadata must not reveal unassigned departments.
drop policy if exists "company departments readable" on public.departments;
create policy "members read assigned departments" on public.departments
  for select to authenticated
  using (public.can_access_department(name));

-- Saved dashboard reports are managed only by the Super Admin. Keep the existing
-- administrator ownership behavior for other saved view types such as Master Tracker.
drop policy if exists "owners manage saved views" on public.saved_views;
create policy "role scoped saved views" on public.saved_views
  for all to authenticated
  using (
    (view_type='dashboard' and (auth.jwt()->>'aal')='aal2' and public.is_super_admin())
    or (view_type<>'dashboard' and (owner_id=auth.uid() or public.is_workspace_admin()))
  )
  with check (
    (view_type='dashboard' and (auth.jwt()->>'aal')='aal2' and public.is_super_admin())
    or (view_type<>'dashboard' and (owner_id=auth.uid() or public.is_workspace_admin()))
  );

create table if not exists public.report_builder_drafts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  draft jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.report_builder_drafts enable row level security;
drop policy if exists "super admin manages report builder drafts" on public.report_builder_drafts;
create policy "super admin manages report builder drafts" on public.report_builder_drafts
  for all to authenticated
  using (owner_id=auth.uid() and (auth.jwt()->>'aal')='aal2' and public.is_super_admin())
  with check (owner_id=auth.uid() and (auth.jwt()->>'aal')='aal2' and public.is_super_admin());
grant select,insert,update,delete on public.report_builder_drafts to authenticated;

-- Relationship tables inherit the department access of every referenced task.
drop policy if exists "company task collaborators read" on public.task_assignees;
drop policy if exists "company task collaborators manage" on public.task_assignees;
create policy "department scoped task collaborators read" on public.task_assignees
  for select to authenticated
  using (exists (
    select 1 from public.workspace_tasks t
    where t.id=task_assignees.task_id and public.can_access_task(t.id)
  ));
create policy "department scoped task collaborators manage" on public.task_assignees
  for all to authenticated
  using (exists (
    select 1 from public.workspace_tasks t
    where t.id=task_assignees.task_id and public.can_access_task(t.id)
  ))
  with check (exists (
    select 1 from public.workspace_tasks t
    where t.id=task_assignees.task_id and public.can_access_task(t.id)
  ));

drop policy if exists "company dependencies read" on public.task_dependencies;
drop policy if exists "company dependencies manage" on public.task_dependencies;
create policy "department scoped dependencies read" on public.task_dependencies
  for select to authenticated
  using (
    exists (select 1 from public.workspace_tasks t where t.id=task_dependencies.task_id and public.can_access_task(t.id))
    and exists (select 1 from public.workspace_tasks t where t.id=task_dependencies.depends_on_task_id and public.can_access_task(t.id))
  );
create policy "department scoped dependencies manage" on public.task_dependencies
  for all to authenticated
  using (
    exists (select 1 from public.workspace_tasks t where t.id=task_dependencies.task_id and public.can_access_task(t.id))
    and exists (select 1 from public.workspace_tasks t where t.id=task_dependencies.depends_on_task_id and public.can_access_task(t.id))
  )
  with check (
    exists (select 1 from public.workspace_tasks t where t.id=task_dependencies.task_id and public.can_access_task(t.id))
    and exists (select 1 from public.workspace_tasks t where t.id=task_dependencies.depends_on_task_id and public.can_access_task(t.id))
  );

drop policy if exists "company task links read" on public.task_links;
drop policy if exists "company task links manage" on public.task_links;
create policy "department scoped task links read" on public.task_links
  for select to authenticated
  using (
    exists (select 1 from public.workspace_tasks t where t.id=task_links.task_id and public.can_access_task(t.id))
    and exists (select 1 from public.workspace_tasks t where t.id=task_links.linked_task_id and public.can_access_task(t.id))
  );
create policy "department scoped task links manage" on public.task_links
  for all to authenticated
  using (
    exists (select 1 from public.workspace_tasks t where t.id=task_links.task_id and public.can_access_task(t.id))
    and exists (select 1 from public.workspace_tasks t where t.id=task_links.linked_task_id and public.can_access_task(t.id))
  )
  with check (
    exists (select 1 from public.workspace_tasks t where t.id=task_links.task_id and public.can_access_task(t.id))
    and exists (select 1 from public.workspace_tasks t where t.id=task_links.linked_task_id and public.can_access_task(t.id))
  );

-- Automation rules are already administered only by workspace admins in the UI.
-- Remove the broad company-wide read rule to enforce that at the database level too.
drop policy if exists "company automation rules read" on public.automation_rules;

commit;
