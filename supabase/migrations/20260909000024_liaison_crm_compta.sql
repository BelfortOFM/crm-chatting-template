-- Liaison vers StriveCRM Comptabilite (projet Supabase distinct).
--
-- Le CRM compta saisit aujourd'hui a la main le CA net par modele et les
-- paiements par chatter, en recopiant les chiffres de cet outil. Une faute de
-- frappe suffit alors a payer le mauvais montant — c'est deja arrive par le
-- passe.
--
-- Les identifiants de l'autre base sont stockes ici, comme mypuls_user_id et
-- reveal_member_id : c'est la seule facon fiable de rapprocher deux referentiels
-- dont les libelles divergent. Cote compta plusieurs variantes d'un meme
-- modele peuvent etre regroupees sous un seul nom (ex. trois comptes
-- "ModeleA1/A2/REVEAL" compta uniquement "ModeleA"), et les prenoms ne
-- concordent pas toujours entre les deux outils.

alter table profiles add column if not exists compta_employee_id uuid;
alter table models   add column if not exists compta_model_id uuid;

-- Un employe ou un modele de la compta ne peut correspondre qu'a une seule
-- ligne ici : sans ca, deux chatters pousseraient leurs montants sur la meme
-- fiche de paie comptable, et le dernier ecraserait le premier.
create unique index if not exists profiles_compta_employee_id_uniq
  on profiles(compta_employee_id)
  where compta_employee_id is not null;

create unique index if not exists models_compta_model_id_uniq
  on models(compta_model_id)
  where compta_model_id is not null;

-- Plusieurs modeles d'ici peuvent viser le meme modele comptable (ex. les
-- trois variantes d'un meme modele), donc pas de contrainte inverse : c'est
-- un choix, l'agregation se fait a l'envoi.

-- Le garde de mise a jour du profil : un chatter ne doit pas pouvoir se
-- rattacher a la fiche comptable de quelqu'un d'autre. Corps identique par
-- ailleurs a la version de la migration 20260909000023.
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
    or new.compta_employee_id is distinct from old.compta_employee_id
  ) then
    raise exception 'Seul un administrateur peut modifier ces champs.';
  end if;

  return new;
end;
$$;
