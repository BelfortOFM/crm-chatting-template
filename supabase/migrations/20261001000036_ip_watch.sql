-- Surveillance d'IP anti-fraude : alerte l'agence si un chatter se connecte
-- depuis un reseau deja signale (ex: meme IP qu'un dossier KYC suspect).
--
-- Toute la logique de comparaison reste ici, en PL/pgSQL, via le type natif
-- Postgres inet/cidr — pas de parsing d'IPv6 maison cote app. IPv6 : prefixe
-- /64 (le FAI/mobile change souvent l'IP exacte au sein du meme reseau).
-- IPv4 : /32 exact uniquement, un /24 passerait par le NAT d'un operateur
-- mobile et produirait trop de faux positifs entre chatters sans rapport.

create table ip_watch (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  cidr cidr not null,
  reason text not null,
  source_chatter_id uuid references profiles(id) on delete set null,
  created_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  active boolean not null default true
);

create index ip_watch_agency_active_idx on ip_watch(agency_id) where active;

alter table ip_watch enable row level security;

create policy ip_watch_admin_all on ip_watch
  for all
  using (is_agency_admin(agency_id))
  with check (is_agency_admin(agency_id));

-- Cree une entree de surveillance a partir d'une IP brute (texte), en
-- calculant le prefixe reseau approprie selon la famille d'adresse.
create or replace function fn_create_ip_watch(
  p_agency_id uuid,
  p_ip text,
  p_reason text,
  p_source_chatter_id uuid,
  p_created_by uuid
)
returns ip_watch
language plpgsql
as $$
declare
  v_addr inet := p_ip::inet;
  v_cidr cidr;
  v_row ip_watch;
begin
  v_cidr := network(set_masklen(v_addr, case when family(v_addr) = 6 then 64 else 32 end));

  insert into ip_watch (agency_id, cidr, reason, source_chatter_id, created_by)
  values (p_agency_id, v_cidr, p_reason, p_source_chatter_id, p_created_by)
  returning * into v_row;

  return v_row;
end;
$$;

-- Entrees actives de la watchlist de l'agence qui contiennent cette IP.
create or replace function fn_ip_watch_hits(p_agency_id uuid, p_ip text)
returns setof ip_watch
language sql
stable
as $$
  select * from ip_watch
  where agency_id = p_agency_id
    and active
    and p_ip is not null
    and p_ip::inet <<= cidr;
$$;

-- Seed : l'IP deja identifiee sur le dossier KYC de Camo, signalee le
-- 2026-10-01. created_by resolu sur un admin actif de l'agence (pas
-- d'utilisateur "systeme" dans ce schema).
do $$
declare
  v_agency_id uuid;
  v_chatter_id uuid;
  v_admin_id uuid;
  v_ip text;
begin
  select id into v_chatter_id from profiles where full_name = 'Camo' and role = 'chatter' limit 1;
  if v_chatter_id is null then
    return;
  end if;

  select agency_id into v_agency_id from profiles where id = v_chatter_id;

  select location_ip into v_ip
  from identity_verifications
  where chatter_id = v_chatter_id and location_ip is not null
  limit 1;
  if v_ip is null then
    return;
  end if;

  select id into v_admin_id from profiles where agency_id = v_agency_id and role = 'agency_admin' and active limit 1;
  if v_admin_id is null then
    return;
  end if;

  perform fn_create_ip_watch(v_agency_id, v_ip, 'Dossier KYC de Camo', v_chatter_id, v_admin_id);
end;
$$;
