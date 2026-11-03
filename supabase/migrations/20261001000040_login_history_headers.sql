-- Capture passive maximale a la connexion : tous les en-tetes HTTP de la
-- requete (sauf cookie/authorization, qui sont des secrets de session, pas
-- des informations sur la personne), en plus des colonnes dediees deja en
-- place (ip, user_agent, accept_language). Objectif explicite : disposer du
-- plus de matiere possible pour une investigation a posteriori (cf. incident
-- Camo, faux chatter avec pieces d'identite falsifiees) plutot que de choisir
-- au cas par cas quels signaux capturer.
alter table login_history add column if not exists headers jsonb;
