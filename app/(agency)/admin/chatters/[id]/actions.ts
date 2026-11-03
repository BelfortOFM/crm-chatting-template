"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyAdmin } from "@/lib/require-role";
import { getPeriodForDate, toDateString } from "@/lib/period";
import { logAction } from "@/lib/audit";
import { sendPushToUser } from "@/lib/push";

/** Nom du chatter, pour que le journal reste lisible sans jointure. */
async function chatterName(
  supabase: Awaited<ReturnType<typeof requireAgencyAdmin>>["supabase"],
  chatterId: string
): Promise<string> {
  const { data } = await supabase.from("profiles").select("full_name").eq("id", chatterId).maybeSingle();
  return data?.full_name ?? chatterId;
}

/**
 * Assigne un ou plusieurs modeles d'un coup (cases a cocher cote ecran) : un
 * chatter en couvre souvent plusieurs, repeter le formulaire un par un n'avait
 * aucune raison d'etre.
 */
export async function assignModel(chatterId: string, formData: FormData) {
  const { supabase } = await requireAgencyAdmin();
  const modelIds = [...new Set(formData.getAll("model_id").map(String).filter(Boolean))];
  if (modelIds.length === 0) return;

  await supabase
    .from("chatter_model_assignments")
    .insert(modelIds.map((modelId) => ({ chatter_id: chatterId, model_id: modelId })));

  const { data: models } = await supabase.from("models").select("name").in("id", modelIds);
  const names = (models ?? []).map((m) => m.name).join(", ");
  const plural = modelIds.length > 1;
  await sendPushToUser(supabase, chatterId, {
    title: plural ? "Nouveaux modèles assignés" : "Nouveau modèle assigné",
    body: `${names || "Un modèle"} t'${plural ? "ont" : "a"} été assigné${plural ? "s" : ""} — tu peux déclarer dessus.`,
    url: "/report",
    tag: "modele",
  });

  revalidatePath(`/admin/chatters/${chatterId}`);
  // Les primes se posent aussi depuis le recapitulatif de paie.
  revalidatePath("/admin/paie", "layout");
}

export async function unassignModel(assignmentId: string, chatterId: string) {
  const { supabase } = await requireAgencyAdmin();
  await supabase
    .from("chatter_model_assignments")
    .update({ assigned_to: toDateString(new Date()) })
    .eq("id", assignmentId);
  revalidatePath(`/admin/chatters/${chatterId}`);
  // Les primes se posent aussi depuis le recapitulatif de paie.
  revalidatePath("/admin/paie", "layout");
}

/**
 * Nomme ce chatter Team Leader d'un ou plusieurs modeles : il pourra alors
 * voir, en lecture seule, le planning de tous les chatters lies a ces
 * modeles. Historise comme chatter_model_assignments — jamais un simple flag.
 */
export async function assignTeamLeader(chatterId: string, formData: FormData) {
  const { supabase, user, profile } = await requireAgencyAdmin();
  const modelIds = [...new Set(formData.getAll("model_id").map(String).filter(Boolean))];
  if (modelIds.length === 0) return;

  await supabase
    .from("team_leader_assignments")
    .insert(modelIds.map((modelId) => ({ chatter_id: chatterId, model_id: modelId })));

  const { data: models } = await supabase.from("models").select("name").in("id", modelIds);
  const names = (models ?? []).map((m) => m.name).join(", ");

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "team_leader.assign",
    targetLabel: await chatterName(supabase, chatterId),
    details: { modeles: names },
  });

  revalidatePath(`/admin/chatters/${chatterId}`);
}

export async function unassignTeamLeader(assignmentId: string, chatterId: string) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const { data: removed } = await supabase
    .from("team_leader_assignments")
    .select("model:models(name)")
    .eq("id", assignmentId)
    .maybeSingle();
  const removedModel = removed?.model as { name: string } | { name: string }[] | null;
  const modelName = Array.isArray(removedModel) ? removedModel[0]?.name : removedModel?.name;

  await supabase
    .from("team_leader_assignments")
    .update({ assigned_to: toDateString(new Date()) })
    .eq("id", assignmentId);

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "team_leader.unassign",
    targetLabel: await chatterName(supabase, chatterId),
    details: { modele: modelName ?? null },
  });

  revalidatePath(`/admin/chatters/${chatterId}`);
}

