-- The agency switched from Infloww to Mypuls before the mapping columns
-- added in 20260824000006 were ever filled in (still all null) — renaming
-- in place rather than adding a second, parallel pair of columns.

alter table profiles rename column infloww_employee_id to mypuls_user_id;
alter table models rename column infloww_platform_pid to mypuls_creator_id;

alter index profiles_infloww_employee_id_uniq rename to profiles_mypuls_user_id_uniq;
alter index models_infloww_platform_pid_uniq rename to models_mypuls_creator_id_uniq;

-- trg_profile_self_update_guard (20260831000016) still references the old
-- column name textually — plpgsql only resolves that at call time, so it
-- would only break the next time a chatter updates their own profile.
-- Recreated here with the renamed column, body otherwise unchanged.
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
  ) then
    raise exception 'Seul un administrateur peut modifier ces champs.';
  end if;

  return new;
end;
$$;
