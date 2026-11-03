-- Règles automatiques de prime/sanction par modèle.
--
-- Une règle porte sur un modèle (donc implicitement sur sa plateforme, via
-- models.platform) et déclenche un montant forfaitaire en dollars dès qu'un
-- chatter génère du CA sur ce modèle pendant une période.
--
-- Le montant est saisi en dollars (amount_usd) et converti en euros au moment
-- de l'application, au taux courant de l'agence — même convention que la saisie
-- manuelle sur le récapitulatif, où l'on raisonne en $ mais stocke en €.
--
-- L'application est déclenchée par un bouton explicite, jamais au chargement
-- d'une page : une lecture ne doit rien écrire en base, et réappliquer doit
-- rester sans effet (idempotence portée par source_rule_id).

create table if not exists model_payroll_rules (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id) on delete cascade,
  kind text not null check (kind in ('bonus', 'sanction')),
  amount_usd numeric(10, 2) not null check (amount_usd > 0),
  reason text not null,
  active boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists model_payroll_rules_model_idx on model_payroll_rules(model_id);

-- Traçabilité : une prime/sanction générée par une règle porte l'id de cette
-- règle. Deux usages :
--   1. marquer visuellement les lignes auto-générées dans le récapitulatif ;
--   2. dédupliquer : réappliquer les règles ne re-crée rien, on saute toute
--      règle dont une ligne existe déjà pour (chatter, période).
-- ON DELETE SET NULL : supprimer/désactiver une règle n'efface pas l'historique
-- déjà versé ; une ligne orpheline redevient simplement « manuelle ».
alter table bonuses add column if not exists source_rule_id uuid references model_payroll_rules(id) on delete set null;
alter table sanctions add column if not exists source_rule_id uuid references model_payroll_rules(id) on delete set null;

create index if not exists bonuses_source_rule_idx on bonuses(source_rule_id);
create index if not exists sanctions_source_rule_idx on sanctions(source_rule_id);

-- RLS : réservé aux admins de l'agence du modèle. Les chatters n'ont pas à
-- lire les règles, seulement les primes/sanctions qui en découlent.
alter table model_payroll_rules enable row level security;

drop policy if exists model_payroll_rules_admin_all on model_payroll_rules;
create policy model_payroll_rules_admin_all on model_payroll_rules
  for all
  using (is_agency_admin(model_agency_id(model_id)))
  with check (is_agency_admin(model_agency_id(model_id)));
