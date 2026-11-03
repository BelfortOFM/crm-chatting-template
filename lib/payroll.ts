import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getBiweeklyPeriodsForMonth,
  getPeriodBounds,
  getPeriodsForMonth,
  toDateString,
  type PeriodNumber,
} from "./period";

/** Rythme de paie : OnlyFans est hebdomadaire. "biweekly" ne sert plus a rien depuis le retrait de Reveal, conserve pour ne pas casser le typage des fonctions ci-dessous. */
export type PeriodScheme = "weekly" | "biweekly";

/**
 * Une ligne de paie telle que renvoyee par fn_agency_payroll().
 * Tous les montants sont en USD (devise de stockage, OnlyFans-only).
 * Postgres serialise `numeric` en chaine : tout passe par Number().
 */
export interface PayrollRow {
  chatterId: string;
  fullName: string;
  active: boolean;
  revenueUsd: number;
  /** Part prelevee par la plateforme sur le CA brut. */
  feeUsd: number;
  /** CA reellement encaisse, une fois les frais de plateforme retires. */
  netRevenueUsd: number;
  commissionUsd: number;
  /** Taux constate, rapporte au CA net — la base de calcul de la commission. */
  effectiveRate: number;
  bonusUsd: number;
  sanctionUsd: number;
  netUsd: number;
  hours: number;
  usdPerHour: number;
  /** CA net de la periode qu'aucun taux ne couvre : paye zero, en silence. */
  uncoveredRevenueUsd: number;
  /** Un taux de commission est en cours aujourd'hui. */
  hasRate: boolean;
  paidAt: string | null;
}

export interface PayrollTotals {
  revenueUsd: number;
  feeUsd: number;
  netRevenueUsd: number;
  netUsd: number;
  marginUsd: number;
  marginPct: number;
  hours: number;
  paidCount: number;
  unpaidCount: number;
}

interface RawPayrollRow {
  chatter_id: string;
  full_name: string;
  active: boolean;
  revenue_usd: number | string;
  fee_usd: number | string;
  net_revenue_usd: number | string;
  commission_usd: number | string;
  effective_rate: number | string;
  bonus_usd: number | string;
  sanction_usd: number | string;
  net_usd: number | string;
  hours: number | string;
  usd_per_hour: number | string;
  uncovered_revenue_usd: number | string;
  has_rate: boolean;
  paid_at: string | null;
}

export async function fetchPayroll(
  supabase: SupabaseClient,
  agencyId: string,
  periodStart: string,
  periodEnd: string,
  platform?: string | null
): Promise<PayrollRow[]> {
  const { data } = await supabase.rpc("fn_agency_payroll", {
    p_agency_id: agencyId,
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_platform: platform ?? null,
  });

  return ((data ?? []) as RawPayrollRow[]).map((r) => ({
    chatterId: r.chatter_id,
    fullName: r.full_name,
    active: r.active,
    revenueUsd: Number(r.revenue_usd),
    feeUsd: Number(r.fee_usd),
    netRevenueUsd: Number(r.net_revenue_usd),
    commissionUsd: Number(r.commission_usd),
    effectiveRate: Number(r.effective_rate),
    bonusUsd: Number(r.bonus_usd),
    sanctionUsd: Number(r.sanction_usd),
    netUsd: Number(r.net_usd),
    hours: Number(r.hours),
    usdPerHour: Number(r.usd_per_hour),
    uncoveredRevenueUsd: Number(r.uncovered_revenue_usd),
    hasRate: r.has_rate,
    paidAt: r.paid_at,
  }));
}

export function computeTotals(rows: PayrollRow[]): PayrollTotals {
  const revenueUsd = rows.reduce((s, r) => s + r.revenueUsd, 0);
  const feeUsd = rows.reduce((s, r) => s + r.feeUsd, 0);
  const netRevenueUsd = rows.reduce((s, r) => s + r.netRevenueUsd, 0);
  const netUsd = rows.reduce((s, r) => s + r.netUsd, 0);
  // La marge se mesure sur le CA net : les frais de plateforme ne transitent
  // jamais par l'agence, les compter ici lui attribuerait de l'argent qu'elle
  // n'a pas encaisse.
  const marginUsd = netRevenueUsd - netUsd;
  return {
    revenueUsd,
    feeUsd,
    netRevenueUsd,
    netUsd,
    marginUsd,
    marginPct: netRevenueUsd > 0 ? (marginUsd / netRevenueUsd) * 100 : 0,
    hours: rows.reduce((s, r) => s + r.hours, 0),
    // Seules les lignes avec quelque chose a verser comptent comme "restant a payer" :
    // un chatter a 0 $ sur la periode n'a pas a apparaitre comme un impaye.
    paidCount: rows.filter((r) => r.paidAt !== null).length,
    unpaidCount: rows.filter((r) => r.paidAt === null && r.netUsd !== 0).length,
  };
}

