-- Nouveau creneau "Depannage" : un chatter disponible pour couvrir un shift
-- au besoin, plutot qu'un horaire fixe. Se comporte comme les quatre
-- creneaux existants (assignation recurrente, pointage obligatoire, rappels
-- automatiques, comptage de couverture) -- seule la plage change, sur 24h
-- (00h00-23h59, cf. SLOT_INFO cote app dans lib/shifts.ts).
--
-- Les contraintes CHECK sur shift_slot sont retrouvees par leur definition
-- plutot que par un nom suppose : celle de chatter_shift_assignments a ete
-- posee hors migration (cf. commentaire de 20260831000011), son nom reel
-- n'est donc pas connu ici.

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'chatter_shift_assignments'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%shift_slot%';

  if v_conname is not null then
    execute format('alter table chatter_shift_assignments drop constraint %I', v_conname);
  end if;

  alter table chatter_shift_assignments
    add constraint chatter_shift_assignments_shift_slot_check
    check (shift_slot in ('03-09', '09-15', '15-21', '21-03', 'depannage'));
end $$;

do $$
declare
  v_conname text;
begin
  select conname into v_conname
  from pg_constraint
  where conrelid = 'shift_check_ins'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%shift_slot%';

  if v_conname is not null then
    execute format('alter table shift_check_ins drop constraint %I', v_conname);
  end if;

  alter table shift_check_ins
    add constraint shift_check_ins_shift_slot_check
    check (shift_slot in ('03-09', '09-15', '15-21', '21-03', 'depannage'));
end $$;
