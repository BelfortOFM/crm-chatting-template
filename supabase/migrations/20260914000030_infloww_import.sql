-- Import des statistiques Infloww (OnlyFans) depuis l'export XLSX de l'agence.
--
-- Le compte Infloww de cette agence n'a pas droit a la cle API officielle : on
-- ne peut donc pas interroger l'API. En revanche l'app expose un export
-- "statistiques par employe" que l'admin genere par periode et recoit par
-- email. L'admin depose ce fichier dans le CRM ; on stocke ici le CA brut par
-- chatteur, pour le comparer au declare comme on le fait deja avec Reveal.
--
-- Contrairement a Reveal (un appel live rejoue a chaque affichage), Infloww est
-- un instantane fige : le fichier n'est depose qu'une fois par periode, il faut
-- donc le persister. Un nouvel import de la meme periode remplace les lignes.

create table if not exists infloww_period_stats (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  -- Bornes de la periode de paie (P1..P4), telles que calculees par lib/period.
  period_start date not null,
  period_end date not null,
  -- Identite Infloww de la ligne. L'email est la cle stable : les noms affiches
  -- sont sales et changeants (ex. "Prenom 15H-21H", "prenom-9h-15h"), le
  -- creneau y etant souvent colle au prenom. L'email, lui, ne bouge pas.
  infloww_email text,
  infloww_name text not null,
  -- Chatteur resolu au moment de l'import (par email puis par prenom normalise).
  -- Nullable : une ligne non rattachee reste visible pour que l'admin la relie.
  chatter_id uuid references profiles(id) on delete set null,
  -- CA brut de la periode, en dollars, avant frais de plateforme.
  sales_usd numeric(12, 2) not null default 0,
  ppv_usd numeric(12, 2) not null default 0,
  tips_usd numeric(12, 2) not null default 0,
  imported_at timestamptz not null default now(),
  imported_by uuid references profiles(id) on delete set null
);

-- Une seule ligne par (agence, periode, identite Infloww). Deux lignes du meme
-- export porteraient sinon deux fois le CA du chatteur. `coalesce` pour que les
-- rares lignes sans email restent uniques par nom.
create unique index if not exists infloww_period_stats_uniq
  on infloww_period_stats(agency_id, period_start, period_end, coalesce(lower(infloww_email), lower(infloww_name)));

create index if not exists infloww_period_stats_period_idx
  on infloww_period_stats(agency_id, period_start, period_end);

-- Mapping stable chatteur <-> email Infloww, rempli une fois puis reutilise :
-- un futur import retrouve le chatteur sans redemander a l'admin.
alter table profiles add column if not exists infloww_email text;

create unique index if not exists profiles_infloww_email_uniq
  on profiles(lower(infloww_email))
  where infloww_email is not null;

-- RLS : seul un admin de l'agence lit et ecrit ses stats importees.
alter table infloww_period_stats enable row level security;

drop policy if exists infloww_stats_admin_all on infloww_period_stats;
create policy infloww_stats_admin_all on infloww_period_stats
  for all
  using (is_agency_admin(agency_id))
  with check (is_agency_admin(agency_id));

-- Le garde de profil doit interdire a un chatteur de se rattacher lui-meme a un
-- email Infloww : sinon il pourrait s'attribuer le CA trace d'un autre. Corps
-- identique a la migration 28, avec infloww_email ajoute a la liste protegee.
create or replace function trg_profile_self_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_agency_admin(new.agency_id) then
    return new;
  end if;

  if new.id = auth.uid() and (
       new.role is distinct from old.role
    or new.agency_id is distinct from old.agency_id
    or new.full_name is distinct from old.full_name
    or new.active is distinct from old.active
    or new.left_on is distinct from old.left_on
    or new.reveal_member_id is distinct from old.reveal_member_id
    or new.infloww_email is distinct from old.infloww_email
    or new.compta_onlyfans_employee_id is distinct from old.compta_onlyfans_employee_id
    or new.compta_mym_employee_id is distinct from old.compta_mym_employee_id
    or new.compta_reveal_employee_id is distinct from old.compta_reveal_employee_id
  ) then
    raise exception 'Seul un administrateur peut modifier ces champs.';
  end if;

  return new;
end;
$$;
