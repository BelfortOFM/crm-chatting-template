export type Role = "agency_admin" | "chatter";
/** "onlyfans", ou le code d'une plateforme personnalisee ajoutee par l'agence (voir lib/platforms.ts). */
export type Platform = string;
export type Currency = "USD" | "EUR";

export interface Agency {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  agency_id: string;
  role: Role;
  full_name: string;
  created_at: string;
}

export interface ChattingType {
  id: string;
  agency_id: string;
  name: string;
  active: boolean;
}

export interface Model {
  id: string;
  agency_id: string;
  name: string;
  platform: Platform;
  currency: Currency;
  active: boolean;
  created_at: string;
}

export interface ModelChattingType {
  model_id: string;
  chatting_type_id: string;
}

export interface ChatterModelAssignment {
  id: string;
  chatter_id: string;
  model_id: string;
  assigned_from: string;
  assigned_to: string | null;
}

export interface CommissionRule {
  id: string;
  chatter_id: string;
  rate_percent: number;
  valid_from: string;
  valid_to: string | null;
}

export interface Bonus {
  id: string;
  chatter_id: string;
  period_start: string;
  period_end: string;
  amount_usd: number;
  reason: string;
  created_by: string | null;
  created_at: string;
  /** Règle automatique à l'origine de la ligne, le cas échéant. */
  source_rule_id: string | null;
}

export interface Sanction {
  id: string;
  chatter_id: string;
  period_start: string;
  period_end: string;
  amount_usd: number;
  reason: string;
  created_by: string | null;
  created_at: string;
  /** Règle automatique à l'origine de la ligne, le cas échéant. */
  source_rule_id: string | null;
}

export interface ModelPayrollRule {
  id: string;
  model_id: string;
  kind: "bonus" | "sanction";
  amount_usd: number;
  reason: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ShiftEntry {
  id: string;
  chatter_id: string;
  model_id: string;
  shift_date: string;
  start_time: string;
  end_time: string;
  created_at: string;
}

export interface SaleLine {
  id: string;
  shift_entry_id: string;
  amount: number;
  created_at: string;
}

export interface LeaderboardRow {
  chatter_id: string;
  full_name: string;
  total_usd: number;
  rank: number;
}

export interface ChatterMonthlySummary {
  chatter_id: string;
  month: string;
  total_month_usd: number;
  period_1_usd: number;
  period_2_usd: number;
  period_3_usd: number;
  period_4_usd: number;
  forecast_usd: number;
  previous_month_usd: number;
}
