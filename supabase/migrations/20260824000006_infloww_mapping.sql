-- Infloww API mapping: links our internal chatter/model rows to Infloww's
-- own numeric IDs (employeeId, platformPid), set once by the admin from the
-- chatter/model admin screens. Nullable — the app works fully without it,
-- the Infloww day-by-day comparison simply stays unavailable until set.

alter table profiles add column infloww_employee_id integer;
alter table models add column infloww_platform_pid integer;

create unique index if not exists profiles_infloww_employee_id_uniq
  on profiles(infloww_employee_id)
  where infloww_employee_id is not null;

create unique index if not exists models_infloww_platform_pid_uniq
  on models(infloww_platform_pid)
  where infloww_platform_pid is not null;
