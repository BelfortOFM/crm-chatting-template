-- Signaler les chatters sans taux de commission.
--
-- Quand aucune regle ne couvre la date d'un shift, fn_chatter_period_commission
-- retient un taux de 0 : le chatter est paye zero, sans erreur ni avertissement
-- nulle part. Sur un outil qui determine des remunerations, ce silence est le
-- probleme — le montant a zero est correct, c'est de ne pas le signaler qui ne
-- l'est pas.
--
-- Deux signaux distincts, parce qu'ils n'appellent pas la meme reaction :
--
--   uncovered_revenue_eur : du CA deja genere sur la periode qui ne rapporte
--     aucune commission. De l'argent en jeu maintenant, a corriger avant de
--     cloturer la paie. Couvre aussi le cas d'une regle qui ne commence qu'en
--     milieu de periode — les jours d'avant restent a 0.
--
--   has_rate : aucune regle en cours aujourd'hui. Rien a rattraper encore, mais
--     la prochaine declaration partira a zero. C'est le cas des comptes crees
--     sans qu'on pense a fixer leur taux.

drop function if exists fn_agency_payroll(uuid, date, date);

create function fn_agency_payroll(p_agency_id uuid, p_period_start date, p_period_end date)
returns table (
  chatter_id uuid,
  full_name text,
  active boolean,
  revenue_eur numeric,
  fee_eur numeric,
  net_revenue_eur numeric,
  commission_eur numeric,
  effective_rate numeric,
  bonus_eur numeric,
  sanction_eur numeric,
  net_eur numeric,
  hours numeric,
  eur_per_hour numeric,
  uncovered_revenue_eur numeric,
  has_rate boolean,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not is_agency_admin(p_agency_id) then
    raise exception 'not authorized for this agency';
  end if;

  return query
  with base as (
    select
      p.id,
      p.full_name,
      p.active,
      fn_chatter_period_revenue(p.id, p_period_start, p_period_end) as revenue,
      fn_chatter_period_net_revenue(p.id, p_period_start, p_period_end) as net_revenue,
      fn_chatter_period_commission(p.id, p_period_start, p_period_end) as commission,
      fn_chatter_period_hours(p.id, p_period_start, p_period_end) as hrs,
      coalesce((
        select sum(fn_shift_entry_net_eur(se.id))
        from shift_entries se
        where se.chatter_id = p.id
          and se.shift_date between p_period_start and p_period_end
          and not exists (
            select 1 from commission_rules cr
            where cr.chatter_id = se.chatter_id
              and cr.valid_from <= se.shift_date
              and (cr.valid_to is null or cr.valid_to >= se.shift_date)
          )
      ), 0) as uncovered,
      exists (
        select 1 from commission_rules cr
        where cr.chatter_id = p.id and cr.valid_to is null
      ) as rate_set,
      coalesce((
        select sum(b.amount_eur) from bonuses b
        where b.chatter_id = p.id
          and b.period_start = p_period_start and b.period_end = p_period_end
      ), 0) as bonus,
      coalesce((
        select sum(s.amount_eur) from sanctions s
        where s.chatter_id = p.id
          and s.period_start = p_period_start and s.period_end = p_period_end
      ), 0) as sanction,
      (
        select po.paid_at from payouts po
        where po.chatter_id = p.id
          and po.period_start = p_period_start and po.period_end = p_period_end
      ) as paid
    from profiles p
    where p.agency_id = p_agency_id
      and p.role = 'chatter'
  )
  select
    b.id,
    b.full_name,
    b.active,
    b.revenue,
    b.revenue - b.net_revenue,
    b.net_revenue,
    b.commission,
    -- Taux effectif rapporte au NET, la base sur laquelle la commission est
    -- calculee : le rapporter au brut afficherait 9,6 % pour un chatter a 12 %,
    -- et donnerait l'impression d'une erreur de taux.
    case when b.net_revenue > 0 then round(b.commission / b.net_revenue * 100, 2) else 0 end,
    b.bonus,
    b.sanction,
    b.commission + b.bonus - b.sanction,
    b.hrs,
    case when b.hrs > 0 then round(b.revenue / b.hrs, 2) else 0 end,
    b.uncovered,
    b.rate_set,
    b.paid
  from base b
  where b.active or b.revenue > 0 or b.bonus > 0 or b.sanction > 0 or b.paid is not null
  order by b.revenue desc, b.full_name;
end;
$$;

grant execute on function fn_agency_payroll(uuid, date, date) to authenticated, service_role;