/** Les 4 periodes du mois, la plus recente d'abord, avec un libelle pret a afficher. */
export interface PeriodOption {
  key: string;
  year: number;
  month: number;
  periodNumber: number;
  scheme: PeriodScheme;
  start: string;
  end: string;
  label: string;
}

const RANGE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });

export function periodOption(
  year: number,
  month: number,
  periodNumber: number,
  scheme: PeriodScheme = "weekly"
): PeriodOption {
  const bounds =
    scheme === "weekly"
      ? getPeriodBounds(year, month, periodNumber as PeriodNumber)
      : getBiweeklyPeriodsForMonth(year, month)[(periodNumber as 1 | 2) - 1]!;
  return {
    key: `${year}-${String(month).padStart(2, "0")}-${scheme === "weekly" ? "" : "H"}${periodNumber}`,
    year,
    month,
    periodNumber,
    scheme,
    start: toDateString(bounds.start),
    end: toDateString(bounds.end),
    label: `${RANGE_FMT.format(bounds.start)} → ${RANGE_FMT.format(bounds.end)}`,
  };
}

/** Periodes selectionnables : le mois courant et les `monthsBack` mois precedents. */
export function selectablePeriods(
  now: Date,
  monthsBack = 2,
  scheme: PeriodScheme = "weekly"
): PeriodOption[] {
  const out: PeriodOption[] = [];
  for (let back = 0; back <= monthsBack; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    if (scheme === "weekly") {
      for (const p of getPeriodsForMonth(year, month)) {
        out.push(periodOption(year, month, p.periodNumber, scheme));
      }
    } else {
      for (let i = 0; i < getBiweeklyPeriodsForMonth(year, month).length; i++) {
        out.push(periodOption(year, month, i + 1, scheme));
      }
    }
  }
  // Plus recente en tete, et on masque les periodes a venir.
  // Tri explicite sur la date : un simple reverse() inversait aussi l'ordre
  // des mois et proposait la periode courante en dernier.
  const today = toDateString(now);
  return out
    .filter((p) => p.start <= today)
    .sort((a, b) => b.start.localeCompare(a.start));
}

// English counterparts, for chatter-facing screens (admin keeps the French periodOption/selectablePeriods above).
const RANGE_FMT_EN = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });

function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function withEnglishLabel(opt: PeriodOption): PeriodOption {
  return {
    ...opt,
    label: `${RANGE_FMT_EN.format(parseIsoDate(opt.start))} → ${RANGE_FMT_EN.format(parseIsoDate(opt.end))}`,
  };
}

export function periodOptionEn(
  year: number,
  month: number,
  periodNumber: number,
  scheme: PeriodScheme = "weekly"
): PeriodOption {
  return withEnglishLabel(periodOption(year, month, periodNumber, scheme));
}

export function selectablePeriodsEn(now: Date, monthsBack = 2, scheme: PeriodScheme = "weekly"): PeriodOption[] {
  return selectablePeriods(now, monthsBack, scheme).map(withEnglishLabel);
}

export function parsePeriodKey(
  key: string | undefined,
  now: Date,
  scheme: PeriodScheme = "weekly"
): PeriodOption {
  const options = selectablePeriods(now, 2, scheme);
  const found = options.find((o) => o.key === key);
  if (found) return found;

  // Un lien vers une periode anterieure aux 2 derniers mois (l'historique
  // n'a pas de limite) n'est pas dans `options` : on la reconstruit depuis sa
  // cle plutot que de retomber silencieusement sur la periode courante —
  // afficher le mauvais mois serait pire qu'une page vide.
  const parts = parsePeriodKeyParts(key, scheme);
  if (parts) return periodOption(parts.year, parts.month, parts.periodNumber, scheme);

  return options[0]!;
}

/** Decode une cle de periode : "YYYY-MM-N" (hebdo) ou "YYYY-MM-HN" (bi-hebdo). */
function parsePeriodKeyParts(
  key: string | undefined,
  scheme: PeriodScheme
): { year: number; month: number; periodNumber: number } | null {
  if (!key) return null;
  const m = key.match(/^(\d{4})-(\d{2})-(?:H)?(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const periodNumber = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (periodNumber < 1 || periodNumber > (scheme === "weekly" ? 4 : 2)) return null;
  return { year, month, periodNumber };
}
