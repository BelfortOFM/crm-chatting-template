-- Planning par modele.
--
-- Un creneau peut desormais viser un modele precis (model_id renseigne) ou
-- valoir pour tous les modeles du chatter (model_id null, comportement
-- historique conserve). C'est l'usage prevu par la migration 0012, qui avait
-- rendu model_id optionnel en gardant la porte ouverte a "qui couvre
-- Lashwana1 cette nuit".
--
-- Deux index uniques s'y opposaient :
--
-- 1. chatter_shift_assignments_active_idx (chatter_id, model_id) — herite du
--    schema d'origine, jamais passe par une migration. Il interdit deux
--    creneaux actifs sur un meme modele, donc le double shift (9h-15h ET
--    15h-21h sur Lashwana1) que l'agence utilise deja. Il ne genait pas
--    jusqu'ici uniquement parce que model_id valait toujours null et que
--    Postgres traite les NULL comme distincts — le jour ou on renseigne la
--    colonne, il bloque.
--
-- 2. chatter_shift_assignments_active_uniq (chatter_id, shift_slot) — empeche
--    le meme creneau sur deux modeles differents, alors qu'un chatter couvre
--    couramment plusieurs comptes sur la meme plage horaire.
--
-- La contrainte porte donc sur le triplet. `nulls not distinct` est
-- indispensable : sans elle Postgres considererait deux creneaux generiques
-- identiques (chatter, 09-15, null) comme distincts et laisserait passer le
-- doublon que l'index est justement la pour interdire.

drop index if exists chatter_shift_assignments_active_idx;
drop index if exists chatter_shift_assignments_active_uniq;

create unique index chatter_shift_assignments_active_uniq
  on chatter_shift_assignments(chatter_id, shift_slot, model_id)
  nulls not distinct
  where assigned_to is null;

-- Index de lecture du planning d'un modele donne.
create index if not exists chatter_shift_assignments_model_active_idx
  on chatter_shift_assignments(model_id, shift_slot)
  where assigned_to is null;

-- Qui devrait etre en poste maintenant, et qui a effectivement pointe.
--
-- Reecrite en `exists` : la version en jointure renvoyait une ligne par
-- creneau: depuis le planning par modele, un chatter peut en avoir plusieurs
-- sur la meme plage (un par modele). Il aurait donc recu autant de rappels, et
-- l'alerte de retard l'aurait signale plusieurs fois, pour un seul et meme
-- shift.
create or replace function fn_expected_chatters(p_agency_id uuid, p_shift_date date, p_slot text)
returns table (
  chatter_id uuid,
  full_name text,
  checked_in boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.full_name,
    exists (
      select 1 from shift_check_ins c
      where c.chatter_id = p.id
        and c.shift_date = p_shift_date
        and c.shift_slot = p_slot
    ) as checked_in
  from profiles p
  where p.agency_id = p_agency_id
    and p.role = 'chatter'
    and p.active
    and exists (
      select 1 from chatter_shift_assignments a
      where a.chatter_id = p.id
        and a.shift_slot = p_slot
        and a.assigned_from <= p_shift_date
        and (a.assigned_to is null or a.assigned_to >= p_shift_date)
    )
    -- Un jour OFF pose annule l'attente : ni rappel, ni alerte de retard.
    and not exists (
      select 1 from chatter_days_off d
      where d.chatter_id = p.id and d.day_off = p_shift_date
    );
$$;

grant execute on function fn_expected_chatters(uuid, date, text) to authenticated, service_role;
