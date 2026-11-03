-- Un Team Leader peut desormais ajouter un avertissement ou une sanction a
-- un chatter de son equipe (= actuellement assigne a un modele qu'il mene).
--
-- L'avertissement est un nouveau concept, distinct de la sanction : une note
-- disciplinaire sans impact financier (pas de montant), donc une table a
-- part plutot qu'une sanction a 0€ -- le check existant sur sanctions
-- (amount_eur > 0) n'accepterait pas 0 de toute facon, et melanger les deux
-- dans une seule table rendrait fragile la distinction a l'affichage et dans
-- le calcul du Total Paye (qui ne doit prendre en compte que les sanctions).

create table warnings (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references profiles(id) on delete cascade,
  reason text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create index warnings_chatter_idx on warnings(chatter_id, created_at desc);

alter table warnings enable row level security;

create policy warnings_chatter_select on warnings
  for select
  using (chatter_id = auth.uid());

create policy warnings_admin_write on warnings
  for all
  using (is_agency_admin(chatter_agency_id(chatter_id)))
  with check (is_agency_admin(chatter_agency_id(chatter_id)));

-- Le TL gere entierement les avertissements/sanctions de son equipe (ajout
-- ET suppression), comme l'admin le fait deja -- mais jamais sur lui-meme :
-- `chatter_id != auth.uid()` exclu explicitement, sans quoi un TL qui
-- travaille lui-meme sur le modele qu'il mene pourrait s'auto-sanctionner
-- ou effacer ses propres sanctions (is_team_leader_for_chatter() ne fait
-- pas cette distinction, elle n'a pas a la faire pour les policies de
-- lecture du planning ou l'auto-lecture est sans consequence).
create policy warnings_team_leader_write on warnings
  for all
  using (chatter_id != auth.uid() and is_team_leader_for_chatter(chatter_id))
  with check (chatter_id != auth.uid() and is_team_leader_for_chatter(chatter_id));

create policy sanctions_team_leader_write on sanctions
  for all
  using (chatter_id != auth.uid() and is_team_leader_for_chatter(chatter_id))
  with check (chatter_id != auth.uid() and is_team_leader_for_chatter(chatter_id));
