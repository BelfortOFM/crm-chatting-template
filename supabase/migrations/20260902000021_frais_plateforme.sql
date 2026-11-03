-- Frais de plateforme : la commission se calcule sur le CA net.
--
-- Les chatters declarent le montant brut affiche sur la vente. La plateforme en
-- prend 20 % : l'agence ne percoit que le reste, et c'est sur ce reste que la
-- commission doit porter. Jusqu'ici elle portait sur le brut, ce qui surpayait
-- mecaniquement les chatters d'un quart — 12 % du brut valent 15 % du net.
--
-- Le taux est le meme pour les quatre plateformes, decide avec l'agence. Il vit
-- dans une fonction plutot qu'en dur dans chaque requete : le jour ou il change,
-- il n'y a qu'un endroit a modifier. Cote interface, PLATFORM_FEE_PCT dans
-- lib/currency.ts doit rester aligne — les deux sont commentes en ce sens.
--
-- Effet sur l'existant : les periodes deja cloturees ne bougent pas, leurs
-- montants sont figes dans `payouts`. Les periodes non encore payees sont
-- recalculees, ce qui est l'intention : elles n'ont jamais ete versees et
-- reposaient sur une base fausse.

create or replace function fn_platform_fee_pct()
returns numeric
language sql
immutable
as $$
  select 20::numeric;
$$;

-- CA d'un shift une fois les frais de plateforme retires.
create or replace function fn_shift_entry_net_eur(p_shift_entry_id uuid)
returns numeric
language sql
stable
as $$
  select fn_shift_entry_total_eur(p_shift_entry_id) * (1 - fn_platform_fee_pct() / 100.0);
$$;

-- CA net d'un chatter sur une periode, pendant du brut fn_chatter_period_revenue.
create or replace function fn_chatter_period_net_revenue(
  p_chatter_id uuid, p_period_start date, p_period_end date
)
returns numeric
language sql
stable
as $$
  select coalesce(sum(fn_shift_entry_net_eur(se.id)), 0)
  from shift_entries se
  where se.chatter_id = p_chatter_id
    and se.shift_date between p_period_start and p_period_end;
$$;

-- Commission : toujours non retroactive (taux en vigueur a la date de chaque
-- shift, cf. migration 0007), mais appliquee desormais au net et non au brut.
create or replace function fn_chatter_period_commission(
  p_chatter_id uuid, p_period_start date, p_period_end date
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
  where se.chatter_id = p_chatter_id
    and se.shift_date between p_period_start and p_period_end;
$$;

-- Le detail brut / frais / net est fige a la cloture au meme titre que le
-- reste : une bascule ulterieure du taux de frais ne doit pas reecrire un
-- bulletin deja verse.
alter table payouts
  add column if not exists fee_eur numeric(12, 2) not null default 0,
  add column if not exists net_revenue_eur numeric(12, 2) not null default 0;

-- Le type de retour change : Postgres impose de supprimer avant de recreer.
-- fn_agency_margin appelle cette fonction depuis un corps plpgsql, resolu a
-- l'execution : la suppression ne la casse pas.
drop function if exists fn_agency_payroll(uuid, date, date);

create function fn_agency_payroll(p_agency_id uuid, p_period_start date, p_period_end date)
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
      fn_chatter_period_revenue(p.id, p_period_start, p_period_end) as revenue,
      fn_chatter_period_net_revenue(p.id, p_period_start, p_period_end) as net_revenue,
      fn_chatter_period_commission(p.id, p_period_start, p_period_end) as commission,
      fn_chatter_period_hours(p.id, p_period_start, p_period_end) as hrs,
      coalesce((
        select sum(b.amount_eur) from bonuses b
        where b.chatter_id = p.id
          and b.period_start = p_period_start and b.period_end = p_period_end
      ), 0) as bonus,
      coalesce((
        select sum(s.amount_eur) from sanctions s
        where s.chatter_id = p.id
          and s.period_start = p_period_start and s.period_end = p_period_end
      ), 0) as sanction,
      (
        select po.paid_at from payouts po
        where po.chatter_id = p.id
          and po.period_start = p_period_start and po.period_end = p_period_end
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
    -- Taux effectif rapporte au NET, la base sur laquelle la commission est
    -- desormais calculee : le rapporter au brut afficherait 9,6 % pour un
    -- chatter a 12 %, et donnerait l'impression d'une erreur de taux.
    case when b.net_revenue > 0 then round(b.commission / b.net_revenue * 100, 2) else 0 end,
    b.bonus,
    b.sanction,
    b.commission + b.bonus - b.sanction,
    b.hrs,
    case when b.hrs > 0 then round(b.revenue / b.hrs, 2) else 0 end,
    b.paid
  from base b
  where b.active or b.revenue > 0 or b.bonus > 0 or b.sanction > 0 or b.paid is not null
  order by b.revenue desc, b.full_name;
end;
$$;

-- Marge de l'agence : elle se mesure sur le CA net, pas sur le brut. Les 20 %
-- de la plateforme ne transitent jamais par l'agence — les compter dans sa
-- marge reviendrait a lui attribuer de l'argent qu'elle n'a pas encaisse.
--
-- Meme contrainte que ci-dessus : le type de retour gagne deux colonnes, donc
-- suppression prealable, `create or replace` ne sait pas le faire.
drop function if exists fn_agency_margin(uuid, date, date);

create function fn_agency_margin(p_agency_id uuid, p_period_start date, p_period_end date)
returns table (
  revenue_eur numeric,
  fee_eur numeric,
  net_revenue_eur numeric,
  payout_eur numeric,
  margin_eur numeric,
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
    coalesce(sum(p.revenue_eur), 0),
    coalesce(sum(p.fee_eur), 0),
    coalesce(sum(p.net_revenue_eur), 0),
    coalesce(sum(p.net_eur), 0),
    coalesce(sum(p.net_revenue_eur) - sum(p.net_eur), 0),
    case when coalesce(sum(p.net_revenue_eur), 0) > 0
      then round((sum(p.net_revenue_eur) - sum(p.net_eur)) / sum(p.net_revenue_eur) * 100, 2)
      else 0 end,
    coalesce(sum(p.hours), 0),
    count(*) filter (where p.active)
  from p;
end;
$$;

grant execute on function fn_platform_fee_pct() to authenticated, service_role;
grant execute on function fn_shift_entry_net_eur(uuid) to authenticated, service_role;
grant execute on function fn_chatter_period_net_revenue(uuid, date, date) to authenticated, service_role;
grant execute on function fn_agency_payroll(uuid, date, date) to authenticated, service_role;
grant execute on function fn_agency_margin(uuid, date, date) to authenticated, service_role;
