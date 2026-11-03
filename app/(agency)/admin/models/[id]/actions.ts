"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyAdmin } from "@/lib/require-role";
import { logAction } from "@/lib/audit";

export interface RuleState {
  error?: string;
}

type RuleKind = "bonus" | "sanction";

/** Lit et valide les champs d'un formulaire de règle (création ou édition). */
function parseRule(formData: FormData): { kind: RuleKind; amountUsd: number; reason: string } | { error: string } {
  const kind = String(formData.get("kind") ?? "");
  const amountRaw = String(formData.get("amount_usd") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const amountUsd = Number.parseFloat(amountRaw);

  if (kind !== "bonus" && kind !== "sanction") return { error: "Type invalide." };
  if (amountRaw === "" || !Number.isFinite(amountUsd) || amountUsd <= 0) {
    return { error: "Montant invalide (en dollars, positif)." };
  }
  if (!reason) return { error: "Motif requis." };

  return { kind, amountUsd, reason };
}

/**
 * Crée une règle de prime/sanction sur un modèle.
 *
 * Le montant se saisit en dollars (amount_usd) : c'est l'unité dans laquelle on
 * raisonne sur le récapitulatif. La conversion en euros se fait à l'application,
 * au taux courant — comme pour une prime saisie à la main.
 */
export async function createModelRule(modelId: string, _prev: RuleState, formData: FormData): Promise<RuleState> {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const { data: model } = await supabase
    .from("models")
    .select("name, agency_id")
    .eq("id", modelId)
    .maybeSingle();
  if (!model || model.agency_id !== profile.agency_id) return { error: "Modèle introuvable." };

  const parsed = parseRule(formData);
  if ("error" in parsed) return { error: parsed.error };

  const { error } = await supabase.from("model_payroll_rules").insert({
    model_id: modelId,
    kind: parsed.kind,
    amount_usd: parsed.amountUsd.toFixed(2),
    reason: parsed.reason,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "payroll.rule.create",
    targetLabel: model.name,
    details: { type: parsed.kind, montant_usd: parsed.amountUsd, motif: parsed.reason },
  });

  revalidatePath(`/admin/models/${modelId}`);
  return {};
}

/** Modifie une règle existante (type, montant, motif). */
export async function updateModelRule(
  ruleId: string,
  modelId: string,
  _prev: RuleState,
  formData: FormData
): Promise<RuleState> {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const parsed = parseRule(formData);
  if ("error" in parsed) return { error: parsed.error };

  const { error } = await supabase
    .from("model_payroll_rules")
    .update({ kind: parsed.kind, amount_usd: parsed.amountUsd.toFixed(2), reason: parsed.reason })
    .eq("id", ruleId);
  if (error) return { error: error.message };

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "payroll.rule.update",
    targetLabel: modelId,
    details: { type: parsed.kind, montant_usd: parsed.amountUsd, motif: parsed.reason },
  });

  revalidatePath(`/admin/models/${modelId}`);
  return {};
}

/**
 * Active ou désactive une règle. Désactiver ne retire rien de ce qui a déjà été
 * appliqué : la règle cesse seulement de se déclencher aux prochaines passes.
 */
export async function toggleModelRule(ruleId: string, modelId: string, active: boolean) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const { data: rule } = await supabase
    .from("model_payroll_rules")
    .select("kind, amount_usd, reason")
    .eq("id", ruleId)
    .maybeSingle();

  await supabase.from("model_payroll_rules").update({ active }).eq("id", ruleId);

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "payroll.rule.toggle",
    targetLabel: rule?.reason ?? ruleId,
    details: { type: rule?.kind, montant_usd: rule ? Number(rule.amount_usd) : undefined, actif: active },
  });

  revalidatePath(`/admin/models/${modelId}`);
}

/** Supprime une règle (sans toucher aux primes/sanctions déjà générées). */
export async function deleteModelRule(ruleId: string, modelId: string) {
  const { supabase } = await requireAgencyAdmin();
  await supabase.from("model_payroll_rules").delete().eq("id", ruleId);
  revalidatePath(`/admin/models/${modelId}`);
}
