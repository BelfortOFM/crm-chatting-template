-- Outillage de management : paie, cycle de vie des chatters, heures
-- travaillees et tracabilite.
--
-- Contexte : l'interface admin savait configurer (creer des chatters, des
-- modeles, fixer le taux) mais pas piloter. Trois manques bloquaient le
-- travail hebdomadaire d'un responsable d'agence :
--   1. aucun ecran ne disait combien verser a qui — le calcul se refaisait
--      a la main, fiche par fiche, tous les 7 jours ;
--   2. un chatter qui partait ne pouvait pas etre retire : il restait dans
--      les classements a 0, et le supprimer aurait efface son CA en cascade ;
--   3. les heures de shift etaient saisies mais jamais exploitees, alors que
--      le CA horaire est l'indicateur qui permet de comparer deux chatters.

-- 1. Cycle de vie du chatter ------------------------------------------------
-- Desactiver plutot que supprimer : l'historique de CA doit survivre au
-- depart de la personne (shift_entries est en ON DELETE CASCADE).

alter table profiles add column if not exists active boolean not null default true;
alter table profiles add column if not exists left_on date;

create index if not exists profiles_agency_active_idx on profiles(agency_id, active);

-- 2. Heures travaillees -----------------------------------------------------

-- Duree d'un shift en heures. Un shift qui finit avant son heure de debut a
-- traverse minuit (22h -> 02h) : on ajoute 24h a l'ECART, et non a l'heure de
-- fin — `time + interval '24 hours'` boucle sur 24h en Postgres et renverrait
-- une duree negative (verifie : 22h->02h donnait -20h).
create or replace function fn_shift_hours(p_start time, p_end time)
returns numeric
language sql
immutable
as $$
  select round(
    (extract(epoch from (
      case when p_end >= p_start then p_end - p_start
           else (p_end - p_start) + interval '24 hours'
      end
    )) / 3600.0)::numeric
  , 2);
$$;

create or replace function fn_chatter_period_hours(p_chatter_id uuid, p_period_start date, p_period_end date)
returns numeric
language sql
stable
as $$
  select coalesce(sum(fn_shift_hours(se.start_time, se.end_time)), 0)
  from shift_entries se
  where se.chatter_id = p_chatter_id
    and se.shift_date between p_period_start and p_period_end;
$$;

-- 3. Commission non retroactive ---------------------------------------------
-- Le taux applique est celui en vigueur A LA DATE DE CHAQUE SHIFT, et non le
-- taux courant applique a toute la periode : sinon un changement de taux en
-- milieu de periode recalculait aussi les jours deja travailles.

