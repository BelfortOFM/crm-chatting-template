-- Recree model_monthly_goals et model_goal_allocations, dans leur schema
-- d'avant le passage au grain periode (mois calendaire, colonne `month`).
--
-- Ces deux tables avaient ete creees a la main sur la base de prod d'origine,
-- jamais via une migration (cf. commentaire de
-- 20260925000034_objectifs_par_periode.sql, qui les transforme par ALTER en
-- repartant de ce schema precis : rename `month` -> `period_start`, ajout de
-- `period_end`, nouvelles contraintes). Sans elles, `supabase db reset` sur
-- une base vierge echoue des cette migration.

create table if not exists model_monthly_goals (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  month date not null,
  target_amount_eur numeric not null default 0,
  unique (model_id, month)
);

create index if not exists model_monthly_goals_model_month_idx
  on model_monthly_goals(model_id, month desc);

alter table model_monthly_goals enable row level security;

drop policy if exists model_monthly_goals_admin_all on model_monthly_goals;
create policy model_monthly_goals_admin_all on model_monthly_goals
  for all
  using (is_agency_admin(model_agency_id(model_id)))
  with check (is_agency_admin(model_agency_id(model_id)));

create table if not exists model_goal_allocations (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  chatter_id uuid not null references profiles(id) on delete cascade,
  month date not null,
  target_amount_eur numeric not null default 0,
  unique (model_id, chatter_id, month)
);

create index if not exists model_goal_allocations_chatter_month_idx
  on model_goal_allocations(chatter_id, month desc);

alter table model_goal_allocations enable row level security;

drop policy if exists model_goal_allocations_own_select on model_goal_allocations;
create policy model_goal_allocations_own_select on model_goal_allocations
  for select
  using (chatter_id = auth.uid());

drop policy if exists model_goal_allocations_admin_all on model_goal_allocations;
create policy model_goal_allocations_admin_all on model_goal_allocations
  for all
  using (is_agency_admin(chatter_agency_id(chatter_id)))
  with check (is_agency_admin(chatter_agency_id(chatter_id)));
