import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchPayroll, type PayrollRow } from "./payroll";
import { fetchInflowwByChatter, INFLOWW_COVERED_PLATFORMS } from "./infloww";
import type { Platform } from "./types";
import { platformLabel } from "./platforms";

/**
 * Recapitulatif de paie d'une periode : ce qu'on doit a chaque chatter, et
 * pourquoi.
 *
 * L'ecart entre declare et tracke n'a de sens que sur la part effectivement
 * surveillee. Opposer tout le declare aux sources disponibles ferait passer un
 * chatter travaillant sur un compte non suivi pour un surdeclarant massif alors
 * que personne ne verifie son travail.
 *
 * La couverture se decide MODELE PAR MODELE, et non par plateforme : ce qui
 * compte est que la plateforme du modele soit dans le perimetre Infloww ET que
 * le chatter y soit rattache aussi.
 */

/**
 * Source censee suivre chaque plateforme.
 *
 * OnlyFans passe par Infloww, non pas en direct (l'agence n'a pas droit a la
 * cle API) mais via l'export XLSX que l'admin importe par periode. Une
 * plateforme custom reste hors perimetre : son CA declare reste donc non
 * verifiable, ce que l'ecran dit explicitement.
 */
const SOURCE_BY_PLATFORM: Record<string, "infloww"> = {
  onlyfans: "infloww",
};

/**
 * Un modele est-il couvert par une source, en principe ?
 *
 * La source couvre tout le roster OnlyFans d'un coup (l'import Infloww est par
 * chatteur, pas par modele), donc "couvert" se resume a : la plateforme est-elle
 * dans le perimetre Infloww de l'agence.
 */
function modelCoveredBySource(platform: Platform): boolean {
  return INFLOWW_COVERED_PLATFORMS.has(platform);
}

export interface RecapAdjustment {
  id: string;
  kind: "bonus" | "sanction";
  amountUsd: number;
  reason: string;
  /** Non null quand la ligne a été générée automatiquement par une règle. */
  sourceRuleId: string | null;
}

export interface RecapRow {
  chatterId: string;
  fullName: string;
  active: boolean;

  declaredUsd: number;
  /** Part declaree sur une plateforme surveillee, comparable au tracke. */
  declaredCheckableUsd: number;
  /** Part declaree que rien ne surveille, avec le detail par plateforme. */
  declaredUncheckableUsd: number;
  uncheckableReasons: string[];

  trackedUsd: number | null;
  trackedInflowwUsd: number | null;

  /** declaredCheckable - tracked, null si rien n'est comparable. */
  gapUsd: number | null;

  commissionUsd: number;
  effectiveRate: number;
  adjustments: RecapAdjustment[];
  bonusUsd: number;
  sanctionUsd: number;
  /** Total a verser : commission + bonus - sanctions. */
  totalUsd: number;
  paidAt: string | null;
  /** Un taux de commission est en cours pour ce chatter. */
  hasRate: boolean;
  /** CA net qu'aucun taux ne couvre : payé zéro en silence sans ce signal. */
  uncoveredRevenueUsd: number;
}

export interface Recap {
  rows: RecapRow[];
  totalUsd: number;
  /** Sources reellement interrogees, pour ne pas laisser croire a une couverture complete. */
  sources: { infloww: boolean };
  /**
   * CA Infloww importe qu'aucun chatteur ne recupere, en $ : soit non assigne
   * cote Infloww, soit un employe Infloww pas encore relie a un de nos chatteurs.
   */
  unassignedInflowwUsd: number;
  /** Modeles ayant genere du CA sur la periode sans etre relies a leur source. */
  unconnectedModels: { name: string; platform: Platform; source: "infloww" }[];

}

/**
 * Construit le recapitulatif d'une periode pour tous les chatters.
 *
 * Une source muette n'annule pas le recapitulatif : elle se signale.
 */
