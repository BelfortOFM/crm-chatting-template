-- Localisation du chatter au moment de la verification d'identite.
--
-- Objectif : renforcer le controle anti-fraude (KYC) en sachant d'ou le
-- dossier a ete envoye, en complement des pieces deja demandees.
--
-- Capturee UNE SEULE FOIS, au depot du dossier (cf. submitVerification) —
-- pas de suivi en continu des connexions, ce serait un chantier different et
-- plus lourd cote vie privee. GPS prioritaire (precis, avec le consentement
-- explicite du navigateur) ; a defaut, estimation approximative via l'IP de
-- la requete (ville/pays, via lookupIpLocation dans lib/geolocation.ts).
alter table identity_verifications
  add column if not exists location_source text check (location_source in ('gps', 'ip')),
  add column if not exists location_lat double precision,
  add column if not exists location_lon double precision,
  -- Rayon d'incertitude du GPS, en metres. Null pour une localisation IP :
  -- l'imprecision y est de l'ordre de la ville, pas un rayon mesurable.
  add column if not exists location_accuracy_m double precision,
  add column if not exists location_city text,
  add column if not exists location_country text,
  add column if not exists location_ip text,
  add column if not exists location_captured_at timestamptz;
