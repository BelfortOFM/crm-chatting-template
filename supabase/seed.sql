-- Local dev seed data: 1 agency, 1 admin, 3 chatters, 4 models, 4 chatting
-- types, assignments/commissions, and a couple of recent shifts so
-- dashboards/leaderboard/forecast have something to show. Ledger is USD
-- throughout (OnlyFans-only agency, no exchange rate).
--
-- Intended for `supabase db reset` (Supabase CLI local stack), which runs
-- this after the migrations against a Postgres instance that already has
-- the `auth` schema. All demo accounts use the password "password123".

-- Agency ---------------------------------------------------------------

insert into agencies (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'Agence Demo');

-- Auth users (admin + 3 chatters) ---------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'admin@agence.test',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'lea@agence.test',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'nina@agence.test',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'sam@agence.test',
   crypt('password123', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
  (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '{"sub":"10000000-0000-0000-0000-000000000001","email":"admin@agence.test"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '{"sub":"20000000-0000-0000-0000-000000000001","email":"lea@agence.test"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002',
   '{"sub":"20000000-0000-0000-0000-000000000002","email":"nina@agence.test"}', 'email', now(), now(), now()),
  (gen_random_uuid(), '20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003',
   '{"sub":"20000000-0000-0000-0000-000000000003","email":"sam@agence.test"}', 'email', now(), now(), now());

-- Profiles ---------------------------------------------------------------

insert into profiles (id, agency_id, role, full_name) values
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'agency_admin', 'Admin Agence'),
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'chatter', 'Léa'),
  ('20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'chatter', 'Nina'),
  ('20000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'chatter', 'Sam');

-- Chatting types -----------------------------------------------------------

insert into chatting_types (id, agency_id, name, active) values
  ('40000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'GFE', true),
  ('40000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Sexting', true),
  ('40000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'PPV', true),
  ('40000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Fidélisation', true);

-- Models ---------------------------------------------------------------

insert into models (id, agency_id, name, platform, active) values
  ('30000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Aria', 'onlyfans', true),
  ('30000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Luna', 'onlyfans', true),
  ('30000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Chloé', 'onlyfans', true),
  ('30000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Maya', 'onlyfans', true);

insert into model_chatting_types (model_id, chatting_type_id) values
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002'),
  ('30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004'),
  ('30000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001'),
  ('30000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000003'),
  ('30000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002');

-- Chatter <-> model assignments -------------------------------------------

insert into chatter_model_assignments (chatter_id, model_id, assigned_from) values
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '2026-01-01'),
  ('20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '2026-01-01'),
  ('20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '2026-01-01'),
  ('20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', '2026-01-01');

-- Commission rules -----------------------------------------------------

insert into commission_rules (chatter_id, rate_percent, valid_from) values
  ('20000000-0000-0000-0000-000000000001', 30.00, '2026-01-01'),
  ('20000000-0000-0000-0000-000000000002', 25.00, '2026-01-01'),
  ('20000000-0000-0000-0000-000000000003', 35.00, '2026-01-01');

-- Bonus / sanction examples, on the period containing today ----------------
-- Dates below are relative to current_date (not hardcoded) so this seed
-- keeps working whenever `supabase db reset` is actually run: shift_entries
-- are guarded by trg_shift_entries_guard, which rejects any non-admin insert
-- into a pay period that's already closed (more than LOCK_GRACE_DAYS past its
-- end) — a fixed historical date would eventually fall outside that window.

insert into bonuses (chatter_id, period_start, period_end, amount_usd, reason, created_by)
select '20000000-0000-0000-0000-000000000001',
  case
    when extract(day from current_date) <= 7 then date_trunc('month', current_date)::date
    when extract(day from current_date) <= 15 then (date_trunc('month', current_date) + interval '7 days')::date
    when extract(day from current_date) <= 22 then (date_trunc('month', current_date) + interval '15 days')::date
    else (date_trunc('month', current_date) + interval '22 days')::date
  end,
  fn_period_end_for_date(current_date),
  50.00, 'Objectif de la période dépassé', '10000000-0000-0000-0000-000000000001';

insert into sanctions (chatter_id, period_start, period_end, amount_usd, reason, created_by)
select '20000000-0000-0000-0000-000000000002',
  case
    when extract(day from current_date) <= 7 then date_trunc('month', current_date)::date
    when extract(day from current_date) <= 15 then (date_trunc('month', current_date) + interval '7 days')::date
    when extract(day from current_date) <= 22 then (date_trunc('month', current_date) + interval '15 days')::date
    else (date_trunc('month', current_date) + interval '22 days')::date
  end,
  fn_period_end_for_date(current_date),
  20.00, 'Retard de déclaration des shifts', '10000000-0000-0000-0000-000000000001';

-- Check-ins: required by trg_shift_entries_guard before a non-admin can
-- report a shift for a given date (cf. 20261007000042). One per shift below.
--
-- Only today and yesterday: any offset wider than that can cross into a
-- period that's already past its LOCK_GRACE_DAYS window depending on which
-- day `supabase db reset` actually runs on (period boundaries are every
-- 7-9 days) — this bit twice while this file still used current_date - 6.

-- checked_out_at left null throughout: closing one requires a checkout_note
-- of at least 80 characters (shift_check_ins_note_required), and all this
-- guard needs is a check-in row to exist for (chatter_id, shift_date).
insert into shift_check_ins (chatter_id, agency_id, shift_date, shift_slot, checked_in_at) values
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_date - 1, '09-15', current_date - 1 + time '10:00'),
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', current_date,     '21-03', current_date     + time '19:00'),
  ('20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_date - 1, '21-03', current_date - 1 + time '19:00'),
  ('20000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', current_date,     '15-21', current_date     + time '18:00');

-- Shifts: Léa, today and yesterday ------------------------------------------

insert into shift_entries (id, chatter_id, model_id, shift_date, start_time, end_time) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', current_date - 1, '10:00', '14:00'),
  ('50000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', current_date, '19:00', '22:00');

insert into sale_lines (shift_entry_id, amount) values
  ('50000000-0000-0000-0000-000000000001', 40.00),
  ('50000000-0000-0000-0000-000000000001', 30.00),
  ('50000000-0000-0000-0000-000000000001', 65.00),
  ('50000000-0000-0000-0000-000000000002', 90.00),
  ('50000000-0000-0000-0000-000000000002', 45.00);

-- Shifts: Nina, today and yesterday ------------------------------------------

insert into shift_entries (id, chatter_id, model_id, shift_date, start_time, end_time) values
  ('50000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', current_date - 1, '19:00', '23:00'),
  ('50000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', current_date, '18:00', '21:00');

insert into sale_lines (shift_entry_id, amount) values
  ('50000000-0000-0000-0000-000000000007', 55.00),
  ('50000000-0000-0000-0000-000000000007', 20.00),
  ('50000000-0000-0000-0000-00000000000b', 120.00);

-- Sam has an assignment and commission rule but no declared shifts yet,
-- to exercise empty-state UI.
