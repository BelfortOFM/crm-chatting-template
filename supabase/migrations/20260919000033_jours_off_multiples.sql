-- Jours OFF multiples : un chatter peut poser plusieurs jours OFF dans sa
-- semaine, et non plus un seul.
--
-- La limite d'un jour OFF par semaine etait trop rigide (deux jours de repos
-- consecutifs etaient impossibles a poser soi-meme). On la retire. L'autre
-- garde-fou reste : pas de jour OFF dans le passe, ni a la pose, ni a la levee.
--
-- Le trigger `days_off_guard` continue d'appeler trg_days_off_guard() : le
-- `create or replace function` suffit, pas besoin de recreer le trigger.

create or replace function trg_days_off_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
begin
  if is_agency_admin(chatter_agency_id(new.chatter_id)) then
    return new;
  end if;

  -- Poser ou retirer un jour passe reviendrait a reecrire l'historique.
  if new.day_off < v_today then
    raise exception 'Cannot request a day OFF in the past.';
  end if;

  return new;
end;
$$;
