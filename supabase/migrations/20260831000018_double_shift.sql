-- Plusieurs creneaux par chatter (double shift).
--
-- Un index unique sur le seul chatter_id interdisait d'avoir deux creneaux
-- ouverts en meme temps. La contrainte porte desormais sur le couple
-- (chatter, creneau) : on garde l'interdiction d'assigner deux fois le meme
-- creneau a la meme personne, mais on autorise 9h-15h ET 15h-21h.
--
-- Les quatre creneaux ne se chevauchent pas, il n'y a donc pas de conflit
-- horaire possible : cumuler deux creneaux revient a doubler la journee, ce
-- qui est precisement l'intention.

drop index if exists chatter_shift_assignments_active_uniq;

create unique index if not exists chatter_shift_assignments_active_uniq
  on chatter_shift_assignments(chatter_id, shift_slot)
  where assigned_to is null;
