-- Le creneau horaire ne doit pas exiger un modele.
--
-- chatter_shift_assignments.model_id etait NOT NULL : assigner un horaire
-- imposait de designer un modele dans le meme geste. Or l'affectation aux
-- modeles vit deja dans chatter_model_assignments ; la dupliquer ici ouvrait
-- la porte a deux sources de verite contradictoires (un chatter assigne au
-- modele A dans une table et au modele B dans l'autre).
--
-- La colonne devient optionnelle : on peut poser un simple creneau ("ce
-- chatter travaille de 21h a 3h"), et la renseigner plus tard si l'agence
-- veut un planning par modele ("qui couvre ce modele cette nuit").

alter table chatter_shift_assignments alter column model_id drop not null;
