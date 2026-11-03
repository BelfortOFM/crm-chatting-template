-- Presentation affichee une fois, a l'arrivee d'un chatter.
--
-- Une date plutot qu'un booleen : elle dit aussi QUAND la personne a vu la
-- presentation. Si le fonctionnement evolue, on saura qui a decouvert l'outil
-- avec l'ancienne version et pourra la revoir.

alter table profiles add column if not exists onboarding_seen_at timestamptz;

-- Les chatters deja en place connaissent l'outil : on ne leur impose pas
-- une presentation dont ils n'ont pas besoin. Seuls les nouveaux la verront.
update profiles
   set onboarding_seen_at = now()
 where role = 'chatter' and onboarding_seen_at is null;

-- Le titulaire peut marquer la presentation comme vue. Le trigger
-- profile_self_update_guard continue d'interdire tout le reste (role, agence,
-- nom, statut) : cette colonne n'y figure pas, elle lui est donc ouverte.
