-- Verification d'identite rendue optionnelle, au cas par cas.
--
-- Toutes les recrues ne relevent pas du meme niveau d'exigence : un profil
-- deja connu de l'agence, un essai de quelques jours ou quelqu'un dont les
-- papiers ont ete verifies hors de l'outil n'a pas a repasser par le depot.
-- L'admin decide a la creation du compte, et peut revenir sur ce choix.
--
-- Colonne separee du statut, volontairement : `required` dit si le controle
-- s'applique, `status` ou en est le dossier. Melanger les deux dans un statut
-- 'dispense' aurait rendu impossible de savoir ou en etait un dossier au
-- moment ou on leve l'exigence.

alter table identity_verifications
  add column if not exists required boolean not null default true;

-- Un chatter ne doit pas pouvoir se dispenser lui-meme du controle : la
-- colonne est reservee aux admins, comme les champs de revue.
create or replace function trg_identity_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();

  if is_agency_admin(new.agency_id) then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status
     and new.status not in ('pending', 'submitted') then
    raise exception 'Seul un administrateur peut valider ou refuser une vérification.';
  end if;

  if tg_op = 'INSERT' and new.status not in ('pending', 'submitted') then
    raise exception 'Statut initial invalide.';
  end if;

  if tg_op = 'UPDATE' and (
       new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.required is distinct from old.required
  ) then
    raise exception 'Champs réservés aux administrateurs.';
  end if;

  return new;
end;
$$;
