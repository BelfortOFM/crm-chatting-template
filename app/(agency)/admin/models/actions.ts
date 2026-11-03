"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyAdmin } from "@/lib/require-role";
import { logAction } from "@/lib/audit";
import type { Platform, Currency } from "@/lib/types";
import { BUILTIN_CODES, slugifyPlatform } from "@/lib/platforms";
import { getPeriodForDate, toDateString } from "@/lib/period";

export interface ActionState {
  error?: string;
}

export async function createModel(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, profile } = await requireAgencyAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const platform = String(formData.get("platform") ?? "").trim();

  if (!name) return { error: "Nom requis." };
  if (!platform) return { error: "Plateforme requise." };

  // Une plateforme valide est integree, ou custom de cette agence. Le code
  // custom est verifie en base ; sinon le trigger de devise refuserait
  // l'insertion avec une erreur brute.
  if (!BUILTIN_CODES.has(platform as Platform)) {
    const { data: cp } = await supabase
      .from("custom_platforms")
      .select("code")
      .eq("agency_id", profile.agency_id)
      .eq("code", platform)
      .maybeSingle();
    if (!cp) return { error: "Plateforme inconnue." };
  }

  const { data: model, error } = await supabase
    .from("models")
    .insert({ agency_id: profile.agency_id, name, platform })
    .select("id")
    .single();

  if (error || !model) return { error: error?.message ?? "Échec de la création." };

  revalidatePath("/admin/models");
  return {};
}

/** Ajoute une plateforme personnalisee (nom + devise) a l'agence. */
export async function addCustomPlatform(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user, profile } = await requireAgencyAdmin();
  const label = String(formData.get("label") ?? "").trim();
  // Devise unique USD (contrainte en base sur custom_platforms.currency) :
  // plus de choix de devise, toutes les plateformes custom sont en dollars.
  const currency: Currency = "USD";

  if (!label) return { error: "Nom de la plateforme requis." };

  const code = slugifyPlatform(label);
  if (code.length < 2) return { error: "Nom trop court." };
  if (BUILTIN_CODES.has(code as Platform)) {
    return { error: "Cette plateforme existe déjà (intégrée)." };
  }

  const { error } = await supabase.from("custom_platforms").insert({
    agency_id: profile.agency_id,
    code,
    label,
    currency,
    created_by: user.id,
  });

  if (error) {
    if (error.code === "23505") return { error: "Cette plateforme existe déjà." };
    return { error: error.message };
  }

  revalidatePath("/admin/models");
  return {};
}

/**
 * Supprime une plateforme personnalisee. Refuse si des modeles l'utilisent
 * encore : sans ce garde, leur devise deviendrait introuvable au prochain
 * recalcul.
 */
export async function deleteCustomPlatform(code: string): Promise<ActionState> {
  const { supabase, profile } = await requireAgencyAdmin();

  const { count } = await supabase
    .from("models")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", profile.agency_id)
    .eq("platform", code);

  if ((count ?? 0) > 0) {
    return { error: "Des modèles utilisent encore cette plateforme." };
  }

  await supabase
    .from("custom_platforms")
    .delete()
    .eq("agency_id", profile.agency_id)
    .eq("code", code);

  revalidatePath("/admin/models");
  return {};
}

// Platform is intentionally not editable after creation: currency is derived
// from it (toujours USD depuis le retrait du taux de change). Changing platform
// afterward would silently mislabel every historical shift for that model.
// Only name, active state and chatting-type tags can be edited post-creation.

export async function updateModelName(id: string, formData: FormData) {
  const { supabase } = await requireAgencyAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("models").update({ name }).eq("id", id);
  revalidatePath("/admin/models");
}

export async function toggleModelActive(id: string, active: boolean) {
  const { supabase } = await requireAgencyAdmin();
  await supabase.from("models").update({ active }).eq("id", id);
  revalidatePath("/admin/models");
}


export interface DeleteModelState {
  ok?: boolean;
  error?: string;
  /** Le modele porte de l'historique : il est desactivable, pas supprimable. */
  hasHistory?: boolean;
}

/**
 * Supprime un modele — ou explique pourquoi c'est impossible.
 *
 * Un modele reference par des shift_entries ne peut pas etre supprime : la cle
 * etrangere est en RESTRICT pour ne jamais orpheliner l'historique financier.
 * Avant, l'erreur etait avalee et la page se rechargeait sans rien changer,
 * d'ou l'impression d'un bouton mort. On la remonte maintenant, avec la
 * desactivation comme porte de sortie.
 */
