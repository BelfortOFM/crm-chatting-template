import type { SupabaseClient } from "@supabase/supabase-js";
import { getPeriodForDate, toDateString } from "./period";

export interface LeaderboardRow {
  chatter_id: string;
  full_name: string;
  total_usd: number | string;
  rank: number | string;
}

export type LeaderboardView = "period" | "month";

/** Shared by the chatter and admin leaderboard pages (period vs. cumulative month, both USD-sorted). */
export async function fetchAgencyLeaderboard(
  supabase: SupabaseClient,
  agencyId: string,
  view: LeaderboardView
): Promise<{ rows: LeaderboardRow[]; periodNumber: number }> {
  const now = new Date();
  const period = getPeriodForDate(now);

  if (view === "month") {
    const monthStart = toDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    const { data } = await supabase.rpc("fn_agency_leaderboard_month", {
      p_agency_id: agencyId,
      p_month: monthStart,
    });
    return { rows: (data ?? []) as LeaderboardRow[], periodNumber: period.periodNumber };
  }

  const { data } = await supabase.rpc("fn_agency_leaderboard", {
    p_agency_id: agencyId,
    p_period_start: toDateString(period.start),
    p_period_end: toDateString(period.end),
  });
  return { rows: (data ?? []) as LeaderboardRow[], periodNumber: period.periodNumber };
}
