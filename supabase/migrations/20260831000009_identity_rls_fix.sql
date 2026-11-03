-- Correctif RLS : un chatter ne pouvait pas envoyer son dossier.
--
-- La policy UPDATE ne declarait qu'une clause USING. En l'absence de
-- WITH CHECK, PostgreSQL reutilise USING pour valider la ligne APRES
-- modification : le chatter avait donc le droit de partir d'un statut
-- 'pending', mais la ligne resultante en 'submitted' etait refusee.
-- Erreur remontee : "new row violates row-level security policy".
--
-- Les deux clauses expriment des choses differentes et doivent etre
-- distinctes :
--   USING      -> depuis quels statuts le chatter peut modifier sa ligne
--   WITH CHECK -> vers quels statuts il a le droit de l'amener
-- 'approved' et 'rejected' restent hors de sa portee : seul un admin les pose
-- (double garde avec le trigger identity_guard).

drop policy if exists identity_own_update on identity_verifications;
create policy identity_own_update on identity_verifications
  for update
  using (chatter_id = auth.uid() and status in ('pending', 'rejected'))
  with check (chatter_id = auth.uid() and status in ('pending', 'submitted'));
