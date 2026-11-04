-- Permanently purge an already archived department and all of its saved work.
-- Run in the MindTechB2B Supabase SQL editor after department-archive-migration.sql.

create or replace function public.purge_archived_department(target_department_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  department_name text;
  department_active boolean;
begin
  if not public.is_super_admin() then
    raise exception 'Only the Super Admin can permanently delete archived departments';
  end if;

  select d.name, d.is_active
    into department_name, department_active
  from public.departments d
  where d.id = target_department_id
  for update;

  if department_name is null then
    raise exception 'Department was not found';
  end if;
  if department_active then
    raise exception 'Archive the department before permanently deleting it';
  end if;

  delete from public.task_activity a
  where a.task_id in (
    select t.id
    from public.workspace_tasks t
    where t.board_id in (
      select b.id from public.boards b where b.department_id = target_department_id
    ) or (t.board_id is null and t.department = department_name)
  );

  delete from public.workspace_tasks t
  where t.board_id in (
    select b.id from public.boards b where b.department_id = target_department_id
  ) or (t.board_id is null and t.department = department_name);

  delete from public.boards b where b.department_id = target_department_id;
  delete from public.department_access da where da.department_id = target_department_id;
  update public.profiles p set department = null where p.department = department_name;
  delete from public.departments d where d.id = target_department_id;

  return department_name;
end;
$$;

revoke all on function public.purge_archived_department(uuid) from public;
revoke all on function public.purge_archived_department(uuid) from anon;
grant execute on function public.purge_archived_department(uuid) to authenticated;
