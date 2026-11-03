-- Regles metier du planning.
--
-- Les tables chatter_shift_assignments et chatter_days_off existaient deja
-- (creees hors migration), avec leurs contraintes et leurs policies. Il leur
-- manquait les garde-fous : la policy autorise un chatter a ecrire ses propres
-- jours OFF, donc sans regle en base il pouvait en poser sept dans la semaine
-- en tapant directement l'API.

-- Un seul creneau actif a la fois par chatter : deux creneaux ouverts en
-- meme temps rendraient le planning ambigu (quel horaire afficher ?).
create unique index if not exists chatter_shift_assignments_active_uniq
  on chatter_shift_assignments(chatter_id)
  where assigned_to is null;

create index if not exists chatter_days_off_chatter_day_idx
  on chatter_days_off(chatter_id, day_off);

-- Nombre de jours OFF qu'un chatter peut poser lui-meme par semaine.
-- Un admin n'est pas soumis a cette limite : il doit pouvoir accorder une
-- absence exceptionnelle sans etre bloque par l'outil.
create or replace function trg_days_off_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_week_start date;
  v_count int;
begin
  if is_agency_admin(chatter_agency_id(new.chatter_id)) then
    return new;
  end if;

  -- Poser ou retirer un jour passe reviendrait a reecrire l'historique.
  if new.day_off < v_today then
    raise exception 'Cannot request a day OFF in the past.';
  end if;

  -- Semaine ISO (lundi -> dimanche), celle du jour demande.
  v_week_start := new.day_off - ((extract(isodow from new.day_off)::int - 1) || ' days')::interval;

  select count(*) into v_count
  from chatter_days_off d
  where d.chatter_id = new.chatter_id
    and d.day_off >= v_week_start
    and d.day_off < v_week_start + interval '7 days'
    and d.id is distinct from new.id;

  if v_count >= 1 then
    raise exception 'Only one day OFF per week.';
  end if;

  return new;
end;
$$;

drop trigger if exists days_off_guard on chatter_days_off;
create trigger days_off_guard
  before insert or update on chatter_days_off
  for each row execute function trg_days_off_guard();

-- Meme logique a la suppression : un chatter ne reprend pas un jour deja passe.
create or replace function trg_days_off_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_agency_admin(chatter_agency_id(old.chatter_id)) then
    return old;
  end if;
  if old.day_off < (now() at time zone 'Europe/Paris')::date then
    raise exception 'This day has already passed, it can no longer be changed.';
  end if;
  return old;
end;
$$;

drop trigger if exists days_off_delete_guard on chatter_days_off;
create trigger days_off_delete_guard
  before delete on chatter_days_off
  for each row execute function trg_days_off_delete_guard();