create or replace function fn_chatter_period_commission(p_chatter_id uuid, p_period_start date, p_period_end date)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    fn_shift_entry_total_eur(se.id) * coalesce((
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

-- 4. Cloture de paie --------------------------------------------------------
-- Les montants sont figes a la cloture : une correction ulterieure d'un shift
-- ne doit pas reecrire ce qui a deja ete verse. full_name est denormalise pour
-- que le journal reste lisible meme si le profil disparait un jour.

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  chatter_id uuid not null references profiles(id) on delete cascade,
  chatter_name text not null,
  period_start date not null,
  period_end date not null,
  revenue_eur numeric(12, 2) not null,
  commission_eur numeric(12, 2) not null,
  bonus_eur numeric(12, 2) not null default 0,
  sanction_eur numeric(12, 2) not null default 0,
  net_eur numeric(12, 2) not null,
  hours numeric(8, 2) not null default 0,
  paid_at timestamptz not null default now(),
  paid_by uuid references profiles(id),
  note text,
  unique (chatter_id, period_start, period_end),
  check (period_end >= period_start)
);

create index if not exists payouts_agency_period_idx on payouts(agency_id, period_start desc);

-- 5. Journal d'audit --------------------------------------------------------
-- Sur un outil qui determine des remunerations et compte plusieurs admins,
-- il faut pouvoir repondre a "qui a change ce taux / supprime ce bonus".
-- actor_name est denormalise pour la meme raison que chatter_name ci-dessus.

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,
  actor_name text not null,
  action text not null,
  target_label text,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_agency_created_idx on audit_log(agency_id, created_at desc);

-- 6. Paie d'agence sur une periode -----------------------------------------
-- Une seule requete pour l'ecran de paie : CA, commission, bonus, sanctions,
-- net, heures et CA horaire par chatter. SECURITY DEFINER pour agreger les
-- lignes de tous les chatters, mais reserve aux admins de l'agence visee.
--
-- Sont listes les chatters actifs ET les inactifs ayant travaille sur la
-- periode : quelqu'un qui part en milieu de periode doit encore etre paye.

create or replace function fn_agency_payroll(p_agency_id uuid, p_period_start date, p_period_end date)
returns table (
  chatter_id uuid,
  full_name text,
  active boolean,
  revenue_eur numeric,
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
    b.commission,
    case when b.revenue > 0 then round(b.commission / b.revenue * 100, 2) else 0 end,
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

-- 7. Sante de l'agence sur une periode --------------------------------------
-- Ce que l'agence encaisse vraiment : CA genere moins ce qui est reverse.

create or replace function fn_agency_margin(p_agency_id uuid, p_period_start date, p_period_end date)
returns table (
  revenue_eur numeric,
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
    coalesce(sum(p.net_eur), 0),
    coalesce(sum(p.revenue_eur) - sum(p.net_eur), 0),
    case when coalesce(sum(p.revenue_eur), 0) > 0
      then round((sum(p.revenue_eur) - sum(p.net_eur)) / sum(p.revenue_eur) * 100, 2)
      else 0 end,
    coalesce(sum(p.hours), 0),
    count(*) filter (where p.revenue_eur > 0)
  from p;
end;
$$;

-- 8. Revenu par modele -------------------------------------------------------
-- Quel compte rapporte, cote agence (l'equivalent existait deja cote chatter
-- mais uniquement pour ses propres shifts).

create or replace function fn_agency_model_revenue(p_agency_id uuid, p_period_start date, p_period_end date)
returns table (model_id uuid, model_name text, platform text, revenue_eur numeric, hours numeric)
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
    coalesce(sum(fn_shift_entry_total_eur(se.id)), 0) as revenue,
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

-- 9. Historique mensuel de l'agence -----------------------------------------
-- Alimente la courbe de tendance : sans historique, impossible de reperer un
-- decrochage avant qu'il ne coute cher.

create or replace function fn_agency_monthly_history(p_agency_id uuid, p_months int default 6)
returns table (month date, revenue_eur numeric, hours numeric)
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
    coalesce(sum(fn_shift_entry_total_eur(se.id)), 0),
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

-- 10. RLS des nouvelles tables ----------------------------------------------

alter table payouts enable row level security;
alter table audit_log enable row level security;

-- Un chatter doit pouvoir consulter ses propres versements (transparence sur
-- ce qui lui a ete paye) ; seuls les admins ecrivent.
drop policy if exists payouts_own_select on payouts;
create policy payouts_own_select on payouts
  for select
  using (chatter_id = auth.uid());

drop policy if exists payouts_admin_all on payouts;
create policy payouts_admin_all on payouts
  for all
  using (is_agency_admin(agency_id))
  with check (is_agency_admin(agency_id));

-- Le journal d'audit n'est lisible que par les admins, et personne ne peut
-- le modifier ni l'effacer : pas de policy update/delete, volontairement.
drop policy if exists audit_log_admin_select on audit_log;
create policy audit_log_admin_select on audit_log
  for select
  using (is_agency_admin(agency_id));

drop policy if exists audit_log_admin_insert on audit_log;
create policy audit_log_admin_insert on audit_log
  for insert
  with check (is_agency_admin(agency_id));

grant execute on function
  fn_shift_hours(time, time),
  fn_chatter_period_hours(uuid, date, date),
  fn_chatter_period_commission(uuid, date, date),
  fn_agency_payroll(uuid, date, date),
  fn_agency_margin(uuid, date, date),
  fn_agency_model_revenue(uuid, date, date),
  fn_agency_monthly_history(uuid, int)
to authenticated;

-- 11. Classements : exclure les partis sans effacer l'histoire ---------------
-- Un chatter desactive ne doit plus concourir, mais il reste visible sur une
-- periode ou il a effectivement travaille (depart en cours de periode).

create or replace function fn_agency_leaderboard(p_agency_id uuid, p_period_start date, p_period_end date)
returns table (chatter_id uuid, full_name text, total_eur numeric, rank bigint)
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

create or replace function fn_agency_leaderboard_month(p_agency_id uuid, p_month date)
returns table (chatter_id uuid, full_name text, total_eur numeric, rank bigint)
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
    select p.id, p.full_name, p.active, coalesce(s.total_month_eur, 0) as total
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
