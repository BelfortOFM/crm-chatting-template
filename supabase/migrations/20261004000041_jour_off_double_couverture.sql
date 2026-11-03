-- Deux chatters sur le meme creneau et le meme modele assurent la meme
-- couverture (c'est le principe du planning par modele, migration
-- 20260902000019) : si les deux posent le meme jour en repos, plus personne
-- ne couvre ce modele sur ce creneau ce jour-la. On bloque le second quand
-- le premier a deja pose le jour.
--
-- Comparaison sur model_id via `is not distinct from` : deux creneaux
-- generiques ("tous modeles", model_id null) comptent comme le meme modele,
-- coherent avec l'index unique existant (migration 20260902000019). Limite
-- connue et acceptee : un creneau generique (null) ne detecte pas la
-- collision avec un creneau pose sur un modele precis, seulement avec un
-- autre creneau generique — cas marginal, pas couvert ici.
create or replace function trg_days_off_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_colleague text;
begin
  if is_agency_admin(chatter_agency_id(new.chatter_id)) then
    return new;
  end if;

  if new.day_off < v_today then
    raise exception 'Cannot request a day OFF in the past.';
  end if;

  select p.full_name into v_colleague
  from chatter_shift_assignments mine
  join chatter_shift_assignments other
    on other.shift_slot = mine.shift_slot
   and other.model_id is not distinct from mine.model_id
   and other.chatter_id <> mine.chatter_id
   and other.assigned_from <= new.day_off
   and (other.assigned_to is null or other.assigned_to >= new.day_off)
  join chatter_days_off d
    on d.chatter_id = other.chatter_id
   and d.day_off = new.day_off
  join profiles p on p.id = other.chatter_id
  where mine.chatter_id = new.chatter_id
    and mine.assigned_from <= new.day_off
    and (mine.assigned_to is null or mine.assigned_to >= new.day_off)
  limit 1;

  if v_colleague is not null then
    raise exception '% already requested this day off on the same slot/model — you can''t both be absent.', v_colleague;
  end if;

  return new;
end;
$$;
