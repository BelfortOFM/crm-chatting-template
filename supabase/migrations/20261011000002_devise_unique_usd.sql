-- Devise unique USD : retrait du taux de change.
--
-- Avec OnlyFans comme seule plateforme integree et les plateformes custom
-- desormais restreintes a USD (ci-dessous), plus aucun modele ne peut etre
-- en EUR : la conversion de devise n'a donc plus de raison d'etre. Tout le
-- registre financier (CA, commission, bonus, sanctions, objectifs, LTV,
-- versements) bascule de EUR vers USD, stockage natif, sans conversion.
--
-- Aucune donnee reelle n'existe encore sur ce fork (jamais deploye) : pas de
-- montants historiques a reconvertir, uniquement un changement de schema.

-- --- 1. Plateformes custom restreintes a USD ---------------------------------
-- Sans ca, un futur ajout de plateforme EUR romprait l'hypothese "tout est
-- en USD" que le reste de cette migration pose.

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'custom_platforms'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%currency%';

  if v_conname is not null then
    execute format('alter table custom_platforms drop constraint %I', v_conname);
  end if;

  alter table custom_platforms
    add constraint custom_platforms_currency_check
    check (currency = 'USD');
end $$;

-- --- 2. Garde de shift_entries : plus de resolution/gel de taux -------------
-- Meme corps que la derniere version (20261007000042), moins le bloc taux de
-- change et la colonne exchange_rate_used de la garde d'immutabilite.

create or replace function trg_shift_entries_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
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
       or new.model_id is distinct from old.model_id then
      raise exception 'chatter_id and model_id are immutable.';
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

  if not exists (
    select 1 from chatter_model_assignments a
    where a.chatter_id = new.chatter_id
      and a.model_id = new.model_id
      and a.assigned_from <= new.shift_date
      and (a.assigned_to is null or a.assigned_to >= new.shift_date)
  ) then
    raise exception 'This model is not assigned to this chatter for this date.';
  end if;

  if not v_is_admin and not exists (
    select 1 from shift_check_ins c
    where c.chatter_id = new.chatter_id
      and c.shift_date = new.shift_date
  ) then
    raise exception 'You must check in before you can report this shift.';
  end if;

  return new;
end;
$$;

-- --- 3. Creation/correction de shift : plus de colonne exchange_rate_used ---

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
  insert into shift_entries (chatter_id, model_id, shift_date, start_time, end_time)
  values (auth.uid(), p_model_id, p_shift_date, p_start_time, p_end_time)
  returning id into v_shift_id;

  if p_amounts is not null then
    foreach v_amount in array p_amounts loop
      if v_amount is null or v_amount <= 0 then
        raise exception 'Each sale must be a positive amount.';
      end if;
      insert into sale_lines (shift_entry_id, amount) values (v_shift_id, v_amount);
    end loop;
  end if;

  return v_shift_id;
end;
$$;

create or replace function fn_update_shift(
  p_shift_id uuid,
  p_shift_date date,
  p_start_time time,
  p_end_time time,
  p_amounts numeric[]
)
returns void
language plpgsql
as $$
declare
  v_amount numeric;
  v_exists boolean;
begin
  select true into v_exists from shift_entries where id = p_shift_id;
  if not found then
    raise exception 'Shift not found.';
  end if;

  update shift_entries
     set shift_date = p_shift_date,
         start_time = p_start_time,
         end_time   = p_end_time
   where id = p_shift_id;

  delete from sale_lines where shift_entry_id = p_shift_id;

  if p_amounts is not null then
    foreach v_amount in array p_amounts loop
      if v_amount is null or v_amount <= 0 then
        raise exception 'Each sale must be a positive amount.';
      end if;
      insert into sale_lines (shift_entry_id, amount) values (p_shift_id, v_amount);
    end loop;
  end if;
end;
$$;

