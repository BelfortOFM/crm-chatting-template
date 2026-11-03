-- Historique des connexions : IP, user-agent et langue du navigateur a
-- chaque login, en complement de ip_watch (migration 20261001000036).
-- Capture passive uniquement (en-tetes HTTP deja presents dans la requete),
-- pas de fingerprinting actif cote navigateur.
create table login_history (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  ip text,
  user_agent text,
  accept_language text,
  created_at timestamptz not null default now()
);

create index login_history_user_created_idx on login_history(user_id, created_at desc);
create index login_history_agency_created_idx on login_history(agency_id, created_at desc);

alter table login_history enable row level security;

-- Pas de policy insert : l'ecriture passe par le client service role
-- (lib/login-history.ts), meme pattern que notification_log.
create policy login_history_admin_select on login_history
  for select
  using (is_agency_admin(agency_id));
