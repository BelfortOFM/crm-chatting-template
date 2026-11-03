-- Abonnements aux notifications push.
--
-- Une ligne par appareil, pas par personne : quelqu'un peut installer l'app
-- sur son telephone et sa tablette, et doit etre notifie sur les deux.
-- `endpoint` est l'adresse fournie par le service de push du navigateur
-- (Apple, Google...) ; elle identifie l'appareil et sert de cle.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,
  endpoint text not null unique,
  -- Cles de chiffrement du navigateur : le contenu de la notification est
  -- chiffre pour l'appareil, meme le service de push ne peut pas le lire.
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  -- Un endpoint expire ou revoque (app desinstallee) : on le desactive au
  -- lieu de le supprimer, pour distinguer "jamais abonne" de "ne repond plus".
  failed_at timestamptz
);

create index if not exists push_subscriptions_user_idx on push_subscriptions(user_id) where failed_at is null;
create index if not exists push_subscriptions_agency_idx on push_subscriptions(agency_id) where failed_at is null;

alter table push_subscriptions enable row level security;

-- Chacun gere ses propres appareils.
drop policy if exists push_own_all on push_subscriptions;
create policy push_own_all on push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Un admin voit qui est joignable, pour comprendre pourquoi un rappel n'est
-- pas arrive. Il ne peut pas s'abonner a la place de quelqu'un.
drop policy if exists push_admin_select on push_subscriptions;
create policy push_admin_select on push_subscriptions
  for select
  using (is_agency_admin(agency_id));

drop policy if exists push_admin_delete on push_subscriptions;
create policy push_admin_delete on push_subscriptions
  for delete
  using (is_agency_admin(agency_id));
