-- Le Team Leader voit aussi, pour son equipe : qui a pointe en retard, et les
-- ressentis de fin de shift (checkout_note vit deja sur shift_check_ins,
-- cf. 20260910000026_ressenti_de_shift.sql). Lecture seule, comme le reste
-- de ce qu'un TL peut voir -- il ne pointe jamais a la place d'un autre.

create policy shift_check_ins_team_leader_select on shift_check_ins
  for select
  using (is_team_leader_for_chatter(chatter_id));
