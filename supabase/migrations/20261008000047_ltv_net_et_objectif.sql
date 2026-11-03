-- LTV sur le CA net (et non plus brut), + objectif de LTV par modele et par
-- periode, visible par les chatters assignes au modele concerne.
--
-- fn_agency_ltv (20260831000015) sommait fn_shift_entry_total_eur, le brut.
-- Une seule definition de LTV dans tout l'outil : on la bascule sur le net
-- (fn_shift_entry_net_eur, deja la base de la commission et de la marge
-- depuis 20260917000032) plutot que d'en faire cohabiter deux.

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
        select sum(fn_shift_entry_net_eur(se.id))
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

-- LTV d'UN modele sur une periode donnee (CA net / abonnes au dernier
-- releve connu a la fin de la periode). Sert au dashboard chatter : chaque
-- chatter n'y voit que les modeles auxquels il est assigne, mais la fonction
-- doit sommer le CA de TOUS les chatters sur ce modele (une LTV se mesure a
-- l'echelle du compte, pas d'un seul chatter) -- security definer, avec
-- l'autorisation verifiee explicitement puisque la RLS de shift_entries,
-- elle, ne laisse voir que ses propres lignes.
create or replace function fn_model_ltv(p_model_id uuid, p_period_start date, p_period_end date)
returns table (revenue_eur numeric, subscribers integer, ltv_eur numeric)
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

  select coalesce(sum(fn_shift_entry_net_eur(se.id)), 0) into v_revenue
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

grant execute on function fn_model_ltv(uuid, date, date) to authenticated;

-- Objectif de LTV par modele et par periode P1-P4 (jamais une semaine
-- calendaire, qui n'existe nulle part ailleurs dans l'outil comme unite de
-- decision -- cf. objectifs de CA, commission, classement). Meme patron que
-- model_period_goals : fixe par l'admin, lu par tout membre de l'agence.
create table model_period_ltv_targets (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  target_ltv_eur numeric(10, 2) not null check (target_ltv_eur >= 0),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (model_id, period_start, period_end)
);

create index model_period_ltv_targets_model_idx on model_period_ltv_targets(model_id, period_start desc);

alter table model_period_ltv_targets enable row level security;

create policy model_period_ltv_targets_member_select on model_period_ltv_targets
  for select using (is_agency_member(model_agency_id(model_id)));

create policy model_period_ltv_targets_admin_write on model_period_ltv_targets
  for all
  using (is_agency_admin(model_agency_id(model_id)))
  with check (is_agency_admin(model_agency_id(model_id)));
