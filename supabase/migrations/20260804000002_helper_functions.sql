-- Helper functions used by RLS policies. SECURITY DEFINER + fixed search_path
-- so they can read `profiles`/`models` regardless of the caller's own RLS
-- visibility, without opening a recursion loop on profiles' own policies.

create or replace function current_profile_agency_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select agency_id from profiles where id = auth.uid();
$$;

create or replace function is_agency_admin(p_agency_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and agency_id = p_agency_id
      and role = 'agency_admin'
  );
$$;

create or replace function is_agency_member(p_agency_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_agency_id is not distinct from current_profile_agency_id();
$$;

create or replace function chatter_agency_id(p_chatter_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select agency_id from profiles where id = p_chatter_id;
$$;

create or replace function model_agency_id(p_model_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select agency_id from models where id = p_model_id;
$$;

create or replace function shift_entry_chatter_id(p_shift_entry_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select chatter_id from shift_entries where id = p_shift_entry_id;
$$;
