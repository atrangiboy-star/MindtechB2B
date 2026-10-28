-- MindTechB2B shared workspace schema
-- Run this in Supabase SQL Editor for project lbudusorkjkktspgsexf.
-- Access is restricted to authenticated users whose email ends in @mindtechb2b.com.

create extension if not exists pgcrypto;

create table if not exists public.workspace_tasks (
  id text primary key,
  title text not null check (char_length(title) between 1 and 140),
  department text not null default 'Operations',
  owner text not null default 'Unassigned',
  status text not null default 'Not started'
    check (status in ('Not started','In progress','Blocked','Done')),
  priority text not null default 'P2'
    check (priority in ('P1','P2','P3')),
  due date,
  description text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_tasks enable row level security;

drop policy if exists "MindTech employees can read workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can read workspace tasks"
on public.workspace_tasks for select to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) like '%@mindtechb2b.com');

drop policy if exists "MindTech employees can create workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can create workspace tasks"
on public.workspace_tasks for insert to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email','')) like '%@mindtechb2b.com'
  and (created_by is null or created_by = auth.uid())
);

drop policy if exists "MindTech employees can update workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can update workspace tasks"
on public.workspace_tasks for update to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) like '%@mindtechb2b.com')
with check (lower(coalesce(auth.jwt() ->> 'email','')) like '%@mindtechb2b.com');

drop policy if exists "MindTech employees can delete workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can delete workspace tasks"
on public.workspace_tasks for delete to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) like '%@mindtechb2b.com');

create index if not exists workspace_tasks_department_idx on public.workspace_tasks(department);
create index if not exists workspace_tasks_due_idx on public.workspace_tasks(due);
create index if not exists workspace_tasks_status_idx on public.workspace_tasks(status);

-- Enable Supabase Realtime updates for cross-device/team refresh.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

grant select, insert, update, delete on public.workspace_tasks to authenticated;
