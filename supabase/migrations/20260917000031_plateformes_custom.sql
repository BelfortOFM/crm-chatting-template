-- Plateformes personnalisees : l'agence peut ajouter d'autres plateformes que
-- les quatre integrees (OnlyFans, Fansly, MYM, Reveal).
--
-- Les quatre integrees restent particulieres : elles ont un suivi (Infloww pour
-- OnlyFans, l'API Reveal) et une destination comptable. Une plateforme ajoutee
-- ici n'a ni suivi ni compta — son CA declare sort simplement en "non
-- verifiable" dans le recap, ce que l'ecran dit deja. Ce qu'elle apporte : un
-- modele peut y etre cree, declare, paye, avec la bonne devise.

create table if not exists custom_platforms (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  -- Slug stocke dans models.platform (ex: "fanvue"). Minuscules, sans espace.
  code text not null check (code ~ '^[a-z][a-z0-9_]{1,30}$'),
  -- Nom affiche (ex: "Fanvue").
  label text not null check (char_length(trim(label)) > 0),
  currency text not null check (currency in ('USD', 'EUR')),
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  unique (agency_id, code)
);

-- Un code ne peut pas ecraser une plateforme integree : sinon "onlyfans"
-- custom masquerait le vrai suivi OnlyFans.
alter table custom_platforms
  add constraint custom_platforms_not_builtin
  check (code not in ('onlyfans', 'fansly', 'mym', 'reveal'));

alter table custom_platforms enable row level security;

drop policy if exists custom_platforms_admin_all on custom_platforms;
create policy custom_platforms_admin_all on custom_platforms
  for all
  using (is_agency_admin(agency_id))
  with check (is_agency_admin(agency_id));

-- Les chatters lisent la liste (le formulaire de declaration lit deja les
-- modeles, mais l'ecran d'agence en a besoin cote lecture aussi).
drop policy if exists custom_platforms_read on custom_platforms;
create policy custom_platforms_read on custom_platforms
  for select
  using (agency_id = (select agency_id from profiles where id = auth.uid()));

-- --- Devise du modele : de "generee" a "derivee par trigger" ---------------
--
-- La devise etait une colonne GENERATED figee sur les 4 plateformes. Pour
-- accepter une plateforme custom avec sa propre devise, on la rend normale et
-- un trigger la remplit a l'insertion : integree -> regle en dur, custom ->
-- devise declaree dans custom_platforms. Les valeurs existantes sont
-- recopiees a l'identique, rien ne bouge pour les modeles deja crees.

create or replace function fn_model_currency()
returns trigger
language plpgsql
as $$
begin
  if new.currency is null then
    new.currency := case
      when new.platform in ('onlyfans', 'fansly') then 'USD'
      when new.platform in ('mym', 'reveal') then 'EUR'
      else (
        select cp.currency from custom_platforms cp
        where cp.agency_id = new.agency_id and cp.code = new.platform
      )
    end;
  end if;
  if new.currency is null then
    raise exception 'Plateforme inconnue pour ce modèle : %', new.platform;
  end if;
  return new;
end;
$$;

alter table models drop column if exists currency;
alter table models add column currency text;

update models
set currency = case when platform in ('onlyfans', 'fansly') then 'USD' else 'EUR' end
where currency is null;

alter table models alter column currency set not null;

drop trigger if exists trg_model_currency on models;
create trigger trg_model_currency
  before insert or update of platform, currency on models
  for each row execute function fn_model_currency();

-- La contrainte figeait platform sur les 4 integrees : on l'ouvre aux codes
-- custom. La validite (integree OU custom de l'agence) est verifiee par le
-- trigger de devise, qui echoue si le code n'existe pas.
alter table models drop constraint if exists models_platform_check;
