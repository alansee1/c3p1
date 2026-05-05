alter table works
add column if not exists completed_by_agent text;

update works
set completed_by_agent = coalesce(completed_by_agent, 'manual')
where status = 'completed' and completed_by_agent is null;

alter table works
drop constraint if exists works_completed_by_agent_check;

alter table works
add constraint works_completed_by_agent_check
check (completed_by_agent is null or completed_by_agent in ('manual', 'c3p1'));
