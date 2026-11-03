-- Paie ventilee par plateforme : trois pages (OnlyFans, Reveal, MYM), chacune
-- avec sa propre periodicite. OnlyFans reste hebdomadaire (1-7, 8-15, 16-22,
-- 23-fin), Reveal et MYM passent en bi-hebdomadaire (1-15, 16-fin).
--
-- Un meme chatter peut travailler sur plusieurs plateformes : son CA et sa
-- commission se calculent desormais plateforme par plateforme, pas en un bloc.
-- fn_agency_payroll gagne un filtre p_platform (null = toutes, comportement
-- historique conserve pour le dashboard).
--
-- Les bonus et sanctions n'ont pas de colonne plateforme : ils portent sur une
-- periode. On les rattache a la plateforme DOMINANTE du chatter sur la periode
-- (celle ou il genere le plus de CA) — meme convention que l'envoi comptable,
-- pour qu'une prime ne soit pas versee deux fois sur deux pages.

-- --- 1. Une colonne plateforme sur les versements figes ---------------------
-- Deux plateformes bi-hebdomadaires (Reveal et MYM) partagent les memes bornes
-- de periode : un chatter travaillant sur les deux aurait deux versements sur
-- le meme (chatter, period). La colonne les distingue.
alter table payouts add column if not exists platform text;

-- L'ancienne contrainte unique ne connaissait pas la plateforme : on la
-- remplace par deux index partiels.
--   - legacy (platform null) : les versements d'avant la separation, uniques
--     entre eux, toujours consideres comme couvrant la periode entiere.
--   - plateforme : un versement par (chatter, periode, plateforme).
--
-- Le nom de la contrainte est generic par Postgres ; on la retrouve par type
-- plutot que de parier sur son libelle.
do $$
declare
  cname text;
begin
  select conname into cname
  from pg_constraint
  where conrelid = 'payouts'::regclass
    and contype = 'u';
  if cname is not null then
    execute format('alter table payouts drop constraint %I', cname);
  end if;
end;
$$;

create unique index if not exists payouts_legacy_unique
  on payouts (chatter_id, period_start, period_end)
  where platform is null;

create unique index if not exists payouts_platform_unique
  on payouts (chatter_id, period_start, period_end, platform)
  where platform is not null;

-- --- 2. Fonctions de calcul filtrees par plateforme -------------------------
-- Miroirs des fonctions existantes, avec une jointure supplementaire vers
-- models pour ne retenir que les shifts de la plateforme demandee.

create or replace function fn_chatter_period_revenue_platform(
  p_chatter_id uuid, p_period_start date, p_period_end date, p_platform text
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(fn_shift_entry_total_eur(se.id)), 0)
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
  select coalesce(sum(fn_shift_entry_net_eur(se.id)), 0)
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
    fn_shift_entry_net_eur(se.id) * coalesce((
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

create or replace function fn_chatter_period_hours_platform(
  p_chatter_id uuid, p_period_start date, p_period_end date, p_platform text
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(fn_shift_hours(se.start_time, se.end_time)), 0)
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
  select coalesce(sum(fn_shift_entry_net_eur(se.id)), 0)
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

-- Plateforme ou le chatter genere le plus de CA sur la periode : cible des
-- bonus/sanctions dans les vues filtrees.
create or replace function fn_chatter_dominant_platform(
  p_chatter_id uuid, p_period_start date, p_period_end date
)
returns text
language sql
stable
as $$
  select m.platform
  from shift_entries se
  join models m on m.id = se.model_id
  where se.chatter_id = p_chatter_id
    and se.shift_date between p_period_start and p_period_end
  group by m.platform
  order by sum(fn_shift_entry_total_eur(se.id)) desc
  limit 1;
$$;

-- --- 3. fn_agency_payroll filtre par plateforme -----------------------------
-- Le type de retour ne change pas, mais la signature gagne un parametre :
-- Postgres ne peut pas `create or replace` une fonction dont le nombre
-- d'arguments change, on supprime avant de recreer.
drop function if exists fn_agency_payroll(uuid, date, date);
drop function if exists fn_agency_payroll(uuid, date, date, text);

create function fn_agency_payroll(
  p_agency_id uuid, p_period_start date, p_period_end date, p_platform text default null
)
returns table (
  chatter_id uuid,
  full_name text,
  active boolean,
  revenue_eur numeric,
  fee_eur numeric,
  net_revenue_eur numeric,
  commission_eur numeric,
  effective_rate numeric,
  bonus_eur numeric,
  sanction_eur numeric,
  net_eur numeric,
  hours numeric,
  eur_per_hour numeric,
  uncovered_revenue_eur numeric,
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
          select sum(fn_shift_entry_net_eur(se.id))
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
      -- Bonus/sanctions rattaches a la plateforme dominante : en vue filtree,
      -- seuls les ajustements dont la cible est cette plateforme comptent.
      case when p_platform is null
             or fn_chatter_dominant_platform(p.id, p_period_start, p_period_end) = p_platform
        then coalesce((
          select sum(b.amount_eur) from bonuses b
          where b.chatter_id = p.id
            and b.period_start = p_period_start and b.period_end = p_period_end
        ), 0)
        else 0
      end as bonus,
      case when p_platform is null
             or fn_chatter_dominant_platform(p.id, p_period_start, p_period_end) = p_platform
        then coalesce((
          select sum(s.amount_eur) from sanctions s
          where s.chatter_id = p.id
            and s.period_start = p_period_start and s.period_end = p_period_end
        ), 0)
        else 0
      end as sanction,
      (
        select po.paid_at from payouts po
        where po.chatter_id = p.id
          and po.period_start = p_period_start and po.period_end = p_period_end
          -- Un versement legacy (platform null) couvre toute la periode : il
          -- compte comme paye sur chaque page. Sinon, on ne retient que la
          -- plateforme demandee.
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

grant execute on function
  fn_chatter_period_revenue_platform(uuid, date, date, text),
  fn_chatter_period_net_revenue_platform(uuid, date, date, text),
  fn_chatter_period_commission_platform(uuid, date, date, text),
  fn_chatter_period_hours_platform(uuid, date, date, text),
  fn_chatter_period_uncovered_platform(uuid, date, date, text),
  fn_chatter_dominant_platform(uuid, date, date),
  fn_agency_payroll(uuid, date, date, text)
to authenticated, service_role;