export async function deleteModel(id: string): Promise<DeleteModelState> {
  const { supabase } = await requireAgencyAdmin();

  const { error } = await supabase.from("models").delete().eq("id", id);

  if (error) {
    // 23503 = foreign_key_violation : des shifts pointent encore ce modele.
    if (error.code === "23503") {
      return {
        error:
          "Ce modèle a des shifts déclarés : le supprimer effacerait de l'historique de paie. Désactive-le plutôt.",
        hasHistory: true,
      };
    }
    return { error: error.message };
  }

  revalidatePath("/admin/models");
  return { ok: true };
}

/**
 * Releve du nombre d'abonnes d'un modele.
 *
 * Saisie a la main faute d'API exposant l'information. Le
 * releve est date — un second passage le meme jour corrige la valeur au lieu
 * d'empiler deux verites, et les periodes passees gardent l'audience de leur
 * epoque.
 */
export async function recordSubscribers(modelId: string, formData: FormData) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const raw = String(formData.get("subscriber_count") ?? "").trim();
  const count = Number.parseInt(raw, 10);
  if (raw === "" || !Number.isFinite(count) || count < 0) return;

  const { data: model } = await supabase
    .from("models")
    .select("name, agency_id")
    .eq("id", modelId)
    .maybeSingle();
  if (!model || model.agency_id !== profile.agency_id) return;

  await supabase.from("model_subscriber_counts").upsert(
    {
      model_id: modelId,
      agency_id: profile.agency_id,
      subscriber_count: count,
      recorded_by: user.id,
    },
    { onConflict: "model_id,recorded_on" }
  );

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "subscribers.record",
    targetLabel: model.name,
    details: { abonnes: count },
  });

  revalidatePath("/admin/models");
  revalidatePath("/admin/dashboard");
}

export interface SubscriberSyncResult {
  error?: string;
  synced?: { modelName: string; count: number; asOf: string }[];
  unmatched?: number;
}

/**
 * Objectif de CA d'un modele, par periode.
 *
 * Remplace l'ancien objectif pose sur le chatter : on fixe une cible par
 * compte, puis on la repartit entre les chatters qui y travaillent (voir la
 * fiche chatter). Un objectif attache au compte survit aux changements
 * d'equipe, ce que l'ancien modele ne permettait pas.
 *
 * Fixe par periode (P1-P4), comme le reste de l'outil (declarations,
 * classement, paie) — jamais par mois calendaire, qui n'existe nulle part
 * ailleurs comme unite de decision.
 */
export async function setModelGoal(modelId: string, formData: FormData) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const raw = String(formData.get("target_amount_usd") ?? "").trim();
  const amount = Number.parseFloat(raw);
  if (raw === "" || !Number.isFinite(amount) || amount < 0) return;

  const { data: model } = await supabase
    .from("models")
    .select("name, agency_id")
    .eq("id", modelId)
    .maybeSingle();
  if (!model || model.agency_id !== profile.agency_id) return;

  const period = getPeriodForDate(new Date());
  const periodStart = toDateString(period.start);
  const periodEnd = toDateString(period.end);

  await supabase.from("model_period_goals").upsert(
    { model_id: modelId, period_start: periodStart, period_end: periodEnd, target_amount_usd: amount },
    { onConflict: "model_id,period_start,period_end" }
  );

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "goal.model",
    targetLabel: model.name,
    details: { objectif_usd: amount, periode: `P${period.periodNumber} ${periodStart} → ${periodEnd}` },
  });

  revalidatePath("/admin/models");
  revalidatePath("/admin/dashboard");
}

/**
 * Objectif de LTV (CA net / abonnes) d'un modele, pour la periode P1-P4 en
 * cours. Independant de l'objectif de CA : un modele peut tenir son CA avec
 * moins d'abonnes mieux convertis, ou l'inverse.
 */
export async function setModelLtvTarget(modelId: string, formData: FormData) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const raw = String(formData.get("target_ltv_usd") ?? "").trim();
  const amount = Number.parseFloat(raw);
  if (raw === "" || !Number.isFinite(amount) || amount < 0) return;

  const { data: model } = await supabase
    .from("models")
    .select("name, agency_id")
    .eq("id", modelId)
    .maybeSingle();
  if (!model || model.agency_id !== profile.agency_id) return;

  const period = getPeriodForDate(new Date());
  const periodStart = toDateString(period.start);
  const periodEnd = toDateString(period.end);

  await supabase.from("model_period_ltv_targets").upsert(
    { model_id: modelId, period_start: periodStart, period_end: periodEnd, target_ltv_usd: amount, created_by: user.id },
    { onConflict: "model_id,period_start,period_end" }
  );

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "ltv_target.model",
    targetLabel: model.name,
    details: { objectif_ltv_usd: amount, periode: `P${period.periodNumber} ${periodStart} → ${periodEnd}` },
  });

  revalidatePath("/admin/models");
  revalidatePath("/admin/dashboard");
}
