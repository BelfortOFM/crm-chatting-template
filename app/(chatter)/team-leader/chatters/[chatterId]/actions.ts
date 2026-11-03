"use server";

import { revalidatePath } from "next/cache";
import { requireTeamLeaderFor } from "@/lib/require-role";
import { logAction } from "@/lib/audit";
import { sendPushToUser } from "@/lib/push";

async function chatterName(
  supabase: Awaited<ReturnType<typeof requireTeamLeaderFor>>["supabase"],
  chatterId: string
): Promise<string> {
  const { data } = await supabase.from("profiles").select("full_name").eq("id", chatterId).maybeSingle();
  return data?.full_name ?? chatterId;
}

function revalidateChatter(chatterId: string) {
  revalidatePath(`/team-leader/chatters/${chatterId}`);
  // L'admin gere le meme chatter depuis sa propre fiche, et les primes se
  // posent aussi depuis le recapitulatif de paie.
  revalidatePath(`/admin/chatters/${chatterId}`);
  revalidatePath("/admin/paie", "layout");
}

export async function addWarning(chatterId: string, formData: FormData) {
  const { supabase, user, profile } = await requireTeamLeaderFor(chatterId);
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
    title: "Warning",
    body: reason,
    url: "/paiements",
    tag: "avertissement",
  });

  revalidateChatter(chatterId);
}

export async function deleteWarning(id: string, chatterId: string) {
  const { supabase, user, profile } = await requireTeamLeaderFor(chatterId);

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

  revalidateChatter(chatterId);
}

function parsePeriodRange(formData: FormData): { periodStart: string; periodEnd: string } | null {
  const [periodStart, periodEnd] = String(formData.get("period_range") ?? "").split("|");
  if (!periodStart || !periodEnd) return null;
  return { periodStart, periodEnd };
}

export async function addSanction(chatterId: string, formData: FormData) {
  const { supabase, user, profile } = await requireTeamLeaderFor(chatterId);
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

  await sendPushToUser(supabase, chatterId, {
    title: "Penalty applied",
    body: `${reason} — see details in your payments.`,
    url: "/paiements",
    tag: "paie",
  });

  revalidateChatter(chatterId);
}

export async function deleteSanction(id: string, chatterId: string) {
  const { supabase, user, profile } = await requireTeamLeaderFor(chatterId);

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

  revalidateChatter(chatterId);
}
