-- MindTechB2B Operations Workspace: run once in the Supabase SQL editor.
-- Domain boundary: mindtechb2b.com. The only bootstrap superadmin is amaan.d@mindtechb2b.com.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'Team Member' check (role in ('Administrator','Management','Department Manager','Team Lead','Team Member')),
  department text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  description text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.board_columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  column_type text not null check (column_type in ('text','number','status','priority','date','people','dropdown','checkbox','progress','link','formula','attachment')),
  position integer not null default 0,
  options jsonb not null default '[]'::jsonb,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (board_id,name)
);
create table if not exists public.workspace_tasks (
  id text primary key,
  board_id uuid references public.boards(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 140),
  department text not null default 'Operations',
  owner text not null default 'Unassigned',
  status text not null default 'Not Started' check (status in ('Not Started','In Progress','Under Review','Blocked','Completed')),
  priority text not null default 'P2' check (priority in ('P1','P2','P3')),
  due date,
  start_date date,
  description text not null default '',
  progress integer not null default 0 check (progress between 0 and 100),
  parent_task_id text references public.workspace_tasks(id) on delete set null,
  campaign text,
  last_manual_update timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.workspace_tasks add column if not exists board_id uuid references public.boards(id) on delete set null;
alter table public.workspace_tasks add column if not exists start_date date;
alter table public.workspace_tasks add column if not exists parent_task_id text references public.workspace_tasks(id) on delete set null;
alter table public.workspace_tasks add column if not exists campaign text;
alter table public.workspace_tasks add column if not exists last_manual_update timestamptz not null default now();
alter table public.workspace_tasks drop constraint if exists workspace_tasks_status_check;
update public.workspace_tasks set status=case lower(status) when 'not started' then 'Not Started' when 'not-started' then 'Not Started' when 'in progress' then 'In Progress' when 'in-progress' then 'In Progress' when 'under review' then 'Under Review' when 'under-review' then 'Under Review' when 'blocked' then 'Blocked' when 'done' then 'Completed' when 'completed' then 'Completed' else 'Not Started' end;
alter table public.workspace_tasks add constraint workspace_tasks_status_check check (status in ('Not Started','In Progress','Under Review','Blocked','Completed'));
create table if not exists public.task_assignees (
  task_id text not null references public.workspace_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (task_id,user_id)
);
create table if not exists public.task_dependencies (
  task_id text not null references public.workspace_tasks(id) on delete cascade,
  depends_on_task_id text not null references public.workspace_tasks(id) on delete cascade,
  primary key (task_id,depends_on_task_id),
  check (task_id <> depends_on_task_id)
);
create table if not exists public.task_links (
  task_id text not null references public.workspace_tasks(id) on delete cascade,
  linked_task_id text not null references public.workspace_tasks(id) on delete cascade,
  primary key (task_id,linked_task_id),
  check (task_id <> linked_task_id)
);
create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id text not null references public.workspace_tasks(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create table if not exists public.task_activity (
  id bigint generated always as identity primary key,
  task_id text not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  board_id uuid references public.boards(id) on delete cascade,
  name text not null,
  view_type text not null check (view_type in ('table','kanban','calendar','timeline','gantt','workload','dashboard')),
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  enabled boolean not null default false,
  trigger_config jsonb not null default '{}'::jsonb,
  action_config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.enforce_mindtech_email_domain()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null or split_part(lower(new.email),'@',2) <> 'mindtechb2b.com' or position('@' in new.email) = 0 then
    raise exception 'Only @mindtechb2b.com accounts are permitted';
  end if;
  return new;
end; $$;
drop trigger if exists enforce_mindtech_email_domain on auth.users;
create trigger enforce_mindtech_email_domain before insert or update of email on auth.users
for each row execute function public.enforce_mindtech_email_domain();

create or replace function public.is_workspace_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.jwt() ->> 'aal') = 'aal2' and (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'Administrator')
    or lower(coalesce(auth.jwt() ->> 'email','')) = 'amaan.d@mindtechb2b.com');
$$;
create or replace function public.is_company_workspace_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.jwt() ->> 'aal') = 'aal2'
    and split_part(lower(coalesce(auth.jwt() ->> 'email','')),'@',2) = 'mindtechb2b.com';
$$;
create or replace function public.bootstrap_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,email,full_name,role)
  values(new.id,lower(new.email),coalesce(new.raw_user_meta_data ->> 'full_name',''),
    case when lower(new.email) = 'amaan.d@mindtechb2b.com' then 'Administrator' else 'Team Member' end)
  on conflict(id) do update set email=excluded.email,
    role=case when excluded.email='amaan.d@mindtechb2b.com' then 'Administrator' else public.profiles.role end;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert or update of email on auth.users
for each row execute function public.bootstrap_profile();
insert into public.profiles(id,email,full_name,role)
select u.id,lower(u.email),coalesce(u.raw_user_meta_data ->> 'full_name',''),
  case when lower(u.email)='amaan.d@mindtechb2b.com' then 'Administrator' else 'Team Member' end
from auth.users u where split_part(lower(u.email),'@',2)='mindtechb2b.com'
on conflict(id) do update set email=excluded.email,
  role=case when excluded.email='amaan.d@mindtechb2b.com' then 'Administrator' else public.profiles.role end;
update public.profiles set role='Administrator' where lower(email)='amaan.d@mindtechb2b.com';

