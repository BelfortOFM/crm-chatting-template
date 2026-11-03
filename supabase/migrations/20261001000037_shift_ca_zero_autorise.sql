-- Autorise la declaration d'un shift sans aucune vente (CA = 0).
--
-- Jusqu'ici les trois fonctions de creation/correction de shift refusaient un
-- tableau de montants vide ("Ajoute au moins une vente.") : un chatter qui
-- travaillait sans rien vendre n'avait aucun moyen de le declarer autrement
-- qu'en inventant un montant ou en ne declarant rien du tout — invisible dans
-- ses heures et son suivi, alors que fn_shift_entry_total() gere deja ce cas
-- (coalesce(sum(amount), 0)) et que les ecrans (lib/suivi.ts, etc.) utilisent
-- deja une jointure qui tolere zero ligne de vente. Seule la validation a
-- l'insertion bloquait.
--
-- Chaque montant FOURNI doit toujours etre strictement positif (sale_lines
-- garde son check amount > 0) : seul le cas "zero vente du tout" change.

create or replace function fn_create_shift(
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
  insert into shift_entries (chatter_id, model_id, shift_date, start_time, end_time, exchange_rate_used)
  values (auth.uid(), p_model_id, p_shift_date, p_start_time, p_end_time, 1)
  returning id into v_shift_id;

  if p_amounts is not null then
    foreach v_amount in array p_amounts loop
      if v_amount is null or v_amount <= 0 then
        raise exception 'Each sale must be a positive amount.';
      end if;
      insert into sale_lines (shift_entry_id, amount) values (v_shift_id, v_amount);
    end loop;
  end if;

  return v_shift_id;
end;
$$;

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

  delete from sale_lines where shift_entry_id = p_shift_id;

  if p_amounts is not null then
    foreach v_amount in array p_amounts loop
      if v_amount is null or v_amount <= 0 then
        raise exception 'Each sale must be a positive amount.';
      end if;
      insert into sale_lines (shift_entry_id, amount) values (p_shift_id, v_amount);
    end loop;
  end if;
end;
$$;

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
  insert into shift_entries (chatter_id, model_id, shift_date, start_time, end_time, exchange_rate_used)
  values (p_chatter_id, p_model_id, p_shift_date, p_start_time, p_end_time, 1)
  returning id into v_shift_id;

  if p_amounts is not null then
    foreach v_amount in array p_amounts loop
      if v_amount is null or v_amount <= 0 then
        raise exception 'Each sale must be a positive amount.';
      end if;
      insert into sale_lines (shift_entry_id, amount) values (v_shift_id, v_amount);
    end loop;
  end if;

  return v_shift_id;
end;
$$;