create or replace function fn_create_shift_for_chatter(
  p_chatter_id uuid,
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
  insert into shift_entries (chatter_id, model_id, shift_date, start_time, end_time)
  values (p_chatter_id, p_model_id, p_shift_date, p_start_time, p_end_time)
  returning id into v_shift_id;

  if p_amounts is not null then
    foreach v_amount in array p_amounts loop
      if v_amount is null or v_amount <= 0 then
        raise exception 'Each sale must be a positive amount.';
      end if;
      insert into sale_lines (shift_entry_id, amount) values (v_shift_id, v_amount);
    end loop;
  end if;

  return v_shift_id;
end;
$$;

-- --- 4. Colonne exchange_rate_used et table exchange_rates : retrait -------

alter table shift_entries drop column if exists exchange_rate_used;
drop table if exists exchange_rates;

-- --- 5. Totaux de shift : EUR -> USD, sans conversion ------------------------

alter function fn_shift_entry_total_eur(uuid) rename to fn_shift_entry_total_usd;

create or replace function fn_shift_entry_total_usd(p_shift_entry_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(amount), 0)
  from sale_lines
  where shift_entry_id = p_shift_entry_id;
$$;

alter function fn_shift_entry_net_eur(uuid) rename to fn_shift_entry_net_usd;

create or replace function fn_shift_entry_net_usd(p_shift_entry_id uuid)
returns numeric
language sql
stable
as $$
  select fn_shift_entry_total_usd(p_shift_entry_id) * (1 - fn_platform_fee_pct() / 100.0);
$$;

-- --- 6. Revenu/commission/heures par chatter : memes noms, corps mis a jour -

create or replace function fn_chatter_period_revenue(p_chatter_id uuid, p_period_start date, p_period_end date)
returns numeric
language sql
stable
as $$
  select coalesce(sum(fn_shift_entry_total_usd(se.id)), 0)
  from shift_entries se
  where se.chatter_id = p_chatter_id
    and se.shift_date between p_period_start and p_period_end;
$$;

create or replace function fn_chatter_period_net_revenue(p_chatter_id uuid, p_period_start date, p_period_end date)
returns numeric
language sql
stable
as $$
  select coalesce(sum(fn_shift_entry_net_usd(se.id)), 0)
  from shift_entries se
  where se.chatter_id = p_chatter_id
    and se.shift_date between p_period_start and p_period_end;
$$;

create or replace function fn_chatter_period_commission(p_chatter_id uuid, p_period_start date, p_period_end date)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    fn_shift_entry_net_usd(se.id) * coalesce((
      select cr.rate_percent
      from commission_rules cr
      where cr.chatter_id = se.chatter_id
        and cr.valid_from <= se.shift_date
        and (cr.valid_to is null or cr.valid_to >= se.shift_date)
      order by cr.valid_from desc
      limit 1
    ), 0) / 100.0
  ), 0)
  from shift_entries se
  where se.chatter_id = p_chatter_id
    and se.shift_date between p_period_start and p_period_end;
$$;

-- --- 7. Fonctions filtrees par plateforme : corps mis a jour ----------------

create or replace function fn_chatter_period_revenue_platform(
  p_chatter_id uuid, p_period_start date, p_period_end date, p_platform text
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(fn_shift_entry_total_usd(se.id)), 0)
  from shift_entries se
  join models m on m.id = se.model_id
  where se.chatter_id = p_chatter_id
    and m.platform = p_platform
    and se.shift_date between p_period_start and p_period_end;
$$;

create or replace function fn_chatter_period_net_revenue_platform(
  p_chatter_id uuid, p_period_start date, p_period_end date, p_platform text
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(fn_shift_entry_net_usd(se.id)), 0)
  from shift_entries se
  join models m on m.id = se.model_id
  where se.chatter_id = p_chatter_id
    and m.platform = p_platform
    and se.shift_date between p_period_start and p_period_end;
$$;

create or replace function fn_chatter_period_commission_platform(
  p_chatter_id uuid, p_period_start date, p_period_end date, p_platform text
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    fn_shift_entry_net_usd(se.id) * coalesce((
      select cr.rate_percent
      from commission_rules cr
      where cr.chatter_id = se.chatter_id
        and cr.valid_from <= se.shift_date
        and (cr.valid_to is null or cr.valid_to >= se.shift_date)
      order by cr.valid_from desc
      limit 1
    ), 0) / 100.0
  ), 0)
  from shift_entries se
  join models m on m.id = se.model_id
  where se.chatter_id = p_chatter_id
    and m.platform = p_platform
    and se.shift_date between p_period_start and p_period_end;