export async function updateCommission(chatterId: string, formData: FormData) {
  const { supabase, user, profile } = await requireAgencyAdmin();
  const ratePercent = parseFloat(String(formData.get("rate_percent") ?? ""));
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) return;

  const today = toDateString(new Date());

  const { data: current } = await supabase
    .from("commission_rules")
    .select("id, valid_from")
    .eq("chatter_id", chatterId)
    .is("valid_to", null)
    .maybeSingle();

  if (current && current.valid_from === today) {
    // Already changed today — update in place instead of stacking duplicate rows.
    await supabase.from("commission_rules").update({ rate_percent: ratePercent }).eq("id", current.id);
    revalidatePath(`/admin/chatters/${chatterId}`);
    return;
  }

  if (current) {
    const yesterday = toDateString(new Date(Date.now() - 86400000));
    await supabase.from("commission_rules").update({ valid_to: yesterday }).eq("id", current.id);
  }

  await supabase
    .from("commission_rules")
    .insert({ chatter_id: chatterId, rate_percent: ratePercent, valid_from: today });

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "commission.update",
    targetLabel: await chatterName(supabase, chatterId),
    details: { taux: `${ratePercent}%`, a_partir_du: today },
  });

  revalidatePath(`/admin/chatters/${chatterId}`);
  // Les primes se posent aussi depuis le recapitulatif de paie.
  revalidatePath("/admin/paie", "layout");
}

/**
 * Part d'objectif confiee a ce chatter sur un modele, pour la periode en cours
 * (P1-P4, comme partout ailleurs dans l'outil — jamais le mois calendaire).
 *
 * L'objectif etait auparavant pose sur la personne, sans lien avec les comptes
 * qu'elle gere : il disparaissait des qu'on la changeait de modele et ne
 * pouvait pas se repartir a plusieurs. Il porte desormais sur le couple
 * (modele, chatter). Saisir 0 retire l'allocation plutot que d'enregistrer un
 * objectif nul.
 */
export async function setGoalAllocation(chatterId: string, modelId: string, formData: FormData) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const raw = String(formData.get("target_amount_usd") ?? "").trim();
  const amount = raw === "" ? 0 : Number.parseFloat(raw);
  if (!Number.isFinite(amount) || amount < 0) return;

  const period = getPeriodForDate(new Date());
  const periodStart = toDateString(period.start);
  const periodEnd = toDateString(period.end);

  if (amount === 0) {
    await supabase
      .from("model_goal_allocations")
      .delete()
      .eq("chatter_id", chatterId)
      .eq("model_id", modelId)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd);
  } else {
    await supabase.from("model_goal_allocations").upsert(
      { chatter_id: chatterId, model_id: modelId, period_start: periodStart, period_end: periodEnd, target_amount_usd: amount },
      { onConflict: "model_id,chatter_id,period_start,period_end" }
    );
  }

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "goal.allocate",
    targetLabel: await chatterName(supabase, chatterId),
    details: { objectif_usd: amount, periode: `P${period.periodNumber} ${periodStart} → ${periodEnd}` },
  });

  revalidatePath(`/admin/chatters/${chatterId}`);
  // Les primes se posent aussi depuis le recapitulatif de paie.
  revalidatePath("/admin/paie", "layout");
}

function parsePeriodRange(formData: FormData): { periodStart: string; periodEnd: string } | null {
  const [periodStart, periodEnd] = String(formData.get("period_range") ?? "").split("|");
  if (!periodStart || !periodEnd) return null;
  return { periodStart, periodEnd };
}

