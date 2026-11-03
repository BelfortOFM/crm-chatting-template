-- Objectifs par periode (P1-P4) plutot que par mois calendaire.
--
-- model_monthly_goals et model_goal_allocations existaient deja en base,
-- avec de vraies donnees (objectifs deja configures par l'agence) — mais
-- creees a la main hors du systeme de migrations, jamais via une migration
-- versionnee ici. D'ou le double probleme : le code y ecrivait sans qu'aucun
-- fichier ne documente leur schema, et on ne peut pas se contenter d'un
-- `create table` pour passer au grain periode sans perdre ces objectifs.
--
-- On convertit donc en place (ALTER), jamais en DROP/CREATE. Un objectif
-- mensuel existant (month = premier jour du mois) devient une periode
-- couvrant tout ce mois (period_start = ce meme jour, period_end = dernier
-- jour du mois) : c'est la conversion la plus fidele possible — le montant
-- represente bien ce que l'agence visait sur CE mois precis, pas un
-- decoupage arbitraire en 4. Les nouveaux objectifs, eux, seront poses sur
-- une vraie periode P1-P4 (7-8 jours) par le code applicatif.

-- --- model_monthly_goals -> model_period_goals -----------------------------

alter table model_monthly_goals rename to model_period_goals;
alter table model_period_goals rename column month to period_start;
alter table model_period_goals add column if not exists period_end date;

update model_period_goals
set period_end = (date_trunc('month', period_start) + interval '1 month' - interval '1 day')::date
where period_end is null;

alter table model_period_goals alter column period_end set not null;

alter table model_period_goals drop constraint if exists model_monthly_goals_month_check;
alter table model_period_goals add constraint model_period_goals_range_check check (period_end >= period_start);

alter table model_period_goals drop constraint if exists model_monthly_goals_model_id_month_key;
alter table model_period_goals add constraint model_period_goals_model_id_period_key
  unique (model_id, period_start, period_end);

drop index if exists model_monthly_goals_model_month_idx;
create index if not exists model_period_goals_model_idx on model_period_goals(model_id, period_start desc);

alter table model_period_goals add column if not exists created_at timestamptz not null default now();

-- Les policies (deja bien concues : admin ecrit, agence + chatter assigne
-- lisent) survivent au rename de table et n'ont pas besoin d'etre recreees.

-- --- model_goal_allocations : month -> period_start/period_end ------------

alter table model_goal_allocations rename column month to period_start;
alter table model_goal_allocations add column if not exists period_end date;

update model_goal_allocations
set period_end = (date_trunc('month', period_start) + interval '1 month' - interval '1 day')::date
where period_end is null;

alter table model_goal_allocations alter column period_end set not null;

alter table model_goal_allocations drop constraint if exists model_goal_allocations_month_check;
alter table model_goal_allocations add constraint model_goal_allocations_range_check check (period_end >= period_start);

alter table model_goal_allocations drop constraint if exists model_goal_allocations_model_id_chatter_id_month_key;
alter table model_goal_allocations add constraint model_goal_allocations_model_id_chatter_id_period_key
  unique (model_id, chatter_id, period_start, period_end);

drop index if exists model_goal_allocations_chatter_month_idx;
create index if not exists model_goal_allocations_chatter_idx on model_goal_allocations(chatter_id, period_start desc);

alter table model_goal_allocations add column if not exists created_at timestamptz not null default now();

-- L'ancienne table monthly_goals (objectif pose sur la personne, sans lien
-- aux comptes) — si elle existe encore quelque part, elle n'est plus lue par
-- aucun code depuis que l'objectif a ete deplace sur les comptes.
drop table if exists monthly_goals;