$$;

create or replace function fn_chatter_period_uncovered_platform(
  p_chatter_id uuid, p_period_start date, p_period_end date, p_platform text
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(fn_shift_entry_net_usd(se.id)), 0)
  from shift_entries se
  join models m on m.id = se.model_id
  where se.chatter_id = p_chatter_id
    and m.platform = p_platform
    and se.shift_date between p_period_start and p_period_end
    and not exists (
      select 1 from commission_rules cr
      where cr.chatter_id = se.chatter_id
        and cr.valid_from <= se.shift_date
        and (cr.valid_to is null or cr.valid_to >= se.shift_date)
    );
$$;

-- --- 8. Resume mensuel chatter : colonnes *_eur -> *_usd --------------------

drop function if exists fn_chatter_monthly_summary(uuid, date);

create function fn_chatter_monthly_summary(p_chatter_id uuid, p_month date)
returns table (
  chatter_id uuid,
  month date,
  total_month_usd numeric,
  period_1_usd numeric,
  period_2_usd numeric,
  period_3_usd numeric,
  period_4_usd numeric,
  forecast_usd numeric,
  previous_month_usd numeric
)
language plpgsql
stable
as $$
declare
  v_year int := extract(year from p_month)::int;
  v_month int := extract(month from p_month)::int;
  v_month_start date := make_date(v_year, v_month, 1);
  v_month_end date := (date_trunc('month', v_month_start) + interval '1 month' - interval '1 day')::date;
  v_days_in_month int := extract(day from v_month_end)::int;
  v_days_elapsed int;
  v_p1 record;
  v_p2 record;
  v_p3 record;
  v_p4 record;
  v_p1_total numeric;
  v_p2_total numeric;
  v_p3_total numeric;
  v_p4_total numeric;
  v_total numeric;
  v_forecast numeric;
  v_prev_month_start date := (v_month_start - interval '1 month')::date;
  v_prev_month_end date := (v_month_start - interval '1 day')::date;
  v_prev_total numeric;
begin
  select * into v_p1 from fn_period_bounds(v_year, v_month, 1);
  select * into v_p2 from fn_period_bounds(v_year, v_month, 2);
  select * into v_p3 from fn_period_bounds(v_year, v_month, 3);
  select * into v_p4 from fn_period_bounds(v_year, v_month, 4);

  v_p1_total := fn_chatter_period_revenue(p_chatter_id, v_p1.period_start, v_p1.period_end);
  v_p2_total := fn_chatter_period_revenue(p_chatter_id, v_p2.period_start, v_p2.period_end);
  v_p3_total := fn_chatter_period_revenue(p_chatter_id, v_p3.period_start, v_p3.period_end);
  v_p4_total := fn_chatter_period_revenue(p_chatter_id, v_p4.period_start, v_p4.period_end);

  v_total := v_p1_total + v_p2_total + v_p3_total + v_p4_total;

  if current_date > v_month_end then
    v_days_elapsed := v_days_in_month;
  elsif current_date >= v_month_start then
    v_days_elapsed := extract(day from current_date)::int;
  else
    v_days_elapsed := 0;
  end if;

  if v_days_elapsed > 0 then
    v_forecast := (v_total / v_days_elapsed) * v_days_in_month;
  else
    v_forecast := 0;
  end if;

  v_prev_total := fn_chatter_period_revenue(p_chatter_id, v_prev_month_start, v_prev_month_end);

  return query select
    p_chatter_id,
    v_month_start,
    v_total,
    v_p1_total,
    v_p2_total,
    v_p3_total,
    v_p4_total,
    v_forecast,
    v_prev_total;
end;
$$;

grant execute on function fn_chatter_monthly_summary(uuid, date) to authenticated;

-- --- 9. Classements : total_eur -> total_usd --------------------------------

drop function if exists fn_agency_leaderboard(uuid, date, date);

