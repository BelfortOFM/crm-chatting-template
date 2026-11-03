-- Variante de fn_create_shift() (migration 20260804000005) utilisable par
-- l'API externe (service role, app/api/v1/shifts). L'originale insere avec
-- chatter_id = auth.uid() : sous service role, auth.uid() est null, l'insert
-- echouerait sur la contrainte not null. Celle-ci prend p_chatter_id en
-- parametre explicite ; tout le reste (validation, verrou de periode, taux
-- fige) reste porte par le trigger trg_shift_entries_guard, inchange.

create or replace function fn_create_shift_for_chatter(
  p_chatter_id uuid,
  p_model_id uuid,
  p_shift_date date,
  p_start_time time,
  p_end_time time,
  p_amounts numeric[]
)
returns uuid
language plpgsql
as $$
declare
  v_shift_id uuid;
  v_amount numeric;
begin
  if p_amounts is null or array_length(p_amounts, 1) is null then
    raise exception 'Add at least one sale.';
  end if;

  insert into shift_entries (chatter_id, model_id, shift_date, start_time, end_time, exchange_rate_used)
  values (p_chatter_id, p_model_id, p_shift_date, p_start_time, p_end_time, 1)
  returning id into v_shift_id;

  foreach v_amount in array p_amounts loop
    if v_amount is null or v_amount <= 0 then
      raise exception 'Each sale must be a positive amount.';
    end if;
    insert into sale_lines (shift_entry_id, amount) values (v_shift_id, v_amount);
  end loop;

  return v_shift_id;
end;
$$;

grant execute on function fn_create_shift_for_chatter(uuid, uuid, date, time, time, numeric[]) to service_role;
