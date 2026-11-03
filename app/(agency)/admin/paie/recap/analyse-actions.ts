"use server";

import { requireAgencyAdmin } from "@/lib/require-role";
import { analysePaiePeriod, type PaieAnalysisResult } from "@/lib/paie-analyse";

export type { PaieAnalysisResult, PaieVerdictStatus } from "@/lib/paie-analyse";

/**
 * Lance l'analyse IA d'une periode : rapproche declare / tracke / taux et rend
 * un verdict « je peux verser ou non ». Purement consultatif, ne cloture rien.
 */
export async function runPaieAnalysis(
  periodRange: string,
  periodLabel: string,
  platform?: string | null
): Promise<PaieAnalysisResult> {
  const { supabase, profile } = await requireAgencyAdmin();

  const [periodStart, periodEnd] = periodRange.split("|");
  if (!periodStart || !periodEnd) return { error: "Période invalide." };

  return analysePaiePeriod(supabase, profile.agency_id, periodStart, periodEnd, periodLabel, platform);
}
