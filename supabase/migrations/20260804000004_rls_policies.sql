-- Row Level Security, enabled on every table from the first migration.
--
-- General shape:
-- - agency_admin: full read/write, scoped strictly to their own agency_id.
-- - chatter: full read/write on their own rows only, plus read-only access
--   to shared reference data (models, chatting types, exchange rate) and to
--   aggregated leaderboard totals (via the SECURITY DEFINER fn_agency_leaderboard*
--   functions) — never direct row access to other chatters' shifts, sales,
--   bonuses, sanctions or commission rules.

alter table agencies enable row level security;
alter table profiles enable row level security;
alter table exchange_rates enable row level security;
alter table chatting_types enable row level security;
alter table models enable row level security;
alter table model_chatting_types enable row level security;
alter table chatter_model_assignments enable row level security;
alter table commission_rules enable row level security;
alter table monthly_goals enable row level security;
alter table bonuses enable row level security;
alter table sanctions enable row level security;
alter table shift_entries enable row level security;
alter table sale_lines enable row level security;

-- agencies -------------------------------------------------------------

create policy agencies_member_select on agencies
  for select
  using (is_agency_member(id));

create policy agencies_admin_update on agencies
  for update
  using (is_agency_admin(id))
  with check (is_agency_admin(id));

-- profiles ---------------------------------------------------------------
-- Names/roles within one's own agency are visible to everyone in it (needed
-- for the leaderboard and assignment UIs); only admins can write.

create policy profiles_member_select on profiles
  for select
  using (is_agency_member(agency_id));

create policy profiles_admin_insert on profiles
  for insert
  with check (is_agency_admin(agency_id));

create policy profiles_admin_update on profiles
  for update
  using (is_agency_admin(agency_id))
  with check (is_agency_admin(agency_id));

create policy profiles_admin_delete on profiles
  for delete
  using (is_agency_admin(agency_id));

-- exchange_rates -----------------------------------------------------------

create policy exchange_rates_member_select on exchange_rates
  for select
  using (is_agency_member(agency_id));

create policy exchange_rates_admin_write on exchange_rates
  for all
  using (is_agency_admin(agency_id))
  with check (is_agency_admin(agency_id));

-- chatting_types -----------------------------------------------------------

create policy chatting_types_member_select on chatting_types
  for select
  using (is_agency_member(agency_id));

create policy chatting_types_admin_write on chatting_types
  for all
  using (is_agency_admin(agency_id))
  with check (is_agency_admin(agency_id));

-- models ---------------------------------------------------------------

create policy models_member_select on models
  for select
  using (is_agency_member(agency_id));

create policy models_admin_write on models
  for all
  using (is_agency_admin(agency_id))
  with check (is_agency_admin(agency_id));

-- model_chatting_types -------------------------------------------------

create policy model_chatting_types_member_select on model_chatting_types
  for select
  using (is_agency_member(model_agency_id(model_id)));

create policy model_chatting_types_admin_write on model_chatting_types
  for all
  using (is_agency_admin(model_agency_id(model_id)))
  with check (is_agency_admin(model_agency_id(model_id)));

-- chatter_model_assignments ---------------------------------------------

create policy chatter_model_assignments_chatter_select on chatter_model_assignments
  for select
  using (chatter_id = auth.uid());

create policy chatter_model_assignments_admin_write on chatter_model_assignments
  for all
  using (is_agency_admin(chatter_agency_id(chatter_id)))
  with check (is_agency_admin(chatter_agency_id(chatter_id)));

-- commission_rules -------------------------------------------------------

create policy commission_rules_chatter_select on commission_rules
  for select
  using (chatter_id = auth.uid());

create policy commission_rules_admin_write on commission_rules
  for all
  using (is_agency_admin(chatter_agency_id(chatter_id)))
  with check (is_agency_admin(chatter_agency_id(chatter_id)));

-- monthly_goals ----------------------------------------------------------

create policy monthly_goals_chatter_select on monthly_goals
  for select
  using (chatter_id = auth.uid());

create policy monthly_goals_admin_write on monthly_goals
  for all
  using (is_agency_admin(chatter_agency_id(chatter_id)))
  with check (is_agency_admin(chatter_agency_id(chatter_id)));

-- bonuses ------------------------------------------------------------------

create policy bonuses_chatter_select on bonuses
  for select
  using (chatter_id = auth.uid());

create policy bonuses_admin_write on bonuses
  for all
  using (is_agency_admin(chatter_agency_id(chatter_id)))
  with check (is_agency_admin(chatter_agency_id(chatter_id)));

-- sanctions ------------------------------------------------------------

create policy sanctions_chatter_select on sanctions
  for select
  using (chatter_id = auth.uid());

create policy sanctions_admin_write on sanctions
  for all
  using (is_agency_admin(chatter_agency_id(chatter_id)))
  with check (is_agency_admin(chatter_agency_id(chatter_id)));

-- shift_entries ------------------------------------------------------------
-- Chatters manage their own shifts end to end; admins have full oversight.

create policy shift_entries_chatter_all on shift_entries
  for all
  using (chatter_id = auth.uid())
  with check (chatter_id = auth.uid());

create policy shift_entries_admin_write on shift_entries
  for all
  using (is_agency_admin(chatter_agency_id(chatter_id)))
  with check (is_agency_admin(chatter_agency_id(chatter_id)));

-- sale_lines -----------------------------------------------------------

create policy sale_lines_chatter_all on sale_lines
  for all
  using (shift_entry_chatter_id(shift_entry_id) = auth.uid())
  with check (shift_entry_chatter_id(shift_entry_id) = auth.uid());

create policy sale_lines_admin_write on sale_lines
  for all
  using (is_agency_admin(chatter_agency_id(shift_entry_chatter_id(shift_entry_id))))
  with check (is_agency_admin(chatter_agency_id(shift_entry_chatter_id(shift_entry_id))));
