"use server";

import { revalidatePath } from "next/cache";
import { requireChatter } from "@/lib/require-role";

export interface ActionState {
  error?: string;
  /**
   * Horodatage du dernier enregistrement reussi. Le formulaire s'en sert pour
   * se vider : sans ca les montants saisis restaient a l'ecran apres l'envoi,
   * et un second appui sur "Enregistrer" creait un shift identique — le
   * doublon que personne ne pouvait ensuite retirer.
   */
  ok?: number;
}

export async function createShift(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireChatter();

  const modelId = String(formData.get("model_id") ?? "");
  const shiftDate = String(formData.get("shift_date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  // Le chatter saisit directement dans la devise reelle du modele (affichee
  // par le formulaire) : aucune conversion a faire, sale_lines.amount est deja
  // "dans la devise d'origine du modele".
  const amounts = formData
    .getAll("amounts")
    .map((v) => parseFloat(String(v)))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!modelId || !shiftDate || !startTime || !endTime) {
    return { error: "All fields are required." };
  }
  // Un shift sans vente est valide : un chatter qui travaille sans rien
  // vendre doit pouvoir le declarer, pour que ses heures restent visibles
  // au lieu de disparaitre faute de montant a saisir.

  // Single transactional RPC: shift + sale lines all-or-nothing. Assignment
  // coverage, period locking, future-date rejection and the frozen exchange
  // rate are all enforced by the DB guard triggers (see migration 0005) —
  // their raised messages are user-facing French, surfaced as-is.
  const { error } = await supabase.rpc("fn_create_shift", {
    p_model_id: modelId,
    p_shift_date: shiftDate,
    p_start_time: startTime,
    p_end_time: endTime,
    p_amounts: amounts,
  });

  if (error) return { error: error.message };

  revalidateAfterShiftChange();
  return { ok: Date.now() };
}

/**
 * Toutes les pages ou un shift pese : sans ca, une declaration corrigee ou
 * supprimee resterait lisible ailleurs, et le chatter croirait a un doublon.
 */
function revalidateAfterShiftChange() {
  revalidatePath("/report");
  revalidatePath("/dashboard");
  revalidatePath("/suivi", "layout");
  revalidatePath("/profile");
  revalidatePath("/leaderboard");
  revalidatePath("/paiements");
}

/**
 * Corrige une declaration : date, horaires et montants des ventes.
 *
 * Le modele n'est pas modifiable — la base le refuse (trigger de garde), parce
 * qu'en changer changerait la devise sans que le taux fige, lui, puisse
 * suivre. Une erreur de modele se corrige en supprimant puis redeclarant.
 */
export async function updateShift(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireChatter();

  const shiftId = String(formData.get("shift_id") ?? "");
  const shiftDate = String(formData.get("shift_date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  // Meme devise que la saisie initiale (le modele, donc sa devise, est figé) :
  // aucune conversion a faire ici non plus.
  const amounts = formData
    .getAll("amounts")
    .map((v) => parseFloat(String(v)))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (!shiftId || !shiftDate || !startTime || !endTime) {
    return { error: "All fields are required." };
  }

  // La RLS ne laisse voir que ses propres shifts : absent ici = pas le sien.
  // Juste un controle d'existence/appartenance — plus besoin de la devise ni
  // du taux fige, aucune conversion n'a lieu ici.
  const { data: shift } = await supabase.from("shift_entries").select("id").eq("id", shiftId).maybeSingle();

  if (!shift) return { error: "Shift not found." };

  const { error } = await supabase.rpc("fn_update_shift", {
    p_shift_id: shiftId,
    p_shift_date: shiftDate,
    p_start_time: startTime,
    p_end_time: endTime,
    p_amounts: amounts,
  });

  if (error) return { error: error.message };

  revalidateAfterShiftChange();
  return {};
}

/**
 * Supprime une declaration et ses ventes (cascade cote base).
 *
 * `.select()` apres le delete pour savoir ce qui a reellement disparu : sous
 * RLS, supprimer une ligne qu'on n'a pas le droit de voir n'est pas une erreur,
 * ca ne supprime rien. Sans ce controle l'interface annoncerait une suppression
 * qui n'a pas eu lieu.
 */
export async function deleteShift(shiftId: string): Promise<ActionState> {
  const { supabase } = await requireChatter();

  if (!shiftId) return { error: "Shift not found." };

  const { data, error } = await supabase
    .from("shift_entries")
    .delete()
    .eq("id", shiftId)
    .select("id");

  if (error) return { error: error.message };
  if (!data || data.length === 0) return { error: "Shift not found." };

  revalidateAfterShiftChange();
  return {};
}
