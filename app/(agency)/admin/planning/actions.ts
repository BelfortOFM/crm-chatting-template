"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyAdmin } from "@/lib/require-role";
import { logAction } from "@/lib/audit";
import { toDateString } from "@/lib/period";
import { isShiftSlot, SLOT_INFO } from "@/lib/shifts";

export interface SlotState {
  error?: string;
}

async function chatterName(
  supabase: Awaited<ReturnType<typeof requireAgencyAdmin>>["supabase"],
  chatterId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, role, agency_id")
    .eq("id", chatterId)
    .maybeSingle();
  return data && data.role === "chatter" ? data.full_name : null;
}

/**
 * Ajoute ou retire un creneau, dans la portee affichee.
 *
 * `model_id` vide = creneau generique : le chatter tient cette plage pour tous
 * les modeles qui lui sont affectes. Renseigne, le creneau ne vaut que pour ce
 * modele. Les deux coexistent, et un clic ne touche jamais que la portee
 * courante : on ne peut donc pas effacer par megarde un creneau generique en
 * travaillant dans la vue d'un modele.
 *
 * Un chatter peut cumuler plusieurs creneaux (double shift) : on ne ferme pas
 * les autres. Retirer ferme l'affectation a la veille plutot que de la
 * supprimer, ce qui garde la trace de qui travaillait quand — sauf si elle a
 * ete posee le jour meme, auquel cas c'est une correction de saisie.
 */
export async function assignShiftSlot(chatterId: string, formData: FormData): Promise<SlotState> {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const slot = String(formData.get("shift_slot") ?? "");
  if (!isShiftSlot(slot)) return { error: "Créneau invalide." };

  const raw = String(formData.get("model_id") ?? "");
  const modelId = raw === "" ? null : raw;

  const name = await chatterName(supabase, chatterId);
  if (!name) return { error: "Chatter introuvable." };

  // Le modele doit exister et appartenir a l'agence. Sans ce controle, un
  // identifiant arbitraire irait jusqu'a la cle etrangere, qui renverrait une
  // erreur Postgres brute a l'ecran.
  let modelLabel = "tous modèles";
  if (modelId) {
    const { data: model } = await supabase
      .from("models")
      .select("name")
      .eq("id", modelId)
      .eq("agency_id", profile.agency_id)
      .maybeSingle();
    if (!model) return { error: "Modèle introuvable." };
    modelLabel = model.name;
  }

  const today = toDateString(new Date());

  // Ce creneau precis, dans cette portee precise, est-il deja actif ?
  const base = supabase
    .from("chatter_shift_assignments")
    .select("id, assigned_from")
    .eq("chatter_id", chatterId)
    .eq("shift_slot", slot)
    .is("assigned_to", null);

  const { data: existing } = await (
    modelId ? base.eq("model_id", modelId) : base.is("model_id", null)
  ).maybeSingle();

  if (existing) {
    if (existing.assigned_from === today) {
      await supabase.from("chatter_shift_assignments").delete().eq("id", existing.id);
    } else {
      const yesterday = toDateString(new Date(Date.now() - 86400000));
      await supabase.from("chatter_shift_assignments").update({ assigned_to: yesterday }).eq("id", existing.id);
    }

    await logAction(supabase, {
      agencyId: profile.agency_id,
      actorId: user.id,
      actorName: profile.full_name,
      action: "shift.unassign",
      targetLabel: name,
      details: { creneau: SLOT_INFO[slot].label, modele: modelLabel },
    });

    revalidatePath("/admin/planning");
    revalidatePath(`/admin/chatters/${chatterId}`);
    return {};
  }

  const { error } = await supabase
    .from("chatter_shift_assignments")
    .insert({ chatter_id: chatterId, shift_slot: slot, model_id: modelId, assigned_from: today });

  if (error) return { error: error.message };

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "shift.assign",
    targetLabel: name,
    details: { creneau: SLOT_INFO[slot].label, modele: modelLabel, a_partir_du: today },
  });

  revalidatePath("/admin/planning");
  revalidatePath(`/admin/chatters/${chatterId}`);
  return {};
}

/** L'admin peut poser ou lever un jour OFF, comme le chatter. */
export async function toggleDayOffAsAdmin(chatterId: string, day: string) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  const name = await chatterName(supabase, chatterId);
  if (!name) return;

  const { data: existing } = await supabase
    .from("chatter_days_off")
    .select("id")
    .eq("chatter_id", chatterId)
    .eq("day_off", day)
    .maybeSingle();

  if (existing) {
    await supabase.from("chatter_days_off").delete().eq("id", existing.id);
  } else {
    await supabase.from("chatter_days_off").insert({ chatter_id: chatterId, day_off: day });
  }

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: existing ? "dayoff.remove" : "dayoff.add",
    targetLabel: name,
    details: { jour: day },
  });

  revalidatePath("/admin/planning");
}
