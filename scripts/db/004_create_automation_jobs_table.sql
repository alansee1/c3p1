create table if not exists automation_jobs (
  id serial primary key,
  job_type text not null,
  agent_id text not null default 'c3p1',
  project_id int not null references projects(id) on delete cascade,
  work_id int references works(id) on delete set null,
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_automation_jobs_status on automation_jobs(status);
create index if not exists idx_automation_jobs_project_id on automation_jobs(project_id);
create index if not exists idx_automation_jobs_work_id on automation_jobs(work_id);
create index if not exists idx_automation_jobs_job_type on automation_jobs(job_type);

create or replace function set_automation_jobs_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_automation_jobs_updated_at on automation_jobs;

create trigger trg_automation_jobs_updated_at
before update on automation_jobs
for each row
execute function set_automation_jobs_updated_at();
