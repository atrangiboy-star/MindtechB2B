-- MindTechB2B core task store.
-- Apply in Supabase SQL Editor for project lbudusorkjkktspgsexf.
-- This starter migration secures shared tasks to authenticated @mindtechb2b.com accounts.
create extension if not exists pgcrypto;

create table if not exists public.workspace_tasks (
  id text primary key,
  title text not null check (char_length(trim(title)) between 1 and 140),
  department text not null default 'Operations',
  owner text not null default 'Unassigned',
  status text not null default 'Not Started',
  priority text not null default 'P2' check (priority in ('P1','P2','P3')),
  due date,
  description text not null default '',
  progress integer not null default 0 check (progress between 0 and 100),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_tasks_status_check check (status in ('Not Started','In Progress','Under Review','Blocked','Completed'))
);

-- Bring forward an earlier installation safely.
alter table public.workspace_tasks add column if not exists progress integer not null default 0;
alter table public.workspace_tasks drop constraint if exists workspace_tasks_status_check;
update public.workspace_tasks set status = case
  when lower(status) in ('not started','not-started') then 'Not Started'
  when lower(status) in ('in progress','in-progress') then 'In Progress'
  when lower(status) in ('under review','under-review') then 'Under Review'
  when lower(status) = 'blocked' then 'Blocked'
  when lower(status) in ('done','completed') then 'Completed'
  else 'Not Started' end;
alter table public.workspace_tasks add constraint workspace_tasks_status_check
  check (status in ('Not Started','In Progress','Under Review','Blocked','Completed'));
alter table public.workspace_tasks drop constraint if exists workspace_tasks_progress_check;
alter table public.workspace_tasks add constraint workspace_tasks_progress_check check (progress between 0 and 100);

alter table public.workspace_tasks alter column status set default 'Not Started';
alter table public.workspace_tasks enable row level security;

-- Enforce the approved company email domain at account creation as well as in RLS.
create or replace function public.enforce_mindtech_email_domain()
returns trigger
language plpgsql
security definer
set search_path = ''
as $
begin
  if new.email is null or lower(new.email) !~ '^[^@]+@mindtechb2b\\.com then
    raise exception 'Only @mindtechb2b.com accounts are permitted';
  end if;
  return new;
end;
$;
drop trigger if exists enforce_mindtech_email_domain on auth.users;
create trigger enforce_mindtech_email_domain
before insert or update of email on auth.users
for each row execute function public.enforce_mindtech_email_domain();
drop policy if exists "MindTech employees can read workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can read workspace tasks"
on public.workspace_tasks for select to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) ~ '^[^@]+@mindtechb2b\\.com);
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
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
 then
    raise exception 'Only @mindtechb2b.com accounts are permitted';
  end if;
  return new;
end;
$;
drop trigger if exists enforce_mindtech_email_domain on auth.users;
create trigger enforce_mindtech_email_domain
before insert or update of email on auth.users
for each row execute function public.enforce_mindtech_email_domain();
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
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
);
drop policy if exists "MindTech employees can create workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can create workspace tasks"
on public.workspace_tasks for insert to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email','')) ~ '^[^@]+@mindtechb2b\\.com
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
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
 then
    raise exception 'Only @mindtechb2b.com accounts are permitted';
  end if;
  return new;
end;
$;
drop trigger if exists enforce_mindtech_email_domain on auth.users;
create trigger enforce_mindtech_email_domain
before insert or update of email on auth.users
for each row execute function public.enforce_mindtech_email_domain();
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
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.

  and (created_by is null or created_by = auth.uid())
);
drop policy if exists "MindTech employees can update workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can update workspace tasks"
on public.workspace_tasks for update to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) ~ '^[^@]+@mindtechb2b\\.com)
with check (lower(coalesce(auth.jwt() ->> 'email','')) like '%@mindtechb2b.com');
drop policy if exists "MindTech employees can delete workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can delete workspace tasks"
on public.workspace_tasks for delete to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) like '%@mindtechb2b.com');

create index if not exists workspace_tasks_department_idx on public.workspace_tasks(department);
create index if not exists workspace_tasks_due_idx on public.workspace_tasks(due);
create index if not exists workspace_tasks_status_idx on public.workspace_tasks(status);
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
 then
    raise exception 'Only @mindtechb2b.com accounts are permitted';
  end if;
  return new;
end;
$;
drop trigger if exists enforce_mindtech_email_domain on auth.users;
create trigger enforce_mindtech_email_domain
before insert or update of email on auth.users
for each row execute function public.enforce_mindtech_email_domain();
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
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
)
with check (lower(coalesce(auth.jwt() ->> 'email','')) ~ '^[^@]+@mindtechb2b\\.com);
drop policy if exists "MindTech employees can delete workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can delete workspace tasks"
on public.workspace_tasks for delete to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) like '%@mindtechb2b.com');

