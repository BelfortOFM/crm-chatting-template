"use server";

import { revalidatePath } from "next/cache";
import { requireChatter } from "@/lib/require-role";
import { toDateString } from "@/lib/period";
import { SLOT_INFO, isShiftSlot, SHIFT_NOTE_MIN_CHARS, SHIFT_NOTE_MAX_CHARS, parisNow } from "@/lib/shifts";

export interface CheckInState {
  error?: string;
  message?: string;
}

/**
 * Le pointage porte sur le shift EN COURS, pas sur une date choisie : c'est
 * une prise de poste, elle se constate a l'instant ou elle a lieu.
 *
 * Un creneau qui traverse minuit (21h-3h) appartient au jour ou il a commence :
 * pointer a 1h du matin rattache la ligne a la veille, sinon un meme shift
 * compterait pour deux jours.
 */
function currentShiftDate(slot: string, now: Date): string {
  const info = SLOT_INFO[slot as keyof typeof SLOT_INFO];
  const hour = now.getHours();
  const startHour = Number(info.start.slice(0, 2));
  const endHour = Number(info.end.slice(0, 2));
  // Un creneau qui traverse minuit (21h-3h) appartient au jour ou il a
  // commence : pointer apres minuit mais avant la fin du creneau (avant 3h)
  // rattache la ligne a la veille. Avant ce correctif, `hour < startHour`
  // rattachait a la veille TOUTE heure precedant 21h — un pointage a 20h32
  // pour un shift de 21h partait sur la veille et laissait un shift ouvert
  // fantome qui bloquait le pointage des jours suivants.
  const crossesMidnight = startHour > endHour;
  if (crossesMidnight && hour < endHour) {
    return toDateString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  }
  return toDateString(now);
}

export async function checkIn(slot: string): Promise<CheckInState> {
  const { supabase, user, profile } = await requireChatter();

  if (!isShiftSlot(slot)) return { error: "Invalid slot." };

  // Le creneau vient du chatter (il peut en avoir plusieurs), mais on verifie
  // qu'il lui est bien assigne : sans ce controle, n'importe quel creneau
  // pourrait etre pointe en appelant l'action directement.
  // `limit(1)` et non `maybeSingle()` seul : le meme creneau peut exister en
  // plusieurs lignes (une par modele). maybeSingle echouerait sur le pluriel et
  // renverrait "ce creneau ne t'est pas assigne" a quelqu'un qui l'a bien.
  const { data: assignment } = await supabase
    .from("chatter_shift_assignments")
    .select("id")
    .eq("chatter_id", user.id)
    .eq("shift_slot", slot)
    .is("assigned_to", null)
    .limit(1)
    .maybeSingle();

  if (!assignment) {
    return { error: "This slot isn't assigned to you." };
  }

  const now = parisNow();
  const shiftDate = currentShiftDate(slot, now);

  const { data: dayOff } = await supabase
    .from("chatter_days_off")
    .select("id")
    .eq("chatter_id", user.id)
    .eq("day_off", shiftDate)
    .maybeSingle();

  if (dayOff) return { error: "It's your day OFF today." };

  const { error } = await supabase.from("shift_check_ins").insert({
    chatter_id: user.id,
    agency_id: profile.agency_id,
    shift_date: shiftDate,
    shift_slot: slot,
  });

  if (error) {
    if (error.code === "23505") return { error: "You've already checked in for this shift." };
    return { error: error.message };
  }

  // Le bloc de pointage ne vit que dans l'onglet Declarer.
  revalidatePath("/report");
  return { message: "Check-in recorded." };
}

/**
 * Fin de poste, avec le ressenti du shift.
 *
 * La note est obligatoire : la fin de poste est le seul moment ou le chatter a
 * encore son shift en tete. La base porte la meme regle (contrainte
 * shift_check_ins_note_required), donc un appel direct a l'API ne contourne
 * rien — mais on valide ici pour rendre un message lisible plutot qu'une erreur
 * Postgres brute.
 */
export async function checkOut(note: string): Promise<CheckInState> {
  const { supabase, user } = await requireChatter();

  const trimmed = note.trim();
  if (trimmed.length < SHIFT_NOTE_MIN_CHARS) {
    return {
      error: `Tell us about your shift in a few lines — ${SHIFT_NOTE_MIN_CHARS - trimmed.length} more characters needed.`,
    };
  }
  if (trimmed.length > SHIFT_NOTE_MAX_CHARS) {
    return { error: "That's too long, sum it up in a few lines." };
  }

  const { data: open } = await supabase
    .from("shift_check_ins")
    .select("id")
    .eq("chatter_id", user.id)
    .is("checked_out_at", null)
    .order("checked_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!open) return { error: "No shift in progress." };

  const { error } = await supabase
    .from("shift_check_ins")
    .update({ checked_out_at: new Date().toISOString(), checkout_note: trimmed })
    .eq("id", open.id);

  if (error) return { error: error.message };

  revalidatePath("/report");
  revalidatePath("/admin/ressentis");
  return { message: "Check-out recorded, thanks for the feedback." };
}
