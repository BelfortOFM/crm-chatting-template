-- Team Leader : un chatter assigné à une Modèle en particulier, avec un
-- accès en LECTURE SEULE au planning de tous les chatters liés à cette
-- modèle (toutes plateformes). Il reste un chatter normal par ailleurs — il
-- continue de déclarer ses propres shifts — donc ce n'est pas un rôle
-- exclusif comme profiles.role (agency_admin/chatter) : c'est une
-- responsabilité qui se superpose, modélisée comme une assignation
-- historisée de plus, sur le même patron que chatter_model_assignments.

create table team_leader_assignments (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references profiles(id) on delete cascade,
  model_id uuid not null references models(id) on delete cascade,
  assigned_from date not null default current_date,
  assigned_to date, -- null = toujours actif
  check (assigned_to is null or assigned_to >= assigned_from)
);

create index team_leader_assignments_chatter_idx on team_leader_assignments(chatter_id);
create index team_leader_assignments_model_idx on team_leader_assignments(model_id);

-- Une seule mission active a la fois pour un (chatter, modele) donne —
-- interdit le doublon, pas le fait d'etre TL sur plusieurs modeles.
create unique index team_leader_assignments_active_uniq
  on team_leader_assignments(chatter_id, model_id)
  where assigned_to is null;

alter table team_leader_assignments enable row level security;

-- Le TL voit sa propre mission (pour savoir quel(s) modele(s) il mene) ;
-- seul l'admin de l'agence peut la poser/lever.
create policy team_leader_assignments_chatter_select on team_leader_assignments
  for select
  using (chatter_id = auth.uid());

create policy team_leader_assignments_admin_write on team_leader_assignments
  for all
  using (is_agency_admin(chatter_agency_id(chatter_id)))
  with check (is_agency_admin(chatter_agency_id(chatter_id)));

-- Un chatter est-il, en ce moment, sous la responsabilite d'un Team Leader
-- (= auth.uid() mene activement un modele auquel ce chatter est lui-meme
-- activement assigne) ? SECURITY DEFINER : la policy doit pouvoir lire
-- team_leader_assignments et chatter_model_assignments de tiers, ce que les
-- policies normales de ces tables n'autorisent pas pour un simple chatter.
create or replace function is_team_leader_for_chatter(p_chatter_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from team_leader_assignments tl
    join chatter_model_assignments cma
      on cma.model_id = tl.model_id
     and cma.chatter_id = p_chatter_id
     and cma.assigned_from <= current_date
     and (cma.assigned_to is null or cma.assigned_to >= current_date)
    where tl.chatter_id = auth.uid()
      and tl.assigned_from <= current_date
      and (tl.assigned_to is null or tl.assigned_to >= current_date)
  );
$$;

-- Portee du TL : qui est lie a son modele (pour lister les chatters a
-- afficher), puis leur planning (creneaux + jours OFF). Lecture seule --
-- aucune policy d'ecriture n'est ajoutee pour le TL sur ces tables.

create policy chatter_model_assignments_team_leader_select on chatter_model_assignments
  for select
  using (
    exists (
      select 1 from team_leader_assignments tl
      where tl.chatter_id = auth.uid()
        and tl.model_id = chatter_model_assignments.model_id
        and tl.assigned_from <= current_date
        and (tl.assigned_to is null or tl.assigned_to >= current_date)
    )
  );

create policy chatter_shift_assignments_team_leader_select on chatter_shift_assignments
  for select
  using (is_team_leader_for_chatter(chatter_id));

create policy chatter_days_off_team_leader_select on chatter_days_off
  for select
  using (is_team_leader_for_chatter(chatter_id));
