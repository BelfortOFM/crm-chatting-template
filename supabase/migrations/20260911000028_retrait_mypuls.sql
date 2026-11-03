-- Retrait de Mypuls.
--
-- L'agence abandonne Mypuls au profit d'Infloww pour OnlyFans et MYM. Reveal
-- reste en place. Les identifiants Mypuls n'ont donc plus aucun usage : ils
-- designent des comptes sur une plateforme qu'on n'interroge plus, et ne
-- serviront pas a Infloww, dont le referentiel est different.
--
-- On les supprime plutot que de les renommer : la migration 20260902000007 avait
-- justement renomme les colonnes infloww_* en mypuls_* parce qu'elles etaient
-- vides. Cette fois elles contiennent des valeurs, et les garder sous un nom
-- Infloww ferait croire a un rapprochement deja fait.

alter table profiles drop column if exists mypuls_user_id;
alter table models   drop column if exists mypuls_creator_id;

-- Le garde de mise a jour du profil listait mypuls_user_id parmi les champs
-- qu'un chatter ne peut pas modifier lui-meme. Recree sans lui, corps identique
-- par ailleurs a la version de la migration 20260910000027.
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
    or new.reveal_member_id is distinct from old.reveal_member_id
    or new.compta_onlyfans_employee_id is distinct from old.compta_onlyfans_employee_id
    or new.compta_mym_employee_id is distinct from old.compta_mym_employee_id
    or new.compta_reveal_employee_id is distinct from old.compta_reveal_employee_id
  ) then
    raise exception 'Seul un administrateur peut modifier ces champs.';
  end if;

  return new;
end;
$$;
