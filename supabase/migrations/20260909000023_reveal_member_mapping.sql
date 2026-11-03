-- Lien entre un chatter du CRM et son membre d'equipe cote Reveal.
--
-- Reveal attribue chaque euro encaisse a un `agencyMemberId` : c'est ce qui
-- rend possible la comparaison declare/tracke par chatter, comme le fait
-- attributed_user_id chez Mypuls.
--
-- L'identifiant est stocke plutot que devine par le nom, et pour une raison
-- vecue : une coquille de prenom entre deux outils (ex. "Prenom A" cote CRM,
-- orthographe legerement differente cote Mypuls) a deja fait echouer une
-- liaison automatique par prenom. Cote Reveal c'est pire encore — certains
-- membres y sont nommes par creneau plutot que par prenom (ex. "Membre A /
-- 09-15 et 21-03"). Aucun rapprochement automatique fiable n'est possible
-- la-dessus.

alter table profiles add column if not exists reveal_member_id uuid;

-- Un membre Reveal ne peut correspondre qu'a un seul chatter : sans cette
-- contrainte, une erreur de saisie ferait compter deux fois le meme CA.
create unique index if not exists profiles_reveal_member_id_uniq
  on profiles(reveal_member_id)
  where reveal_member_id is not null;

-- Le garde de mise a jour du profil liste les champs qu'un chatter ne peut pas
-- modifier lui-meme. Sans cet ajout, il pourrait se rattacher au membre Reveal
-- de quelqu'un d'autre en appelant l'API directement, et s'attribuer son CA.
-- Corps identique par ailleurs a la version de la migration 20260902000007.
create or replace function trg_profile_self_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_agency_admin(new.agency_id) then
    return new;
  end if;

  if new.id = auth.uid() and (
       new.role is distinct from old.role
    or new.agency_id is distinct from old.agency_id
    or new.full_name is distinct from old.full_name
    or new.active is distinct from old.active
    or new.left_on is distinct from old.left_on
    or new.mypuls_user_id is distinct from old.mypuls_user_id
    or new.reveal_member_id is distinct from old.reveal_member_id
  ) then
    raise exception 'Seul un administrateur peut modifier ces champs.';
  end if;

  return new;
end;
$$;
