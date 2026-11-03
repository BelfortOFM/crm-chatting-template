import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Plusieurs tables (commission_rules, bonuses, sanctions, shift_entries,
 * model_goal_allocations...) n'ont pas de colonne agency_id propre : leur
 * appartenance passe par chatter_id -> profiles.agency_id. Utilise via
 * service role (RLS bypassee), donc le filtrage doit se faire ici, en
 * application, plutot que de compter sur la base.
 */
export async function agencyChatterIds(admin: SupabaseClient, agencyId: string): Promise<string[]> {
  const { data } = await admin.from("profiles").select("id").eq("agency_id", agencyId);
  return (data ?? []).map((r) => r.id as string);
}

/** Idem pour les tables qui ne portent que model_id (model_period_goals). */
export async function agencyModelIds(admin: SupabaseClient, agencyId: string): Promise<string[]> {
  const { data } = await admin.from("models").select("id").eq("agency_id", agencyId);
  return (data ?? []).map((r) => r.id as string);
}
