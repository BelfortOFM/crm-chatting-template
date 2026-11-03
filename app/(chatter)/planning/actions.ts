"use server";

import { revalidatePath } from "next/cache";
import { requireChatter } from "@/lib/require-role";

export interface DayOffState {
  error?: string;
}

/**
 * Pose ou retire un jour OFF. La regle (rien dans le passe) est appliquee par
 * les triggers en base : les policies laissent le chatter ecrire ses propres
 * lignes, donc une regle qui ne vivrait qu'ici serait contournable en appelant
 * l'API directement.
 */
export async function toggleDayOff(day: string): Promise<DayOffState> {
  const { supabase, user } = await requireChatter();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Invalid date." };

  const { data: existing } = await supabase
    .from("chatter_days_off")
    .select("id")
    .eq("chatter_id", user.id)
    .eq("day_off", day)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("chatter_days_off").delete().eq("id", existing.id)
    : await supabase.from("chatter_days_off").insert({ chatter_id: user.id, day_off: day });

  if (error) {
    // Les messages des triggers sont deja redigés pour l'utilisateur.
    return { error: error.message };
  }

  revalidatePath("/planning");
  return {};
}
