"use server";

import { requireChatter } from "@/lib/require-role";

/**
 * Marque un avertissement ou une sanction comme vu. La fonction base
 * (fn_acknowledge_warning/sanction) verifie elle-meme que la ligne appartient
 * bien a l'appelant — ce garde-fou ici n'est qu'une premiere ligne de
 * defense, cf. lib/require-role.ts.
 */
export async function acknowledgeNotice(kind: "warning" | "sanction", id: string) {
  const { supabase } = await requireChatter();
  await supabase.rpc(kind === "warning" ? "fn_acknowledge_warning" : "fn_acknowledge_sanction", { p_id: id });
}
