-- Integrity hardening: the Server Actions' business checks only protect the
-- app path — PostgREST is directly reachable with any authenticated JWT, so
-- everything financial must also be enforced at the database layer.
--
-- 1. shift_entries: exchange_rate_used is always set server-side (never
--    trusted from the client), the model must be assigned to the chatter on
--    the shift date, future dates are rejected, and chatter_id/model_id/
--    exchange_rate_used are immutable after insert.
-- 2. Pay-period locking: once a period has been over for LOCK_GRACE_DAYS,
--    chatters can no longer insert/update/delete shifts or sale lines in it
--    (admins can, for corrections).
-- 3. chatter_model_assignments: model and chatter must belong to the same
--    agency; one active assignment max per (chatter, model).
-- 4. fn_create_shift(): transactional shift + sale lines creation, so a
--    failed lines insert can no longer leave an orphaned 0€ shift behind.
--
-- All "today" computations use Europe/Paris, not the server's UTC clock, so
-- period boundaries flip at midnight French time.

-- Pay-period end for an arbitrary date (P1: 1-7, P2: 8-15, P3: 16-22, P4: 23-end).
create or replace function fn_period_end_for_date(p_date date)
returns date
language sql
immutable
as $$
  select case
    when extract(day from p_date) <= 7 then make_date(extract(year from p_date)::int, extract(month from p_date)::int, 7)
    when extract(day from p_date) <= 15 then make_date(extract(year from p_date)::int, extract(month from p_date)::int, 15)
    when extract(day from p_date) <= 22 then make_date(extract(year from p_date)::int, extract(month from p_date)::int, 22)
    else (date_trunc('month', p_date) + interval '1 month' - interval '1 day')::date
  end;
$$;

-- A shift date is locked once its pay period has been over for 3 full days
-- (grace window for late declarations, e.g. the night shift of the last day).
create or replace function fn_shift_date_locked(p_date date)
returns boolean
language sql
stable
as $$
  select fn_period_end_for_date(p_date) + 3 < (now() at time zone 'Europe/Paris')::date;
$$;

-- shift_entries guard ------------------------------------------------------

create or replace function trg_shift_entries_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_rate numeric;
  v_is_admin boolean;
begin
  if tg_op = 'DELETE' then
    v_is_admin := is_agency_admin(chatter_agency_id(old.chatter_id));
    if not v_is_admin and fn_shift_date_locked(old.shift_date) then
      raise exception 'Period closed: this shift can no longer be deleted.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.chatter_id is distinct from old.chatter_id
       or new.model_id is distinct from old.model_id
       or new.exchange_rate_used is distinct from old.exchange_rate_used then
      raise exception 'chatter_id, model_id and exchange_rate_used are immutable.';
    end if;
    if new.shift_date > v_today then
      raise exception 'Cannot report a shift in the future.';
    end if;
    v_is_admin := is_agency_admin(chatter_agency_id(new.chatter_id));
    if not v_is_admin and (fn_shift_date_locked(old.shift_date) or fn_shift_date_locked(new.shift_date)) then
      raise exception 'Period closed: this shift can no longer be edited.';
    end if;
    return new;
  end if;

  -- INSERT
  if new.shift_date > v_today then
    raise exception 'Cannot report a shift in the future.';
  end if;

  v_is_admin := is_agency_admin(chatter_agency_id(new.chatter_id));
  if not v_is_admin and fn_shift_date_locked(new.shift_date) then
    raise exception 'Period closed: cannot report for this date.';
  end if;

  -- The assignment must cover the shift date (not merely be active today):
  -- this also allows declaring yesterday's shift right after being unassigned.
  if not exists (
    select 1 from chatter_model_assignments a
    where a.chatter_id = new.chatter_id
      and a.model_id = new.model_id
      and a.assigned_from <= new.shift_date
      and (a.assigned_to is null or a.assigned_to >= new.shift_date)
  ) then
    raise exception 'This model is not assigned to this chatter for this date.';
  end if;

  -- The frozen rate is always resolved server-side; whatever the client sent
  -- in exchange_rate_used is discarded.
  select rate_usd_to_eur into v_rate
  from exchange_rates
  where agency_id = model_agency_id(new.model_id)
    and valid_from <= now()
  order by valid_from desc
  limit 1;

  if v_rate is null then
    raise exception 'No exchange rate is configured for the agency.';
  end if;

  new.exchange_rate_used := v_rate;
  return new;
end;
$$;

drop trigger if exists shift_entries_guard on shift_entries;
create trigger shift_entries_guard
  before insert or update or delete on shift_entries
  for each row execute function trg_shift_entries_guard();

-- sale_lines guard ---------------------------------------------------------

create or replace function trg_sale_lines_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift shift_entries%rowtype;
begin
  select * into v_shift from shift_entries where id = coalesce(new.shift_entry_id, old.shift_entry_id);
  -- Parent already gone: we're inside the ON DELETE CASCADE of an authorized
  -- shift deletion — nothing more to check.
  if not found then
    return coalesce(new, old);
  end if;

  if not is_agency_admin(chatter_agency_id(v_shift.chatter_id))
     and fn_shift_date_locked(v_shift.shift_date) then
    raise exception 'Period closed: this shift''s sales can no longer be edited.';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sale_lines_guard on sale_lines;
create trigger sale_lines_guard
  before insert or update or delete on sale_lines
  for each row execute function trg_sale_lines_guard();

-- chatter_model_assignments guards ----------------------------------------

create or replace function trg_assignments_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if chatter_agency_id(new.chatter_id) is distinct from model_agency_id(new.model_id) then
    raise exception 'Le modèle et le chatter doivent appartenir à la même agence.';
  end if;
  return new;
end;
$$;

drop trigger if exists assignments_guard on chatter_model_assignments;
create trigger assignments_guard
  before insert or update on chatter_model_assignments
  for each row execute function trg_assignments_guard();

create unique index if not exists chatter_model_assignments_active_uniq
  on chatter_model_assignments(chatter_id, model_id)
  where assigned_to is null;

-- Transactional shift creation ---------------------------------------------
-- SECURITY INVOKER on purpose: inserts run under the caller's RLS and pass
-- through the guard triggers above. Any raised exception rolls back both the
-- shift and its lines atomically.

create or replace function fn_create_shift(
  p_model_id uuid,
  p_shift_date date,
  p_start_time time,
  p_end_time time,
  p_amounts numeric[]
)
returns uuid
language plpgsql
as $$
declare
  v_shift_id uuid;
  v_amount numeric;
begin
  if p_amounts is null or array_length(p_amounts, 1) is null then
    raise exception 'Add at least one sale.';
  end if;

  -- exchange_rate_used placeholder: the guard trigger overwrites it with the
  -- agency's current rate (or rejects if none is configured).
  insert into shift_entries (chatter_id, model_id, shift_date, start_time, end_time, exchange_rate_used)
  values (auth.uid(), p_model_id, p_shift_date, p_start_time, p_end_time, 1)
  returning id into v_shift_id;

  foreach v_amount in array p_amounts loop
    if v_amount is null or v_amount <= 0 then
      raise exception 'Each sale must be a positive amount.';
    end if;
    insert into sale_lines (shift_entry_id, amount) values (v_shift_id, v_amount);
  end loop;

  return v_shift_id;
end;
$$;

grant execute on function fn_create_shift(uuid, date, time, time, numeric[]) to authenticated;
