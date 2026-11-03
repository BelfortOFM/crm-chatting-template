-- Le chatter doit voir un avertissement ou une sanction a sa prochaine
-- connexion, pas seulement le decouvrir en consultant /paiements de son
-- propre chef -- d'ou une popup au prochain chargement de l'espace chatter,
-- qu'il acquitte en la fermant. acknowledged_at distingue "pas encore vu"
-- (null) de "vu" : sans cette colonne, la popup reapparaitrait a chaque
-- connexion pour toujours.

alter table warnings add column if not exists acknowledged_at timestamptz;
alter table sanctions add column if not exists acknowledged_at timestamptz;

-- Acquittement : le chatter peut marquer comme vu, et seulement ca -- jamais
-- modifier le motif ou le montant. Une fonction dediee plutot qu'une policy
-- UPDATE classique : une policy RLS restreint QUELLES LIGNES sont
-- modifiables, pas QUELLES COLONNES -- un chatter pourrait sinon passer par
-- l'API pour changer le motif ou le montant de sa propre sanction.
create or replace function fn_acknowledge_warning(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update warnings set acknowledged_at = now()
  where id = p_id and chatter_id = auth.uid() and acknowledged_at is null;
end;
$$;

create or replace function fn_acknowledge_sanction(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update sanctions set acknowledged_at = now()
  where id = p_id and chatter_id = auth.uid() and acknowledged_at is null;
end;
$$;

grant execute on function fn_acknowledge_warning(uuid) to authenticated;
grant execute on function fn_acknowledge_sanction(uuid) to authenticated;
