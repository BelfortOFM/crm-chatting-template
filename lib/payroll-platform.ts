import type { SupabaseClient } from "@supabase/supabase-js";
import type { PayrollRow } from "./payroll";
import type { Platform } from "./types";

/**
 * Paie ventilee par plateforme (ou par modele), sans recalculer la commission.
 *
 * Le calcul officiel (fn_agency_payroll) reste la source : il applique les
 * frais, le taux a la date du shift, les bonus/sanctions. On ne le refait pas —
 * on le PRORATISE selon la part de CA de la plateforme demandee. Consequence :
 * la somme des vues par plateforme egale toujours le total officiel, et on
 * herite exactement de sa logique de frais et de taux, meme quand le taux
 * change en cours de periode.
 *
 * Les chatteurs de plateformes differentes ne se melangent donc plus : filtrer
 * sur une plateforme ne montre que son CA et sa commission, calcules a part.
 */

export interface CaSplit {
  /** CA brut par plateforme, en USD, pour un chatteur. */
  byPlatform: Map<string, number>;
  /** CA brut par modele (id -> usd), pour un chatteur. */
  byModel: Map<string, number>;
  total: number;
}

export interface ModelRef {
  id: string;
  name: string;
  platform: string;
}

export interface CaBreakdown {
  /** chatter_id -> ventilation de son CA brut (USD). */
  splits: Map<string, CaSplit>;
  /** Modeles ayant genere du CA sur la periode, pour alimenter le filtre. */
  models: ModelRef[];
  /** Plateformes ayant genere du CA sur la periode. */
  platforms: string[];
}

/**
 * CA brut par chatteur, ventile par plateforme et par modele, sur la periode.
 *
 * Stockage natif en USD depuis le retrait du taux de change : aucun montant
 * n'est reconverti.
 */
export async function fetchCaBreakdown(
  supabase: SupabaseClient,
  agencyId: string,
  periodStart: string,
  periodEnd: string
): Promise<CaBreakdown> {
  const { data } = await supabase
    .from("shift_entries")
    .select(
      "chatter_id, model:models(id, name, platform), sale_lines(amount)"
    )
    .eq("agency_id", agencyId)
    .gte("shift_date", periodStart)
    .lte("shift_date", periodEnd);

  const splits = new Map<string, CaSplit>();
  const models = new Map<string, ModelRef>();
  const platforms = new Set<string>();

  for (const row of (data ?? []) as {
    chatter_id: string;
    model: { id: string; name: string; platform: string } | { id: string; name: string; platform: string }[] | null;
    sale_lines: { amount: number | string }[];
  }[]) {
    const model = Array.isArray(row.model) ? row.model[0] : row.model;
    if (!model) continue;
    const native = row.sale_lines.reduce((s, l) => s + Number(l.amount), 0);
    if (native === 0) continue;
    const usd = native;

    const split = splits.get(row.chatter_id) ?? { byPlatform: new Map(), byModel: new Map(), total: 0 };
    split.byPlatform.set(model.platform, (split.byPlatform.get(model.platform) ?? 0) + usd);
    split.byModel.set(model.id, (split.byModel.get(model.id) ?? 0) + usd);
    split.total += usd;
    splits.set(row.chatter_id, split);

    models.set(model.id, { id: model.id, name: model.name, platform: model.platform });
    platforms.add(model.platform);
  }

  return { splits, models: [...models.values()], platforms: [...platforms] };
}

export interface PlatformScope {
  /** Filtre plateforme, ou null pour "toutes". */
  platform: Platform | string | null;
  /** Filtre modele (prioritaire sur la plateforme), ou null. */
  modelId: string | null;
}

/**
 * Reduit une ligne de paie a la part d'une plateforme (ou d'un modele).
 *
 * Prorata sur le CA : revenue, frais, CA net et commission sont ramenes a la
 * fraction que la plateforme represente dans le CA total du chatteur. Les bonus
 * et sanctions ne sont PAS proratises — ils portent sur la periode entiere, pas
 * sur une plateforme : on ne les compte donc que dans la vue "toutes", sinon on
 * les multiplierait par le nombre de plateformes.
 */
export function scopeRowToCa(row: PayrollRow, split: CaSplit | undefined, scope: PlatformScope): PayrollRow | null {
  if (scope.platform === null && scope.modelId === null) return row;
  if (!split || split.total <= 0) return null;

  const scopedCa = scope.modelId
    ? split.byModel.get(scope.modelId) ?? 0
    : split.byPlatform.get(scope.platform as string) ?? 0;

  if (scopedCa <= 0) return null;

  const frac = scopedCa / split.total;
  const commissionUsd = row.commissionUsd * frac;

  return {
    ...row,
    revenueUsd: row.revenueUsd * frac,
    feeUsd: row.feeUsd * frac,
    netRevenueUsd: row.netRevenueUsd * frac,
    commissionUsd,
    // Bonus/sanction hors prorata : ce sont des ajustements de periode, pas de
    // plateforme. En vue filtree on ne verse que la commission de la plateforme.
    bonusUsd: 0,
    sanctionUsd: 0,
    netUsd: commissionUsd,
    // Heures et taux ne se ventilent pas proprement par plateforme : on garde
    // le taux (identique) et on laisse les heures a zero en vue filtree.
    hours: 0,
    usdPerHour: 0,
  };
}

/** Applique un filtre plateforme/modele a toute une paie, lignes vides retirees. */
export function scopePayroll(rows: PayrollRow[], breakdown: CaBreakdown, scope: PlatformScope): PayrollRow[] {
  if (scope.platform === null && scope.modelId === null) return rows;
  return rows
    .map((r) => scopeRowToCa(r, breakdown.splits.get(r.chatterId), scope))
    .filter((r): r is PayrollRow => r !== null);
}

/**
 * Reduit une paie DEJA filtree par plateforme a un seul modele de cette
 * plateforme.
 *
 * Le denominateur du prorata est le CA de la PLATEFORME (pas le total toutes
 * plateformes), puisque les lignes recues sont deja reduites a la plateforme :
 * le modele represente une fraction de celle-ci, pas du tout.
 *
 * Meme regle que scopeRowToCa pour le reste : commission proratisee au CA
 * (exact quand le taux est stable sur la periode), bonus/sanctions a zero (un
 * ajustement porte sur la periode, jamais sur un modele), heures a zero.
 */
export function scopeRowsToModel(
  rows: PayrollRow[],
  breakdown: CaBreakdown,
  platform: string,
  modelId: string
): PayrollRow[] {
  return rows
    .map((r) => {
      const split = breakdown.splits.get(r.chatterId);
      const platformCa = split?.byPlatform.get(platform) ?? 0;
      const modelCa = split?.byModel.get(modelId) ?? 0;
      if (!split || platformCa <= 0 || modelCa <= 0) return null;
      const frac = modelCa / platformCa;
      const commissionUsd = r.commissionUsd * frac;
      return {
        ...r,
        revenueUsd: r.revenueUsd * frac,
        feeUsd: r.feeUsd * frac,
        netRevenueUsd: r.netRevenueUsd * frac,
        commissionUsd,
        uncoveredRevenueUsd: r.uncoveredRevenueUsd * frac,
        bonusUsd: 0,
        sanctionUsd: 0,
        netUsd: commissionUsd,
        hours: 0,
        usdPerHour: 0,
      };
    })
    .filter((r): r is PayrollRow => r !== null);
}
