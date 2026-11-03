import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateString } from "@/lib/period";

export interface LedModel {
  id: string;
  name: string;
  platform: string;
}

/**
 * Modèles qu'un chatter mène actuellement comme Team Leader. Vide pour la
 * grande majorité des chatters — ce n'est pas un rôle exclusif.
 */
export async function getLedModels(supabase: SupabaseClient, chatterId: string): Promise<LedModel[]> {
  const today = toDateString(new Date());

  const { data } = await supabase
    .from("team_leader_assignments")
    .select("model:models(id, name, platform)")
    .eq("chatter_id", chatterId)
    .lte("assigned_from", today)
    .or(`assigned_to.is.null,assigned_to.gte.${today}`);

  // PostgREST type la jointure many-to-one comme un tableau.
  type Row = { model: LedModel | LedModel[] | null };
  return ((data ?? []) as Row[])
    .map((r) => (Array.isArray(r.model) ? (r.model[0] ?? null) : r.model))
    .filter((m): m is LedModel => m !== null);
}
