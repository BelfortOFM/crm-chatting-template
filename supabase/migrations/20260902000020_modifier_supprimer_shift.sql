-- Correction d'une declaration de shift par le chatter.
--
-- Jusqu'ici une declaration etait definitive cote interface. Devant une erreur
-- de saisie, la seule issue etait de redeclarer le shift : le chiffre
-- d'affaires se retrouvait compte deux fois, et personne ne pouvait retirer le
-- doublon. D'ou cette fonction, et l'ouverture des boutons modifier/supprimer.
--
-- La suppression, elle, n'a pas besoin de fonction : la policy RLS
-- shift_entries_chatter_all autorise deja le chatter sur ses propres lignes, et
-- sale_lines part en cascade (ON DELETE CASCADE) — aucune vente orpheline ne
-- survit a la suppression du shift.
--
-- SECURITY INVOKER (le defaut, comme fn_create_shift) : les ecritures passent
-- sous la RLS de l'appelant et par les triggers de garde de la migration 0005,
-- qui refusent une date future, une periode cloturee, et rendent chatter_id,
-- model_id et exchange_rate_used immuables. Une exception annule l'ensemble du
-- bloc : jamais de shift laisse sans ses ventes.
create or replace function fn_update_shift(
  p_shift_id uuid,
  p_shift_date date,
  p_start_time time,
  p_end_time time,
  p_amounts numeric[]
)
returns void
language plpgsql
as $$
declare
  v_amount numeric;
  v_exists boolean;
begin
  if p_amounts is null or array_length(p_amounts, 1) is null then
    raise exception 'Add at least one sale.';
  end if;

  -- La RLS masque les shifts des autres : invisible ici = pas le sien.
  select true into v_exists from shift_entries where id = p_shift_id;
  if not found then
    raise exception 'Shift not found.';
  end if;

  update shift_entries
     set shift_date = p_shift_date,
         start_time = p_start_time,
         end_time   = p_end_time
   where id = p_shift_id;

  -- Les ventes sont remplacees en bloc. Suivre ligne a ligne ce que le chatter
  -- a ajoute, modifie ou retire dans le formulaire compliquerait le code sans
  -- rien apporter : le shift est reecrit d'un seul tenant, et le total est
  -- toujours la somme des lignes presentes a la fin.
  delete from sale_lines where shift_entry_id = p_shift_id;

  foreach v_amount in array p_amounts loop
    if v_amount is null or v_amount <= 0 then
      raise exception 'Each sale must be a positive amount.';
    end if;
    insert into sale_lines (shift_entry_id, amount) values (p_shift_id, v_amount);
  end loop;
end;
$$;

grant execute on function fn_update_shift(uuid, date, time, time, numeric[]) to authenticated;
