-- Reveal has no public API (unlike Mypuls) — everything used against it is
-- reverse-engineered from the dashboard's own network calls, session-token
-- authenticated, and used strictly on demand (see lib/reveal.ts). This just
-- maps our model row to Reveal's own model UUID; nullable, no automation
-- depends on it.

alter table models add column reveal_model_id text;

create unique index if not exists models_reveal_model_id_uniq
  on models(reveal_model_id)
  where reveal_model_id is not null;
