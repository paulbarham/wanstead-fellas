-- Manual ordering for day-plan activities so the family can drag them into the
-- sequence they'll actually do them in (top → bottom).
alter table public.day_plans
  add column if not exists sort int not null default 0;

-- One-time backfill: seed the order from creation time within each day. Guarded
-- so it only runs while nothing has been ordered yet (never clobbers a manual
-- order on a re-run / fresh setup).
update public.day_plans t
set sort = s.rn
from (
  select id, (row_number() over (partition by day_n order by created_at)) - 1 as rn
  from public.day_plans
) s
where t.id = s.id
  and (select coalesce(max(sort), 0) from public.day_plans) = 0;
