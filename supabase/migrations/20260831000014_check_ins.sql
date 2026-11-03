-- Pointage des shifts + trace des notifications envoyees.
--
-- Le CRM ne savait pas si un chatter avait commence son service : les shifts
-- se declarent apres coup, avec les ventes. Impossible, donc, de dire "il
-- aurait du etre en poste depuis 15 minutes". Cette table repond a cette
-- question et rien d'autre : elle enregistre un debut et une fin, sans
-- montants — la declaration de CA reste separee.

create table if not exists shift_check_ins (
  id uuid primary key default gen_random_uuid(),
  chatter_id uuid not null references profiles(id) on delete cascade,
  agency_id uuid not null references agencies(id) on delete cascade,
  -- Jour du shift ET creneau : un chatter peut changer de creneau en cours de
  -- semaine, on veut savoir lequel il a effectivement couvert.
  shift_date date not null,
  shift_slot text not null check (shift_slot in ('03-09', '09-15', '15-21', '21-03')),
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  unique (chatter_id, shift_date, shift_slot)
);

create index if not exists shift_check_ins_agency_date_idx on shift_check_ins(agency_id, shift_date desc);
create index if not exists shift_check_ins_open_idx on shift_check_ins(chatter_id) where checked_out_at is null;

alter table shift_check_ins enable row level security;

drop policy if exists check_ins_own_all on shift_check_ins;
create policy check_ins_own_all on shift_check_ins
  for all
  using (chatter_id = auth.uid())
  with check (chatter_id = auth.uid());

drop policy if exists check_ins_admin_all on shift_check_ins;
create policy check_ins_admin_all on shift_check_ins
  for all
  using (is_agency_admin(agency_id))
  with check (is_agency_admin(agency_id));

-- Journal des notifications deja parties.
--
-- Le declencheur tourne toutes les cinq minutes : sans trace, un rappel
-- "20 minutes avant" repartirait a chaque passage tant que la fenetre reste
-- ouverte. La cle porte le destinataire, le type et le jour concerne.
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  kind text not null,
  dedupe_key text not null unique,
  sent_at timestamptz not null default now()
);

create index if not exists notification_log_agency_sent_idx on notification_log(agency_id, sent_at desc);

alter table notification_log enable row level security;

drop policy if exists notification_log_admin_select on notification_log;
create policy notification_log_admin_select on notification_log
  for select using (is_agency_admin(agency_id));

-- Qui devrait etre en poste maintenant, et qui a effectivement pointe.
--
-- Renvoie une ligne par chatter attendu sur le creneau demande, avec l'heure
-- de debut prevue et son pointage eventuel. Sert a la fois aux rappels avant
-- shift et aux relances apres.
--
-- `p_slot_start` est l'heure de debut du creneau vise, en heure de Paris.
create or replace function fn_expected_chatters(p_agency_id uuid, p_shift_date date, p_slot text)
returns table (
  chatter_id uuid,
  full_name text,
  checked_in boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.id,
    p.full_name,
    exists (
      select 1 from shift_check_ins c
      where c.chatter_id = p.id
        and c.shift_date = p_shift_date
        and c.shift_slot = p_slot
    ) as checked_in
  from profiles p
  join chatter_shift_assignments a
    on a.chatter_id = p.id
   and a.shift_slot = p_slot
   and a.assigned_from <= p_shift_date
   and (a.assigned_to is null or a.assigned_to >= p_shift_date)
  where p.agency_id = p_agency_id
    and p.role = 'chatter'
    and p.active
    -- Un jour OFF pose annule l'attente : ni rappel, ni alerte de retard.
    and not exists (
      select 1 from chatter_days_off d
      where d.chatter_id = p.id and d.day_off = p_shift_date
    );
$$;

grant execute on function fn_expected_chatters(uuid, date, text) to authenticated, service_role;
