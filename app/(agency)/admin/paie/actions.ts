"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyAdmin } from "@/lib/require-role";
import { fetchPayroll } from "@/lib/payroll";
import { fetchCaBreakdown } from "@/lib/payroll-platform";
import { type PaiePlatform } from "@/lib/paie-platforms";
import { logAction } from "@/lib/audit";
import { sendPushToUser } from "@/lib/push";

export interface PayoutState {
  error?: string;
  closed?: number;
}

/**
 * Cloture la paie d'une periode : fige, pour chaque chatter ayant quelque
 * chose a percevoir, les montants tels que calcules a cet instant.
 *
 * Le figeage est le coeur du sujet — une correction ulterieure d'un shift ne
 * doit pas reecrire ce qui a deja ete verse, sinon plus aucune trace ne
 * permet de justifier un paiement passe.
 */
export async function closePeriod(periodStart: string, periodEnd: string, platform: PaiePlatform): Promise<PayoutState> {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const rows = await fetchPayroll(supabase, profile.agency_id, periodStart, periodEnd, platform);
  const toClose = rows.filter((r) => r.paidAt === null && r.netUsd !== 0);

  if (toClose.length === 0) {
    return { error: "Rien à clôturer sur cette période." };
  }

  const { error } = await supabase.from("payouts").insert(
    toClose.map((r) => ({
      agency_id: profile.agency_id,
      chatter_id: r.chatterId,
      chatter_name: r.fullName,
      period_start: periodStart,
      period_end: periodEnd,
      platform,
      revenue_usd: r.revenueUsd.toFixed(2),
      // Fige aussi le detail des frais : si le taux de plateforme change un
      // jour, un bulletin deja verse doit rester explicable tel qu'il a ete
      // calcule.
      fee_usd: r.feeUsd.toFixed(2),
      net_revenue_usd: r.netRevenueUsd.toFixed(2),
      commission_usd: r.commissionUsd.toFixed(2),
      bonus_usd: r.bonusUsd.toFixed(2),
      sanction_usd: r.sanctionUsd.toFixed(2),
      net_usd: r.netUsd.toFixed(2),
      hours: r.hours.toFixed(2),
      paid_by: user.id,
    }))
  );

  if (error) return { error: error.message };

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "payout.close",
    targetLabel: `${platform} · ${periodStart} → ${periodEnd}`,
    details: {
      chatters: toClose.length,
      net_usd: toClose.reduce((s, r) => s + r.netUsd, 0).toFixed(2),
    },
  });

  // Chacun est prevenu de ce qui a ete arrete pour lui, pas seulement du fait
  // que "la paie est faite".
  await Promise.all(
    toClose.map((r) =>
      sendPushToUser(supabase, r.chatterId, {
        title: "Paie clôturée",
        body: `Ta période ${periodStart} → ${periodEnd} a été validée.`,
        url: "/paiements",
        tag: "paie",
      })
    )
  );

  revalidatePath("/admin/paie", "layout");
  return { closed: toClose.length };
}

/** Annule la cloture d'un chatter sur une periode (erreur de saisie corrigee apres coup). */
export async function reopenPayout(
  chatterId: string,
  periodStart: string,
  periodEnd: string,
  platform: PaiePlatform
) {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const { data: existing } = await supabase
    .from("payouts")
    .select("chatter_name, net_usd")
    .eq("chatter_id", chatterId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .or(`platform.eq.${platform},platform.is.null`)
    .maybeSingle();

  const { error } = await supabase
    .from("payouts")
    .delete()
    .eq("chatter_id", chatterId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .or(`platform.eq.${platform},platform.is.null`);

  if (error) return;

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "payout.reopen",
    targetLabel: existing?.chatter_name ?? chatterId,
    details: { platform, period: `${periodStart} → ${periodEnd}`, net_usd: existing?.net_usd },
  });

  revalidatePath("/admin/paie", "layout");
}

/* --- Règles automatiques de prime/sanction -------------------------------- */

export interface ApplyRulesResult {
  error?: string;
  applied?: { bonuses: number; sanctions: number };
}

/**
 * Applique les règles automatiques de la plateforme courante sur une période.
 *
 * Déclenchée par un bouton explicite du récapitulatif, jamais au chargement :
 * une lecture ne doit rien écrire. Pour chaque règle active d'un modèle de la
 * plateforme, chaque chatter ayant généré du CA sur ce modèle pendant la
 * période reçoit la prime/sanction forfaitaire (stockée en USD, comme tout le
 * reste). Idempotent : toute règle dont une ligne existe déjà pour
 * (chatter, période) est ignorée, grâce à source_rule_id.
 */