export async function buildRecap(
  supabase: SupabaseClient,
  agencyId: string,
  periodStart: string,
  periodEnd: string,
  platform?: string | null
): Promise<Recap> {
  const [payroll, { data: shiftRows }, { data: bonuses }, { data: sanctions }] =
    await Promise.all([
      // Paie scope a la plateforme demandee : revenue, commission, primes et
      // taux manquants viennent deja filtres par fn_agency_payroll(p_platform).
      fetchPayroll(supabase, agencyId, periodStart, periodEnd, platform ?? null),
      supabase
        .from("shift_entries")
        .select(
          "chatter_id, model:models(id, name, platform), sale_lines(amount)"
        )
        .gte("shift_date", periodStart)
        .lte("shift_date", periodEnd),
      supabase
        .from("bonuses")
        .select("id, chatter_id, amount_usd, reason, source_rule_id")
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd),
      supabase
        .from("sanctions")
        .select("id, chatter_id, amount_usd, reason, source_rule_id")
        .eq("period_start", periodStart)
        .eq("period_end", periodEnd),
    ]);

  // CA declare par chatter et par MODELE, en $ — stockage natif USD, aucune
  // conversion de devise depuis le retrait du taux de change.
  interface ModelInfo {
    id: string;
    name: string;
    platform: Platform;
    connected: boolean;
    // null = plateforme custom, sans suivi automatique.
    source: "infloww" | null;
  }
  const declaredByModel = new Map<string, Map<string, number>>();
  const modelInfo = new Map<string, ModelInfo>();

  for (const row of (shiftRows ?? []) as {
    chatter_id: string;
    model:
      | { id: string; name: string; platform: Platform }
      | { id: string; name: string; platform: Platform }[]
      | null;
    sale_lines: { amount: number | string }[];
  }[]) {
    const model = Array.isArray(row.model) ? row.model[0] : row.model;
    if (!model) continue;
    // Recapitulatif scope a une plateforme : on ne conserve que ses shifts, le
    // reste du CA (et son suivi) appartient a une autre page de paie.
    if (platform && model.platform !== platform) continue;
    const total = row.sale_lines.reduce((s, l) => s + Number(l.amount), 0);
    const usd = total;

    // Plateforme custom : hors des sources connues, donc jamais suivie.
    const source = SOURCE_BY_PLATFORM[model.platform] ?? null;
    modelInfo.set(model.id, {
      id: model.id,
      name: model.name,
      platform: model.platform,
      source,
      connected: modelCoveredBySource(model.platform),
    });

    const per = declaredByModel.get(row.chatter_id) ?? new Map<string, number>();
    per.set(model.id, (per.get(model.id) ?? 0) + usd);
    declaredByModel.set(row.chatter_id, per);
  }

  // --- Infloww (OnlyFans) : lu depuis l'import XLSX de la periode ---
  const infloww = await fetchInflowwByChatter(supabase, agencyId, periodStart, periodEnd);
  const inflowwByChatter = infloww.byChatter;

  const adjustmentsFor = (chatterId: string): RecapAdjustment[] => [
    ...((bonuses ?? []) as { id: string; chatter_id: string; amount_usd: number | string; reason: string; source_rule_id: string | null }[])
      .filter((b) => b.chatter_id === chatterId)
      .map((b) => ({
        id: b.id,
        kind: "bonus" as const,
        amountUsd: Number(b.amount_usd),
        reason: b.reason,
        sourceRuleId: b.source_rule_id,
      })),
    ...((sanctions ?? []) as { id: string; chatter_id: string; amount_usd: number | string; reason: string; source_rule_id: string | null }[])
      .filter((s) => s.chatter_id === chatterId)
      .map((s) => ({
        id: s.id,
        kind: "sanction" as const,
        amountUsd: Number(s.amount_usd),
        reason: s.reason,
        sourceRuleId: s.source_rule_id,
      })),
  ];

  const rows: RecapRow[] = payroll.map((r: PayrollRow) => {
    const per = declaredByModel.get(r.chatterId) ?? new Map<string, number>();

    let checkable = 0;
    let uncheckable = 0;
    const reasons: string[] = [];

    for (const [modelId, usd] of per) {
      const info = modelInfo.get(modelId);
      if (!info) continue;

      // Le chatter est-il rapproche de sa source ? Une ligne importee lui a ete
      // rattachee sur la periode. Plateforme custom : aucune source, jamais
      // rapproche.
      const chatterLinked = info.source === "infloww" ? inflowwByChatter.has(r.chatterId) : false;

      if (info.connected && chatterLinked) {
        checkable += usd;
      } else {
        uncheckable += usd;
        reasons.push(
          // Plateforme custom : pas de suivi du tout, ce n'est ni un
          // rattachement ni une source manquante.
          info.source === null
            ? `${platformLabel(info.platform)} n'a pas de suivi automatique`
            : !info.connected
              ? `${platformLabel(info.platform)} n'est pas suivi par Infloww`
              : `aucune stat Infloww importée pour ce chatteur sur la période`
        );
      }
    }

    // Infloww est deja en dollars (l'export donne le CA brut en $).
    const inflowwUsd = inflowwByChatter.get(r.chatterId)?.salesUsd ?? null;

    // Le tracke reste null s'il n'y a rien a comparer, pour ne pas afficher 0
    // la ou l'on ne sait simplement pas.
    const tracked = inflowwUsd;

    return {
      chatterId: r.chatterId,
      fullName: r.fullName,
      active: r.active,
      declaredUsd: r.revenueUsd,
      declaredCheckableUsd: checkable,
      declaredUncheckableUsd: uncheckable,
      uncheckableReasons: [...new Set(reasons)],
      trackedUsd: tracked,
      trackedInflowwUsd: inflowwUsd,
      // L'ecart ne porte que sur la part surveillee : comparer le reste
      // n'aurait aucun sens et se lirait comme une anomalie.
      gapUsd: tracked === null ? null : checkable - tracked,
      commissionUsd: r.commissionUsd,
      effectiveRate: r.effectiveRate,
      adjustments: adjustmentsFor(r.chatterId),
      bonusUsd: r.bonusUsd,
      sanctionUsd: r.sanctionUsd,
      totalUsd: r.netUsd,
      paidAt: r.paidAt,
      hasRate: r.hasRate,
      uncoveredRevenueUsd: r.uncoveredRevenueUsd,
    };
  });

  return {
    rows,
    totalUsd: rows.reduce((s, r) => s + r.totalUsd, 0),
    sources: { infloww: inflowwByChatter.size > 0 },
    unassignedInflowwUsd: infloww.unassignedUsd,
    unconnectedModels: [...modelInfo.values()]
      // Une plateforme custom (source null) n'est pas "a relier" : elle n'a
      // simplement pas de suivi. On ne la signale pas comme un oubli.
      .filter((m): m is typeof m & { source: "infloww" } => !m.connected && m.source !== null)
      .map((m) => ({ name: m.name, platform: m.platform, source: m.source })),
  };
}
