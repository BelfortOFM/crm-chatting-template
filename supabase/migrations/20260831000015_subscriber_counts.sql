-- Nombre d'abonnes par modele, releve a la main.
--
-- Ni OnlyFans ni Infloww n'exposent d'API : OnlyFans n'en a jamais publie, et
-- Infloww est une surcouche de leur interface, sans acces developpeur. Les
-- API tierces qui circulent sont du reverse engineering et exposent le compte
-- de la creatrice a une suspension — hors de question pour un indicateur.
--
-- Le nombre d'abonnes est un STOCK qui bouge lentement : un releve
-- hebdomadaire donne une LTV aussi juste qu'un flux temps reel.
--
-- Historise par date, volontairement : sans cela, la LTV d'une periode passee
-- se recalculerait sur les abonnes d'aujourd'hui et changerait toute seule
-- d'un mois sur l'autre.

create table if not exists model_subscriber_counts (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,
  recorded_on date not null default (now() at time zone 'Europe/Paris')::date,
  subscriber_count integer not null check (subscriber_count >= 0),
  recorded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Un seul releve par modele et par jour : corriger une saisie remplace la
  -- valeur du jour au lieu d'empiler deux verites contradictoires.
  unique (model_id, recorded_on)
);

create index if not exists model_subscriber_counts_lookup_idx
  on model_subscriber_counts(model_id, recorded_on desc);

alter table model_subscriber_counts enable row level security;

drop policy if exists subs_member_select on model_subscriber_counts;
create policy subs_member_select on model_subscriber_counts
  for select using (is_agency_member(agency_id));

drop policy if exists subs_admin_write on model_subscriber_counts;
create policy subs_admin_write on model_subscriber_counts
  for all
  using (is_agency_admin(agency_id))
  with check (is_agency_admin(agency_id));

-- Abonnes d'un modele a une date donnee : le dernier releve connu a cette
-- date, et non le plus recent en base.
create or replace function fn_model_subscribers_at(p_model_id uuid, p_on date)
returns integer
language sql
stable
as $$
  select coalesce((
    select subscriber_count
    from model_subscriber_counts
    where model_id = p_model_id and recorded_on <= p_on
    order by recorded_on desc
    limit 1
  ), 0);
$$;

-- LTV de l'agence sur une periode : CA genere rapporte au nombre d'abonnes.
--
-- Seuls comptent les modeles ayant un releve : inclure un compte dont on
-- ignore l'audience gonflerait artificiellement le ratio.
create or replace function fn_agency_ltv(p_agency_id uuid, p_period_start date, p_period_end date)
returns table (revenue_eur numeric, subscribers bigint, ltv_eur numeric, models_counted bigint, models_total bigint)
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
        select sum(fn_shift_entry_total_eur(se.id))
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

grant execute on function fn_model_subscribers_at(uuid, date) to authenticated;
grant execute on function fn_agency_ltv(uuid, date, date) to authenticated;
