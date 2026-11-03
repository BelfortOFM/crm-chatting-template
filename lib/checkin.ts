import type { SupabaseClient } from "@supabase/supabase-js";
import { toDateString } from "./period";
import { addDays, parisNow, sortSlots, type ShiftSlot } from "./shifts";

/**
 * Etat de pointage d'un chatter : de quoi afficher le bloc de pointage au pied
 * de l'onglet Declarer.
 */
export interface CheckInState {
  /** Creneaux assignes, dedupliques : plusieurs lignes peuvent viser le meme. */
  slots: ShiftSlot[];
  /** Pointage en cours, s'il y en a un. */
  openSince: string | null;
  /** Un shift a deja ete ouvert ET ferme aujourd'hui. */
  doneToday: boolean;
}

export async function fetchCheckInState(
  supabase: SupabaseClient,
  chatterId: string
): Promise<CheckInState> {
  const today = parisNow();

  const [{ data: assignment }, { data: checkIns }] = await Promise.all([
    supabase
      .from("chatter_shift_assignments")
      .select("shift_slot")
      .eq("chatter_id", chatterId)
      .is("assigned_to", null),
    // Hier inclus : un shift de nuit commence la veille est encore en cours.
    supabase
      .from("shift_check_ins")
      .select("checked_in_at, checked_out_at, shift_date")
      .eq("chatter_id", chatterId)
      .gte("shift_date", toDateString(addDays(today, -1)))
      .order("checked_in_at", { ascending: false }),
  ]);

  // Le meme creneau peut exister en plusieurs lignes (une par modele) : le
  // chatter ne travaille qu'une fois sur la plage.
  const slots = sortSlots([
    ...new Set(((assignment ?? []) as { shift_slot: ShiftSlot }[]).map((a) => a.shift_slot)),
  ]);

  const rows = (checkIns ?? []) as {
    checked_in_at: string;
    checked_out_at: string | null;
    shift_date: string;
  }[];

  return {
    slots,
    openSince: rows.find((r) => r.checked_out_at === null)?.checked_in_at ?? null,
    doneToday: rows.some((r) => r.shift_date === toDateString(today) && r.checked_out_at !== null),
  };
}
