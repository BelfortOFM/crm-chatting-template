-- Plusieurs modeles d'ici peuvent viser la meme fiche comptable.
--
-- La migration precedente affirmait ce principe en commentaire tout en creant
-- un index UNIQUE sur models.compta_model_id, qui l'interdit. Or c'est le cas
-- reel : plusieurs variantes d'un meme modele (ex. deux comptes + une
-- variante REVEAL) correspondent toutes a un seul modele cote comptabilite,
-- qui n'en connait qu'un. L'envoi additionne leurs CA avant d'ecrire, c'est
-- prevu pour.
--
-- Cote profiles la contrainte reste : deux chatters partageant la meme fiche de
-- paie comptable ecraseraient leurs montants respectifs, ce qui n'a aucun sens.

drop index if exists models_compta_model_id_uniq;

create index if not exists models_compta_model_idx
  on models(compta_model_id)
  where compta_model_id is not null;