export async function applyPayrollRules(
  platform: string,
  periodStart: string,
  periodEnd: string
): Promise<ApplyRulesResult> {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const { data: ruleRows } = await supabase
    .from("model_payroll_rules")
    .select("id, model_id, kind, amount_usd, reason, model:models(platform, name)")
    .eq("active", true);

  const rules = ((ruleRows ?? []) as {
    id: string;
    model_id: string;
    kind: "bonus" | "sanction";
    amount_usd: number | string;
    reason: string;
    model: { platform: string; name: string } | { platform: string; name: string }[] | null;
  }[]).filter((r) => {
    const model = Array.isArray(r.model) ? r.model[0] : r.model;
    return model?.platform === platform;
  });

  if (rules.length === 0) {
    return { error: "Aucune règle active pour cette plateforme." };
  }

  const ruleIds = rules.map((r) => r.id);
  const [breakdown, { data: existingBonuses }, { data: existingSanctions }] = await Promise.all([
    fetchCaBreakdown(supabase, profile.agency_id, periodStart, periodEnd),
    supabase
      .from("bonuses")
      .select("chatter_id, source_rule_id")
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .in("source_rule_id", ruleIds),
    supabase
      .from("sanctions")
      .select("chatter_id, source_rule_id")
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .in("source_rule_id", ruleIds),
  ]);

  const seen = new Set<string>();
  for (const b of (existingBonuses ?? []) as { chatter_id: string; source_rule_id: string | null }[]) {
    if (b.source_rule_id) seen.add(`${b.source_rule_id}:${b.chatter_id}`);
  }
  for (const s of (existingSanctions ?? []) as { chatter_id: string; source_rule_id: string | null }[]) {
    if (s.source_rule_id) seen.add(`${s.source_rule_id}:${s.chatter_id}`);
  }

  type InsertRow = {
    chatter_id: string;
    period_start: string;
    period_end: string;
    amount_usd: number;
    reason: string;
    created_by: string;
    source_rule_id: string;
  };
  const bonusInserts: InsertRow[] = [];
  const sanctionInserts: InsertRow[] = [];

  for (const rule of rules) {
    const amountUsd = Number(rule.amount_usd);
    for (const [chatterId, split] of breakdown.splits) {
      const modelCa = split.byModel.get(rule.model_id) ?? 0;
      if (modelCa <= 0) continue;
      if (seen.has(`${rule.id}:${chatterId}`)) continue;

      const row: InsertRow = {
        chatter_id: chatterId,
        period_start: periodStart,
        period_end: periodEnd,
        amount_usd: amountUsd,
        reason: rule.reason,
        created_by: user.id,
        source_rule_id: rule.id,
      };
      if (rule.kind === "bonus") bonusInserts.push(row);
      else sanctionInserts.push(row);
    }
  }

  if (bonusInserts.length > 0) {
    const { error } = await supabase.from("bonuses").insert(bonusInserts);
    if (error) return { error: error.message };
  }
  if (sanctionInserts.length > 0) {
    const { error } = await supabase.from("sanctions").insert(sanctionInserts);
    if (error) return { error: error.message };
  }

  // Prévenir plutôt que laisser découvrir un retrait sur la fiche de paie,
  // comme pour une prime/sanction saisie à la main.
  await Promise.all(
    [
      ...bonusInserts.map((r) => ({
        chatterId: r.chatter_id,
        title: "Bonus accordé",
        body: `${r.reason} — visible dans tes paiements.`,
      })),
      ...sanctionInserts.map((r) => ({
        chatterId: r.chatter_id,
        title: "Sanction appliquée",
        body: `${r.reason} — détail dans tes paiements.`,
      })),
    ].map((n) =>
      sendPushToUser(supabase, n.chatterId, {
        title: n.title,
        body: n.body,
        url: "/paiements",
        tag: "paie",
      })
    )
  );

  await logAction(supabase, {
    agencyId: profile.agency_id,
    actorId: user.id,
    actorName: profile.full_name,
    action: "payroll.rules.apply",
    targetLabel: `${platform} · ${periodStart} → ${periodEnd}`,
    details: { primes: bonusInserts.length, sanctions: sanctionInserts.length },
  });

  revalidatePath("/admin/paie", "layout");
  return { applied: { bonuses: bonusInserts.length, sanctions: sanctionInserts.length } };
}