create function fn_agency_leaderboard(p_agency_id uuid, p_period_start date, p_period_end date)
returns table (chatter_id uuid, full_name text, total_usd numeric, rank bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_agency_member(p_agency_id) then
    raise exception 'not authorized for this agency';
  end if;

  return query
  with totals as (
    select
      p.id,
      p.full_name,
      p.active,
      coalesce(fn_chatter_period_revenue(p.id, p_period_start, p_period_end), 0) as total
    from profiles p
    where p.agency_id = p_agency_id and p.role = 'chatter'
  )
  select t.id, t.full_name, t.total, rank() over (order by t.total desc)
  from totals t
  where t.active or t.total > 0
  order by t.total desc;
end;
$$;

drop function if exists fn_agency_leaderboard_month(uuid, date);

create function fn_agency_leaderboard_month(p_agency_id uuid, p_month date)
returns table (chatter_id uuid, full_name text, total_usd numeric, rank bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_agency_member(p_agency_id) then
    raise exception 'not authorized for this agency';
  end if;

  return query
  with totals as (
    select p.id, p.full_name, p.active, coalesce(s.total_month_usd, 0) as total
    from profiles p
    left join lateral fn_chatter_monthly_summary(p.id, p_month) s on true
    where p.agency_id = p_agency_id and p.role = 'chatter'
  )
  select t.id, t.full_name, t.total, rank() over (order by t.total desc)
  from totals t
  where t.active or t.total > 0
  order by t.total desc;
end;
$$;

grant execute on function
  fn_agency_leaderboard(uuid, date, date),
  fn_agency_leaderboard_month(uuid, date)
to authenticated;

-- --- 10. Tables d'ajustement : amount_eur -> amount_usd ---------------------

alter table bonuses rename column amount_eur to amount_usd;
alter table sanctions rename column amount_eur to amount_usd;
alter table model_period_goals rename column target_amount_eur to target_amount_usd;
alter table model_goal_allocations rename column target_amount_eur to target_amount_usd;
alter table model_period_ltv_targets rename column target_ltv_eur to target_ltv_usd;

-- --- 11. Versements figes : *_eur -> *_usd -----------------------------------

alter table payouts rename column revenue_eur to revenue_usd;
alter table payouts rename column fee_eur to fee_usd;
alter table payouts rename column net_revenue_eur to net_revenue_usd;
alter table payouts rename column commission_eur to commission_usd;
alter table payouts rename column bonus_eur to bonus_usd;
alter table payouts rename column sanction_eur to sanction_usd;
alter table payouts rename column net_eur to net_usd;

-- --- 12. Paie et marge d'agence : colonnes *_eur -> *_usd, bonus/sanction ----
-- sur les nouveaux noms de colonnes amount_usd.

drop function if exists fn_agency_payroll(uuid, date, date, text);

create function fn_agency_payroll(
  p_agency_id uuid, p_period_start date, p_period_end date, p_platform text default null
)
returns table (
  chatter_id uuid,
  full_name text,
  active boolean,
  revenue_usd numeric,
  fee_usd numeric,
  net_revenue_usd numeric,
  commission_usd numeric,
  effective_rate numeric,
  bonus_usd numeric,
  sanction_usd numeric,
  net_usd numeric,
  hours numeric,
  usd_per_hour numeric,
  uncovered_revenue_usd numeric,
  has_rate boolean,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_agency_admin(p_agency_id) then
    raise exception 'not authorized for this agency';
  end if;

  return query
  with base as (
    select
      p.id,
      p.full_name,
      p.active,
      case when p_platform is null
        then fn_chatter_period_revenue(p.id, p_period_start, p_period_end)
        else fn_chatter_period_revenue_platform(p.id, p_period_start, p_period_end, p_platform)
      end as revenue,
      case when p_platform is null
        then fn_chatter_period_net_revenue(p.id, p_period_start, p_period_end)
        else fn_chatter_period_net_revenue_platform(p.id, p_period_start, p_period_end, p_platform)
      end as net_revenue,
      case when p_platform is null
        then fn_chatter_period_commission(p.id, p_period_start, p_period_end)
        else fn_chatter_period_commission_platform(p.id, p_period_start, p_period_end, p_platform)
      end as commission,
      case when p_platform is null
        then fn_chatter_period_hours(p.id, p_period_start, p_period_end)
        else fn_chatter_period_hours_platform(p.id, p_period_start, p_period_end, p_platform)
      end as hrs,
      case when p_platform is null
        then coalesce((
          select sum(fn_shift_entry_net_usd(se.id))
          from shift_entries se
          where se.chatter_id = p.id
            and se.shift_date between p_period_start and p_period_end
            and not exists (
              select 1 from commission_rules cr
              where cr.chatter_id = se.chatter_id
                and cr.valid_from <= se.shift_date
                and (cr.valid_to is null or cr.valid_to >= se.shift_date)
            )
        ), 0)
        else fn_chatter_period_uncovered_platform(p.id, p_period_start, p_period_end, p_platform)
      end as uncovered,
      exists (
        select 1 from commission_rules cr
        where cr.chatter_id = p.id and cr.valid_to is null
      ) as rate_set,
      case when p_platform is null
             or fn_chatter_dominant_platform(p.id, p_period_start, p_period_end) = p_platform
        then coalesce((
          select sum(b.amount_usd) from bonuses b
          where b.chatter_id = p.id
            and b.period_start = p_period_start and b.period_end = p_period_end
        ), 0)
        else 0
      end as bonus,
      case when p_platform is null
             or fn_chatter_dominant_platform(p.id, p_period_start, p_period_end) = p_platform
        then coalesce((
          select sum(s.amount_usd) from sanctions s
          where s.chatter_id = p.id
            and s.period_start = p_period_start and s.period_end = p_period_end
        ), 0)
        else 0
      end as sanction,
      (
        select po.paid_at from payouts po
        where po.chatter_id = p.id
          and po.period_start = p_period_start and po.period_end = p_period_end
          and (po.platform is null or p_platform is null or po.platform = p_platform)
        limit 1
      ) as paid
    from profiles p
    where p.agency_id = p_agency_id
      and p.role = 'chatter'
  )
  select
    b.id,
    b.full_name,
    b.active,
    b.revenue,
    b.revenue - b.net_revenue,
    b.net_revenue,
    b.commission,
    case when b.net_revenue > 0 then round(b.commission / b.net_revenue * 100, 2) else 0 end,
    b.bonus,
    b.sanction,
    b.commission + b.bonus - b.sanction,
    b.hrs,
    case when b.hrs > 0 then round(b.revenue / b.hrs, 2) else 0 end,
    b.uncovered,
    b.rate_set,
    b.paid
  from base b
  where b.active or b.revenue > 0 or b.bonus > 0 or b.sanction > 0 or b.paid is not null
  order by b.revenue desc, b.full_name;
end;
$$;

drop function if exists fn_agency_margin(uuid, date, date);

create function fn_agency_margin(p_agency_id uuid, p_period_start date, p_period_end date)
returns table (
  revenue_usd numeric,
  fee_usd numeric,
  net_revenue_usd numeric,
  payout_usd numeric,
  margin_usd numeric,
  margin_pct numeric,
  hours numeric,
  active_chatters bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_agency_admin(p_agency_id) then
    raise exception 'not authorized for this agency';
  end if;

  return query
  with p as (
    select * from fn_agency_payroll(p_agency_id, p_period_start, p_period_end)
  )
  select
    coalesce(sum(p.revenue_usd), 0),
    coalesce(sum(p.fee_usd), 0),
    coalesce(sum(p.net_revenue_usd), 0),
    coalesce(sum(p.net_usd), 0),
    coalesce(sum(p.net_revenue_usd) - sum(p.net_usd), 0),
    case when coalesce(sum(p.net_revenue_usd), 0) > 0
      then round((sum(p.net_revenue_usd) - sum(p.net_usd)) / sum(p.net_revenue_usd) * 100, 2)
      else 0 end,
    coalesce(sum(p.hours), 0),
    count(*) filter (where p.active)
  from p;
end;
$$;

grant execute on function
  fn_agency_payroll(uuid, date, date, text),
  fn_agency_margin(uuid, date, date)
to authenticated, service_role;

-- --- 13. Revenu par modele et historique mensuel : revenue_eur -> revenue_usd

drop function if exists fn_agency_model_revenue(uuid, date, date);

create function fn_agency_model_revenue(p_agency_id uuid, p_period_start date, p_period_end date)
returns table (model_id uuid, model_name text, platform text, revenue_usd numeric, hours numeric)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_agency_admin(p_agency_id) then
    raise exception 'not authorized for this agency';
  end if;

  return query
  select
    m.id,
    m.name,
    m.platform,
    coalesce(sum(fn_shift_entry_total_usd(se.id)), 0) as revenue,
    coalesce(sum(fn_shift_hours(se.start_time, se.end_time)), 0) as hrs
  from models m
  left join shift_entries se
    on se.model_id = m.id
   and se.shift_date between p_period_start and p_period_end
  where m.agency_id = p_agency_id
  group by m.id, m.name, m.platform
  order by revenue desc, m.name;
end;
$$;

drop function if exists fn_agency_monthly_history(uuid, int);

create function fn_agency_monthly_history(p_agency_id uuid, p_months int default 6)
returns table (month date, revenue_usd numeric, hours numeric)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_agency_member(p_agency_id) then
    raise exception 'not authorized for this agency';
  end if;

  return query
  with months as (
    select (date_trunc('month', (now() at time zone 'Europe/Paris')::date) - (n || ' month')::interval)::date as m
    from generate_series(0, greatest(p_months, 1) - 1) as n
  )
  select
    months.m,
    coalesce(sum(fn_shift_entry_total_usd(se.id)), 0),
    coalesce(sum(fn_shift_hours(se.start_time, se.end_time)), 0)
  from months
  left join profiles p on p.agency_id = p_agency_id and p.role = 'chatter'
  left join shift_entries se
    on se.chatter_id = p.id
   and se.shift_date >= months.m
   and se.shift_date < (months.m + interval '1 month')::date
  group by months.m
  order by months.m;
end;
$$;

grant execute on function
  fn_agency_model_revenue(uuid, date, date),
  fn_agency_monthly_history(uuid, int)
to authenticated;

-- --- 14. LTV : revenue_eur/ltv_eur -> revenue_usd/ltv_usd -------------------

drop function if exists fn_agency_ltv(uuid, date, date);

create function fn_agency_ltv(p_agency_id uuid, p_period_start date, p_period_end date)
returns table (revenue_usd numeric, subscribers bigint, ltv_usd numeric, models_counted bigint, models_total bigint)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_agency_member(p_agency_id) then
    raise exception 'not authorized for this agency';
  end if;

  return query
  with per_model as (
    select
      m.id,
      fn_model_subscribers_at(m.id, p_period_end) as subs,
      coalesce((
        select sum(fn_shift_entry_net_usd(se.id))
        from shift_entries se
        where se.model_id = m.id
          and se.shift_date between p_period_start and p_period_end
      ), 0) as revenue
    from models m
    where m.agency_id = p_agency_id
  )
  select
    coalesce(sum(p.revenue) filter (where p.subs > 0), 0),
    coalesce(sum(p.subs), 0)::bigint,
    case when coalesce(sum(p.subs), 0) > 0
      then round(sum(p.revenue) filter (where p.subs > 0) / sum(p.subs), 2)
      else 0 end,
    count(*) filter (where p.subs > 0)::bigint,
    count(*)::bigint
  from per_model p;
end;
$$;

drop function if exists fn_model_ltv(uuid, date, date);

create function fn_model_ltv(p_model_id uuid, p_period_start date, p_period_end date)
returns table (revenue_usd numeric, subscribers integer, ltv_usd numeric)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_agency_id uuid;
  v_revenue numeric;
  v_subs integer;
begin
  v_agency_id := model_agency_id(p_model_id);
  if v_agency_id is null or not is_agency_member(v_agency_id) then
    raise exception 'not authorized for this model';
  end if;

  select coalesce(sum(fn_shift_entry_net_usd(se.id)), 0) into v_revenue
  from shift_entries se
  where se.model_id = p_model_id
    and se.shift_date between p_period_start and p_period_end;

  v_subs := fn_model_subscribers_at(p_model_id, p_period_end);

  return query
  select
    v_revenue,
    v_subs,
    case when v_subs > 0 then round(v_revenue / v_subs, 2) else 0 end;
end;
$$;

grant execute on function
  fn_agency_ltv(uuid, date, date),
  fn_model_ltv(uuid, date, date)
to authenticated;
