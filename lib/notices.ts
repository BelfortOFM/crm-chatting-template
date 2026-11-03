import type { SupabaseClient } from "@supabase/supabase-js";

/** Un avertissement ou une sanction pas encore vu par le chatter concerné. */
export interface PendingNotice {
  id: string;
  kind: "warning" | "sanction";
  reason: string;
  /** Seules les sanctions ont un montant. */
  amountUsd: number | null;
  createdAt: string;
}

export async function getPendingNotices(
  supabase: SupabaseClient,
  chatterId: string
): Promise<PendingNotice[]> {
  const [{ data: warnings }, { data: sanctions }] = await Promise.all([
    supabase
      .from("warnings")
      .select("id, reason, created_at")
      .eq("chatter_id", chatterId)
      .is("acknowledged_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("sanctions")
      .select("id, reason, amount_usd, created_at")
      .eq("chatter_id", chatterId)
      .is("acknowledged_at", null)
      .order("created_at", { ascending: true }),
  ]);

  const w = ((warnings ?? []) as { id: string; reason: string; created_at: string }[]).map((x) => ({
    id: x.id,
    kind: "warning" as const,
    reason: x.reason,
    amountUsd: null,
    createdAt: x.created_at,
  }));
  const s = (
    (sanctions ?? []) as { id: string; reason: string; amount_usd: number | string; created_at: string }[]
  ).map((x) => ({
    id: x.id,
    kind: "sanction" as const,
    reason: x.reason,
    amountUsd: Number(x.amount_usd),
    createdAt: x.created_at,
  }));

  // Ordre d'emission : le plus ancien d'abord, pour lire les choses dans
  // l'ordre ou elles sont arrivees plutot qu'a l'envers.
  return [...w, ...s].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
