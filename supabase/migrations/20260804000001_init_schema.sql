-- Core schema for the agency/chatter CRM.
-- Pay periods are never stored: they are always computed dynamically
-- (see lib/period.ts client-side and fn_period_bounds() server-side).

create extension if not exists pgcrypto;

-- Agencies
create table agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Profiles (linked to auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,
  role text not null check (role in ('agency_admin', 'chatter')),
  full_name text not null,
  created_at timestamptz not null default now()
);

create index profiles_agency_id_idx on profiles(agency_id);

-- Exchange rates, historized. Never recalculated retroactively: each sale
-- freezes the rate in effect at declaration time (see shift_entries.exchange_rate_used).
create table exchange_rates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  rate_usd_to_eur numeric(10, 6) not null check (rate_usd_to_eur > 0),
  valid_from timestamptz not null default now(),
  created_by uuid references profiles(id)
);

create index exchange_rates_agency_valid_from_idx on exchange_rates(agency_id, valid_from desc);

-- Chatting types (tags), freely managed by each agency — never hardcoded.
create table chatting_types (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  name text not null,
  active boolean not null default true
);

create index chatting_types_agency_id_idx on chatting_types(agency_id);

-- Models
create table models (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  name text not null,
  platform text not null check (platform in ('onlyfans', 'fansly', 'mym', 'reveal')),
  currency text generated always as (
    case when platform in ('onlyfans', 'fansly') then 'USD' else 'EUR' end
  ) stored,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index models_agency_id_idx on models(agency_id);

-- Model <-> chatting type join (many-to-many)
create table model_chatting_types (
  model_id uuid not null references models(id) on delete cascade,
  chatting_type_id uuid not null references chatting_types(id) on delete cascade,
  primary key (model_id, chatting_type_id)
);

-- Chatter <-> model assignment, historized (never a plain boolean flag).
create table chatter_model_assignments (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references profiles(id) on delete cascade,
  model_id uuid not null references models(id) on delete cascade,
  assigned_from date not null default current_date,
  assigned_to date, -- null = still active
  check (assigned_to is null or assigned_to >= assigned_from)
);

create index chatter_model_assignments_chatter_idx on chatter_model_assignments(chatter_id);
create index chatter_model_assignments_model_idx on chatter_model_assignments(model_id);

-- Commission rate, historized. Stable within a month in practice, but
-- modeled as a validity range for flexibility.
create table commission_rules (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references profiles(id) on delete cascade,
  rate_percent numeric(5, 2) not null check (rate_percent >= 0 and rate_percent <= 100),
  valid_from date not null default current_date,
  valid_to date, -- null = still active
  check (valid_to is null or valid_to >= valid_from)
);

create index commission_rules_chatter_idx on commission_rules(chatter_id, valid_from desc);

-- Monthly goals
create table monthly_goals (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references profiles(id) on delete cascade,
  month date not null check (extract(day from month) = 1), -- always the 1st of the month
  target_amount_eur numeric(10, 2) not null check (target_amount_eur >= 0),
  unique (chatter_id, month)
);

-- Bonuses
create table bonuses (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount_eur numeric(10, 2) not null check (amount_eur > 0),
  reason text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index bonuses_chatter_period_idx on bonuses(chatter_id, period_start, period_end);

-- Sanctions
create table sanctions (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  amount_eur numeric(10, 2) not null check (amount_eur > 0),
  reason text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  check (period_end >= period_start)
);

create index sanctions_chatter_period_idx on sanctions(chatter_id, period_start, period_end);

-- Shifts declared by the chatter
create table shift_entries (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references profiles(id) on delete cascade,
  model_id uuid not null references models(id),
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  exchange_rate_used numeric(10, 6) not null check (exchange_rate_used > 0), -- frozen at entry time
  created_at timestamptz not null default now()
);

create index shift_entries_chatter_date_idx on shift_entries(chatter_id, shift_date);
create index shift_entries_model_idx on shift_entries(model_id);

-- Individual sale amounts within a shift
create table sale_lines (
  id uuid primary key default gen_random_uuid(),
  shift_entry_id uuid not null references shift_entries(id) on delete cascade,
  amount numeric(10, 2) not null check (amount > 0), -- in the model's original currency
  created_at timestamptz not null default now()
);

create index sale_lines_shift_entry_idx on sale_lines(shift_entry_id);
