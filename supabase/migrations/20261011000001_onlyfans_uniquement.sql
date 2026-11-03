-- Retrait du multi-plateforme : seule OnlyFans reste integree. Les agences
-- gardent la possibilite d'ajouter leurs propres plateformes personnalisees
-- (table custom_platforms, migration 20260917000031, inchangee) — seules les
-- trois integrees Fansly/MYM/Reveal disparaissent, avec tout ce qui leur etait
-- propre (mapping Reveal, roster comptable MYM/Reveal, paie bi-hebdomadaire).

-- --- 1. Mapping Reveal -------------------------------------------------------

alter table profiles drop column if exists reveal_member_id;
alter table models drop column if exists reveal_model_id;

-- --- 2. Roster comptable MYM/Reveal ------------------------------------------
-- compta_onlyfans_employee_id reste : c'est le seul roster encore utilise.

alter table profiles drop column if exists compta_mym_employee_id;
alter table profiles drop column if exists compta_reveal_employee_id;

-- --- 3. Garde de profil : meme corps que la derniere version (migration
-- 20260914000030), moins les trois colonnes retirees ci-dessus. -------------

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
    or new.infloww_email is distinct from old.infloww_email
    or new.compta_onlyfans_employee_id is distinct from old.compta_onlyfans_employee_id
  ) then
    raise exception 'Seul un administrateur peut modifier ces champs.';
  end if;

  return new;
end;
$$;

-- --- 4. Devise d'un modele : OnlyFans ou plateforme personnalisee -----------

create or replace function fn_model_currency()
returns trigger
language plpgsql
as $$
begin
  if new.currency is null then
    new.currency := case
      when new.platform = 'onlyfans' then 'USD'
      else (
        select cp.currency from custom_platforms cp
        where cp.agency_id = new.agency_id and cp.code = new.platform
      )
    end;
  end if;
  if new.currency is null then
    raise exception 'Plateforme inconnue pour ce modèle : %', new.platform;
  end if;
  return new;
end;
$$;
