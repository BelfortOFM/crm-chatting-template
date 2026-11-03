-- Mot de passe provisoire a la creation d'un compte chatter.
--
-- L'admin genere un mot de passe et le transmet par message : il transite
-- donc en clair, et reste connu de deux personnes. Tant qu'il n'est pas
-- remplace, "le chatter s'est connecte" ne prouve pas que c'est bien lui.
-- Le drapeau force le changement a la premiere connexion.

alter table profiles add column if not exists must_change_password boolean not null default false;

-- Les chatters deja en place ont, eux aussi, un mot de passe qui leur a ete
-- transmis : ils passent par la meme etape a leur prochaine connexion.
update profiles set must_change_password = true where role = 'chatter';

-- Un chatter doit pouvoir lever son propre drapeau — mais uniquement celui-la.
-- Sans cette policy, la mise a jour passerait par la cle de service, ce qui
-- reviendrait a contourner la RLS pour une action que l'interesse a le droit
-- de faire.
drop policy if exists profiles_own_password_flag on profiles;
create policy profiles_own_password_flag on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Le champ libre reste interdit au titulaire : role, agence, nom et statut
-- d'activite ne sont modifiables que par un admin.
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
    or new.infloww_employee_id is distinct from old.infloww_employee_id
  ) then
    raise exception 'Seul un administrateur peut modifier ces champs.';
  end if;

  return new;
end;
$$;

drop trigger if exists profile_self_update_guard on profiles;
create trigger profile_self_update_guard
  before update on profiles
  for each row execute function trg_profile_self_update_guard();