create index if not exists workspace_tasks_department_idx on public.workspace_tasks(department);
create index if not exists workspace_tasks_due_idx on public.workspace_tasks(due);
create index if not exists workspace_tasks_status_idx on public.workspace_tasks(status);
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
 then
    raise exception 'Only @mindtechb2b.com accounts are permitted';
  end if;
  return new;
end;
$;
drop trigger if exists enforce_mindtech_email_domain on auth.users;
create trigger enforce_mindtech_email_domain
before insert or update of email on auth.users
for each row execute function public.enforce_mindtech_email_domain();
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
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
);
drop policy if exists "MindTech employees can delete workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can delete workspace tasks"
on public.workspace_tasks for delete to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) ~ '^[^@]+@mindtechb2b\\.com);

create index if not exists workspace_tasks_department_idx on public.workspace_tasks(department);
create index if not exists workspace_tasks_due_idx on public.workspace_tasks(due);
create index if not exists workspace_tasks_status_idx on public.workspace_tasks(status);
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
 then
    raise exception 'Only @mindtechb2b.com accounts are permitted';
  end if;
  return new;
end;
$;
drop trigger if exists enforce_mindtech_email_domain on auth.users;
create trigger enforce_mindtech_email_domain
before insert or update of email on auth.users
for each row execute function public.enforce_mindtech_email_domain();
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
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
);

create index if not exists workspace_tasks_department_idx on public.workspace_tasks(department);
create index if not exists workspace_tasks_due_idx on public.workspace_tasks(due);
create index if not exists workspace_tasks_status_idx on public.workspace_tasks(status);
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
 then
    raise exception 'Only @mindtechb2b.com accounts are permitted';
  end if;
  return new;
end;
$;
drop trigger if exists enforce_mindtech_email_domain on auth.users;
create trigger enforce_mindtech_email_domain
before insert or update of email on auth.users
for each row execute function public.enforce_mindtech_email_domain();
drop policy if exists "MindTech employees can read workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can read workspace tasks"
on public.workspace_tasks for select to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) ~ '^[^@]+@mindtechb2b\\.com);
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
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
);
drop policy if exists "MindTech employees can create workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can create workspace tasks"
on public.workspace_tasks for insert to authenticated
with check (
  lower(coalesce(auth.jwt() ->> 'email','')) ~ '^[^@]+@mindtechb2b\\.com
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
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.

  and (created_by is null or created_by = auth.uid())
);
drop policy if exists "MindTech employees can update workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can update workspace tasks"
on public.workspace_tasks for update to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) ~ '^[^@]+@mindtechb2b\\.com)
with check (lower(coalesce(auth.jwt() ->> 'email','')) like '%@mindtechb2b.com');
drop policy if exists "MindTech employees can delete workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can delete workspace tasks"
on public.workspace_tasks for delete to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) like '%@mindtechb2b.com');

create index if not exists workspace_tasks_department_idx on public.workspace_tasks(department);
create index if not exists workspace_tasks_due_idx on public.workspace_tasks(due);
create index if not exists workspace_tasks_status_idx on public.workspace_tasks(status);
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
)
with check (lower(coalesce(auth.jwt() ->> 'email','')) ~ '^[^@]+@mindtechb2b\\.com);
drop policy if exists "MindTech employees can delete workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can delete workspace tasks"
on public.workspace_tasks for delete to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) like '%@mindtechb2b.com');

create index if not exists workspace_tasks_department_idx on public.workspace_tasks(department);
create index if not exists workspace_tasks_due_idx on public.workspace_tasks(due);
create index if not exists workspace_tasks_status_idx on public.workspace_tasks(status);
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
);
drop policy if exists "MindTech employees can delete workspace tasks" on public.workspace_tasks;
create policy "MindTech employees can delete workspace tasks"
on public.workspace_tasks for delete to authenticated
using (lower(coalesce(auth.jwt() ->> 'email','')) ~ '^[^@]+@mindtechb2b\\.com);

create index if not exists workspace_tasks_department_idx on public.workspace_tasks(department);
create index if not exists workspace_tasks_due_idx on public.workspace_tasks(due);
create index if not exists workspace_tasks_status_idx on public.workspace_tasks(status);
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
);

create index if not exists workspace_tasks_department_idx on public.workspace_tasks(department);
create index if not exists workspace_tasks_due_idx on public.workspace_tasks(due);
create index if not exists workspace_tasks_status_idx on public.workspace_tasks(status);
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select, insert, update, delete on public.workspace_tasks to authenticated;

-- Supabase Realtime is optional; the UI refreshes after successful writes even if publication is unavailable.
do $$
begin
  alter publication supabase_realtime add table public.workspace_tasks;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- IMPORTANT: RLS protects task data. To reject non-company signups at the auth boundary too,
-- configure a Supabase Before User Created hook that validates email suffix @mindtechb2b.com.
-- Do not expose a service-role key in this static frontend.
