-- Ressenti de fin de shift.
--
-- Le depointage ne demandait rien. Or la fin de poste est le seul moment ou le
-- chatter a encore son shift en tete : c'est la, et pas au detour d'un message
-- plus tard, qu'un probleme de modele, de fan ou d'outil se raconte.
--
-- La note vit sur le pointage plutot que dans une table dediee : il y a
-- exactement un ressenti par fin de poste, et le rattacher ailleurs obligerait
-- a rejouer la jointure a chaque lecture pour reconstituer date, creneau et
-- duree, qui sont deja ici.

alter table shift_check_ins add column if not exists checkout_note text;

-- Longueur minimale : deux lignes de texte utile. Un seuil est le seul garde-fou
-- possible cote base — "2 ou 3 lignes" ne se verifie pas, les retours a la ligne
-- etant optionnels quand on ecrit au telephone. 80 caracteres ecartent le "ok"
-- ou le "rien a signaler" sans exiger une redaction.
--
-- NOT VALID : la contrainte s'applique aux ecritures a venir sans invalider les
-- pointages deja fermes, qui n'ont evidemment aucune note. Les valider de force
-- ferait echouer la migration sur des donnees qu'on ne peut plus completer.
alter table shift_check_ins
  drop constraint if exists shift_check_ins_note_required;

alter table shift_check_ins
  add constraint shift_check_ins_note_required
  check (
    checked_out_at is null
    or (checkout_note is not null and char_length(btrim(checkout_note)) >= 80)
  )
  not valid;

-- Lecture cote agence : les derniers ressentis, du plus recent au plus ancien.
create index if not exists shift_check_ins_notes_idx
  on shift_check_ins(agency_id, checked_out_at desc)
  where checkout_note is not null;
