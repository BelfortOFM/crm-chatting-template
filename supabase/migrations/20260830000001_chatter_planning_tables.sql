-- Recree chatter_shift_assignments et chatter_days_off.
--
-- Ces deux tables avaient ete creees a la main sur la base de prod d'origine,
-- jamais via une migration (cf. commentaire de 20260831000011_planning_rules.sql,
-- qui part du principe qu'elles existent deja). Resultat : `supabase db reset`
-- sur une base vierge echoue des cette migration. Schema reconstitue a partir
-- de l'usage reel du code et des migrations suivantes qui y touchent
-- (20260831000011/12/14/18, 20260902000019, 20261004000041, 20261007000043,
-- 20261008000044) : colonnes, contraintes et policies RLS qu'elles supposent
-- deja presentes.

create table if not exists chatter_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references profiles(id) on delete cascade,
  -- Nullable : un creneau peut valoir pour tous les modeles du chatter
  -- (cf. 20260831000012) ou viser un modele precis (cf. 20260902000019).
  model_id uuid references models(id) on delete cascade,
  shift_slot text not null check (shift_slot in ('03-09', '09-15', '15-21', '21-03')),
  assigned_from date not null,
  assigned_to date
);

create index if not exists chatter_shift_assignments_chatter_idx
  on chatter_shift_assignments(chatter_id);

alter table chatter_shift_assignments enable row level security;

drop policy if exists chatter_shift_assignments_own_select on chatter_shift_assignments;
create policy chatter_shift_assignments_own_select on chatter_shift_assignments
  for select
  using (chatter_id = auth.uid());

drop policy if exists chatter_shift_assignments_admin_all on chatter_shift_assignments;
create policy chatter_shift_assignments_admin_all on chatter_shift_assignments
  for all
  using (is_agency_admin(chatter_agency_id(chatter_id)))
  with check (is_agency_admin(chatter_agency_id(chatter_id)));

create table if not exists chatter_days_off (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references profiles(id) on delete cascade,
  day_off date not null,
  unique (chatter_id, day_off)
);

alter table chatter_days_off enable row level security;

drop policy if exists chatter_days_off_own_all on chatter_days_off;
create policy chatter_days_off_own_all on chatter_days_off
  for all
  using (chatter_id = auth.uid())
  with check (chatter_id = auth.uid());

drop policy if exists chatter_days_off_admin_all on chatter_days_off;
create policy chatter_days_off_admin_all on chatter_days_off
  for all
  using (is_agency_admin(chatter_agency_id(chatter_id)))
  with check (is_agency_admin(chatter_agency_id(chatter_id)));
