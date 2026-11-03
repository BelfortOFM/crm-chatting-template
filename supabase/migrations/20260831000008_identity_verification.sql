-- Verification d'identite des chatters (KYC interne).
--
-- Objectif : s'assurer qu'un chatter recrute a distance est bien la personne
-- qu'il pretend etre, avant de lui confier des comptes clients et de lui
-- verser de l'argent.
--
-- Ce que cette migration stocke, et surtout ce qu'elle NE stocke PAS :
--   - la table ne contient que des METADONNEES (statut, dates, chemins) ;
--   - les images vivent dans un bucket Supabase Storage prive, chiffrees
--     applicativement (AES-256-GCM) avant meme d'y etre deposees, cf.
--     lib/identity-crypto.ts. Sans la cle, le contenu du bucket est inutile.
--   - aucun numero de piece, aucune date de naissance : on ne collecte pas
--     ce qu'on n'exploite pas.
--
-- Les documents d'identite sont des donnees personnelles : conservation
-- limitee (voir fn_purge_identity_documents plus bas) et acces restreint aux
-- seuls administrateurs de l'agence.

create table if not exists identity_verifications (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null unique references profiles(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,

  -- pending   : compte cree, rien n'a encore ete envoye
  -- submitted : les trois pieces sont deposees, en attente de revue
  -- approved  : identite validee par un admin
  -- rejected  : refusee (photo illisible, incoherence...), le chatter reprend
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'approved', 'rejected')),

  -- Chemins dans le bucket prive. Jamais d'URL publique.
  id_front_path text,
  id_back_path text,
  selfie_path text,

  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id) on delete set null,
  rejection_reason text,

  -- Date de purge prevue : les pieces n'ont pas vocation a etre conservees
  -- indefiniment une fois la verification faite.
  purge_after date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists identity_verifications_agency_status_idx
  on identity_verifications(agency_id, status);

-- Un chatter voit sa propre ligne (pour connaitre l'etat de sa demande) et
-- peut la remplir tant qu'elle n'est pas validee. Il ne peut jamais changer
-- son propre statut en 'approved' : c'est verrouille par le trigger ci-dessous.
alter table identity_verifications enable row level security;

drop policy if exists identity_own_select on identity_verifications;
create policy identity_own_select on identity_verifications
  for select using (chatter_id = auth.uid());

drop policy if exists identity_own_insert on identity_verifications;
create policy identity_own_insert on identity_verifications
  for insert with check (chatter_id = auth.uid());

drop policy if exists identity_own_update on identity_verifications;
create policy identity_own_update on identity_verifications
  for update using (chatter_id = auth.uid() and status in ('pending', 'rejected'));

drop policy if exists identity_admin_all on identity_verifications;
create policy identity_admin_all on identity_verifications
  for all
  using (is_agency_admin(agency_id))
  with check (is_agency_admin(agency_id));

-- Un chatter ne doit pas pouvoir s'auto-valider en tapant directement
-- PostgREST : seul un admin peut ecrire un statut de revue.
create or replace function trg_identity_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  if is_agency_admin(new.agency_id) then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.status not in ('pending', 'submitted') then
    raise exception 'Seul un administrateur peut valider ou refuser une vérification.';
  end if;

  if tg_op = 'INSERT' and new.status not in ('pending', 'submitted') then
    raise exception 'Statut initial invalide.';
  end if;

  -- Les champs de revue sont reserves aux admins.
  if tg_op = 'UPDATE' and (
       new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
  ) then
    raise exception 'Champs de revue reserves aux administrateurs.';
  end if;

  return new;
end;
$$;

drop trigger if exists identity_guard on identity_verifications;
create trigger identity_guard
  before insert or update on identity_verifications
  for each row execute function trg_identity_guard();

-- Ligne creee automatiquement a l'arrivee d'un chatter : l'ecran de
-- verification a toujours une ligne a lire, sans cas particulier cote code.
create or replace function trg_create_identity_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'chatter' then
    insert into identity_verifications (chatter_id, agency_id)
    values (new.id, new.agency_id)
    on conflict (chatter_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists create_identity_row on profiles;
create trigger create_identity_row
  after insert on profiles
  for each row execute function trg_create_identity_row();

-- Rattrapage pour les chatters deja en base.
insert into identity_verifications (chatter_id, agency_id)
select p.id, p.agency_id from profiles p
where p.role = 'chatter'
on conflict (chatter_id) do nothing;

-- Liste des pieces a purger : une fois l'identite validee, les images n'ont
-- plus a etre conservees au-dela du delai fixe. La suppression effective des
-- fichiers se fait cote application (le SQL ne voit pas le bucket).
create or replace function fn_identity_documents_to_purge(p_agency_id uuid)
returns table (chatter_id uuid, id_front_path text, id_back_path text, selfie_path text)
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
  select v.chatter_id, v.id_front_path, v.id_back_path, v.selfie_path
  from identity_verifications v
  where v.agency_id = p_agency_id
    and v.purge_after is not null
    and v.purge_after < (now() at time zone 'Europe/Paris')::date
    and (v.id_front_path is not null or v.id_back_path is not null or v.selfie_path is not null);
end;
$$;

grant execute on function fn_identity_documents_to_purge(uuid) to authenticated;