create or replace function public.record_task_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='INSERT' then
    insert into public.task_activity(task_id,actor_id,action,after_value) values(new.id,auth.uid(),'created',to_jsonb(new));
    return new;
  elsif tg_op='UPDATE' then
    insert into public.task_activity(task_id,actor_id,action,before_value,after_value) values(new.id,auth.uid(),'updated',to_jsonb(old),to_jsonb(new));
    new.last_manual_update=now();
    return new;
  else
    insert into public.task_activity(task_id,actor_id,action,before_value) values(old.id,auth.uid(),'deleted',to_jsonb(old));
    return old;
  end if;
end; $$;
drop trigger if exists workspace_task_activity on public.workspace_tasks;
create trigger workspace_task_activity before insert or update or delete on public.workspace_tasks
for each row execute function public.record_task_activity();

alter table public.profiles enable row level security;
alter table public.departments enable row level security;
alter table public.workspaces enable row level security;
alter table public.boards enable row level security;
alter table public.board_columns enable row level security;
alter table public.workspace_tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.task_links enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_activity enable row level security;
alter table public.saved_views enable row level security;
alter table public.automation_rules enable row level security;

do $$ declare p record; begin
  for p in select schemaname,tablename,policyname from pg_policies where schemaname='public'
    and tablename = any(array['profiles','departments','workspaces','boards','board_columns','workspace_tasks','task_assignees','task_dependencies','task_links','task_comments','task_activity','saved_views','automation_rules'])
  loop execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;

create policy "company profiles readable" on public.profiles for select to authenticated using (public.is_company_workspace_user());
create policy "admins manage profiles" on public.profiles for all to authenticated using (public.is_workspace_admin()) with check (public.is_workspace_admin());
create policy "company departments readable" on public.departments for select to authenticated using (public.is_company_workspace_user());
create policy "admins manage departments" on public.departments for all to authenticated using (public.is_workspace_admin()) with check (public.is_workspace_admin());
create policy "company workspaces readable" on public.workspaces for select to authenticated using (public.is_company_workspace_user());
create policy "admins manage workspaces" on public.workspaces for all to authenticated using (public.is_workspace_admin()) with check (public.is_workspace_admin());
create policy "company boards readable" on public.boards for select to authenticated using (public.is_company_workspace_user());
create policy "admins manage boards" on public.boards for all to authenticated using (public.is_workspace_admin()) with check (public.is_workspace_admin());
create policy "company board columns readable" on public.board_columns for select to authenticated using (public.is_company_workspace_user());
create policy "admins manage board columns" on public.board_columns for all to authenticated using (public.is_workspace_admin()) with check (public.is_workspace_admin());
create policy "company employees read tasks" on public.workspace_tasks for select to authenticated using (public.is_company_workspace_user());
create policy "company employees create tasks" on public.workspace_tasks for insert to authenticated with check (public.is_company_workspace_user() and (created_by is null or created_by=auth.uid()));
create policy "company employees update tasks" on public.workspace_tasks for update to authenticated using (public.is_company_workspace_user()) with check (public.is_company_workspace_user());
create policy "company employees delete tasks" on public.workspace_tasks for delete to authenticated using (public.is_workspace_admin());
create policy "company task collaborators read" on public.task_assignees for select to authenticated using (public.is_company_workspace_user());
create policy "company task collaborators manage" on public.task_assignees for all to authenticated using (public.is_company_workspace_user()) with check (public.is_company_workspace_user());
create policy "company dependencies read" on public.task_dependencies for select to authenticated using (public.is_company_workspace_user());
create policy "company dependencies manage" on public.task_dependencies for all to authenticated using (public.is_company_workspace_user()) with check (public.is_company_workspace_user());
create policy "company task links read" on public.task_links for select to authenticated using (public.is_company_workspace_user());
create policy "company task links manage" on public.task_links for all to authenticated using (public.is_company_workspace_user()) with check (public.is_company_workspace_user());
create policy "company comments read" on public.task_comments for select to authenticated using (public.is_company_workspace_user());
create policy "company comments add" on public.task_comments for insert to authenticated with check (author_id=auth.uid() and public.is_company_workspace_user());
create policy "company task activity read" on public.task_activity for select to authenticated using (public.is_company_workspace_user());
create policy "owners manage saved views" on public.saved_views for all to authenticated using (owner_id=auth.uid() or public.is_workspace_admin()) with check (owner_id=auth.uid() or public.is_workspace_admin());
create policy "company automation rules read" on public.automation_rules for select to authenticated using (public.is_company_workspace_user());
create policy "admins manage automation rules" on public.automation_rules for all to authenticated using (public.is_workspace_admin()) with check (public.is_workspace_admin());

insert into public.departments(name) values ('Management'),('Operations'),('Data Team'),('QA Team'),('Sales'),('Marketing'),('Campaign Management') on conflict(name) do nothing;
insert into public.workspaces(name) select 'MindTechB2B Workspace' where not exists(select 1 from public.workspaces);
create index if not exists workspace_tasks_department_idx on public.workspace_tasks(department);
create index if not exists workspace_tasks_due_idx on public.workspace_tasks(due);
create index if not exists workspace_tasks_status_idx on public.workspace_tasks(status);
create index if not exists workspace_tasks_updated_at_idx on public.workspace_tasks(updated_at desc);
grant select,insert,update,delete on public.profiles,public.departments,public.workspaces,public.boards,public.board_columns,public.workspace_tasks,public.task_assignees,public.task_dependencies,public.task_links,public.task_comments,public.task_activity,public.saved_views,public.automation_rules to authenticated;
do $$ begin alter publication supabase_realtime add table public.workspace_tasks; exception when duplicate_object then null; when undefined_object then null; end $$;

