-- Un chatter doit avoir pointe (shift_check_ins) ce jour-la avant de pouvoir
-- declarer un shift pour cette date. Jusqu'ici les deux etaient independants :
-- un chatter pouvait declarer ses ventes sans jamais utiliser le pointage, ce
-- qui rendait "dernier pointage" inutilisable comme indicateur de presence.
--
-- Porte par le trigger existant (pas par fn_create_shift/fn_create_shift_for_
-- chatter) : PostgREST est directement joignable avec un JWT valide, la regle
-- doit donc vivre ou elle ne peut pas etre contournee. Un admin reste exempte
-- (meme bypass que les autres regles de ce trigger) : il doit pouvoir
-- corriger/saisir une declaration pour un chatter sans avoir lui-meme pointe.
-- S'applique aussi a l'API externe (app/api/v1/shifts, fn_create_shift_for_
-- chatter) : service role n'est jamais admin au sens de is_agency_admin
-- (base sur auth.uid(), toujours null hors session), donc pas de bypass
-- cache pour autant.
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

  -- Pointage requis ce jour-la (peu importe le creneau exact : shift_date est
  -- le meme ancrage des deux cotes, y compris pour un creneau de nuit qui
  -- commence la veille, cf. currentShiftDate() cote app).
  if not v_is_admin and not exists (
    select 1 from shift_check_ins c
    where c.chatter_id = new.chatter_id
      and c.shift_date = new.shift_date
  ) then
    raise exception 'You must check in before you can report this shift.';
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
