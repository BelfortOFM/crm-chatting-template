-- Un identifiant comptable par plateforme.
--
-- StriveCRM tient un roster distinct par plateforme — employees, mym_employees,
-- reveal_employees — et un meme chatteur y porte un identifiant different sur
-- chacune. Une seule colonne ne pouvait donc pas suffire.
--
-- L'ancienne compta_employee_id devient compta_onlyfans_employee_id : sans le
-- nom de la plateforme, la colonne restante aurait laisse deviner laquelle des
-- trois elle designe. Le rename preserve les rattachements deja faits.

alter table profiles rename column compta_employee_id to compta_onlyfans_employee_id;
alter index if exists profiles_compta_employee_id_uniq rename to profiles_compta_onlyfans_employee_id_uniq;

alter table profiles add column if not exists compta_mym_employee_id uuid;
alter table profiles add column if not exists compta_reveal_employee_id uuid;

-- Un employe comptable ne correspond qu'a un seul chatter, roster par roster :
-- deux chatters pointant sur la meme fiche ecraseraient leurs montants.
create unique index if not exists profiles_compta_mym_employee_id_uniq
  on profiles(compta_mym_employee_id) where compta_mym_employee_id is not null;

create unique index if not exists profiles_compta_reveal_employee_id_uniq
  on profiles(compta_reveal_employee_id) where compta_reveal_employee_id is not null;

-- Le garde de mise a jour du profil : un chatter ne doit pas pouvoir se
-- rattacher a la fiche comptable d'un autre, sur aucune des trois plateformes.
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
    or new.compta_onlyfans_employee_id is distinct from old.compta_onlyfans_employee_id
    or new.compta_mym_employee_id is distinct from old.compta_mym_employee_id
    or new.compta_reveal_employee_id is distinct from old.compta_reveal_employee_id
  ) then
    raise exception 'Seul un administrateur peut modifier ces champs.';
  end if;

  return new;
end;
$$;