export async function addBonus(chatterId: string, formData: FormData) {
  const { supabase, user, profile } = await requireAgencyAdmin();
  const amount = parseFloat(String(formData.get("amount_usd") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();
  const range = parsePeriodRange(formData);

  if (!Number.isFinite(amount) || amount <= 0 || !reason || !range) return;
  const { periodStart, periodEnd } = range;

  await supabase.from("bonuses").insert({
    chatter_id: chatterId,
    period_start: periodStart,
    period_end: periodEnd,
    amount_usd: amount,
    reason,
    created_by: user.id,
  });

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "bonus.add",
    targetLabel: await chatterName(supabase, chatterId),
    details: { montant_usd: amount, motif: reason, periode: `${periodStart} → ${periodEnd}` },
  });

  // Un bonus se decouvrait en ouvrant l'app, parfois des jours plus tard.
  await sendPushToUser(supabase, chatterId, {
    title: "Bonus accordé",
    body: `${reason} — visible dans tes paiements.`,
    url: "/paiements",
    tag: "paie",
  });

  revalidatePath(`/admin/chatters/${chatterId}`);
  // Les primes se posent aussi depuis le recapitulatif de paie.
  revalidatePath("/admin/paie", "layout");
}

export async function deleteBonus(id: string, chatterId: string) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const { data: removed } = await supabase
    .from("bonuses")
    .select("amount_usd, reason")
    .eq("id", id)
    .maybeSingle();

  await supabase.from("bonuses").delete().eq("id", id);

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "bonus.delete",
    targetLabel: await chatterName(supabase, chatterId),
    details: { montant_usd: removed?.amount_usd, motif: removed?.reason },
  });

  revalidatePath(`/admin/chatters/${chatterId}`);
  // Les primes se posent aussi depuis le recapitulatif de paie.
  revalidatePath("/admin/paie", "layout");
}

export async function addSanction(chatterId: string, formData: FormData) {
  const { supabase, user, profile } = await requireAgencyAdmin();
  const amount = parseFloat(String(formData.get("amount_usd") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim();
  const range = parsePeriodRange(formData);

  if (!Number.isFinite(amount) || amount <= 0 || !reason || !range) return;
  const { periodStart, periodEnd } = range;

  await supabase.from("sanctions").insert({
    chatter_id: chatterId,
    period_start: periodStart,
    period_end: periodEnd,
    amount_usd: amount,
    reason,
    created_by: user.id,
  });

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "sanction.add",
    targetLabel: await chatterName(supabase, chatterId),
    details: { montant_usd: amount, motif: reason, periode: `${periodStart} → ${periodEnd}` },
  });

  // Prevenir plutot que laisser decouvrir un retrait sur la fiche de paie :
  // c'est la principale source de contestation.
  await sendPushToUser(supabase, chatterId, {
    title: "Sanction appliquée",
    body: `${reason} — détail dans tes paiements.`,
    url: "/paiements",
    tag: "paie",
  });

  revalidatePath(`/admin/chatters/${chatterId}`);
  // Les primes se posent aussi depuis le recapitulatif de paie.
  revalidatePath("/admin/paie", "layout");
}

export async function addWarning(chatterId: string, formData: FormData) {
  const { supabase, user, profile } = await requireAgencyAdmin();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return;

  await supabase.from("warnings").insert({ chatter_id: chatterId, reason, created_by: user.id });

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "warning.add",
    targetLabel: await chatterName(supabase, chatterId),
    details: { motif: reason },
  });

  await sendPushToUser(supabase, chatterId, {
    title: "Avertissement",
    body: reason,
    url: "/paiements",
    tag: "avertissement",
  });

  revalidatePath(`/admin/chatters/${chatterId}`);
}

export async function deleteWarning(id: string, chatterId: string) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const { data: removed } = await supabase.from("warnings").select("reason").eq("id", id).maybeSingle();
  await supabase.from("warnings").delete().eq("id", id);

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "warning.delete",
    targetLabel: await chatterName(supabase, chatterId),
    details: { motif: removed?.reason ?? null },
  });

  revalidatePath(`/admin/chatters/${chatterId}`);
}

export async function deleteSanction(id: string, chatterId: string) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const { data: removed } = await supabase
    .from("sanctions")
    .select("amount_usd, reason")
    .eq("id", id)
    .maybeSingle();

  await supabase.from("sanctions").delete().eq("id", id);

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "sanction.delete",
    targetLabel: await chatterName(supabase, chatterId),
    details: { montant_usd: removed?.amount_usd, motif: removed?.reason },
  });

  revalidatePath(`/admin/chatters/${chatterId}`);
  // Les primes se posent aussi depuis le recapitulatif de paie.
  revalidatePath("/admin/paie", "layout");
}
