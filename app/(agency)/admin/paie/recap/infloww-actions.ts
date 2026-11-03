"use server";

import { revalidatePath } from "next/cache";
import { requireAgencyAdmin } from "@/lib/require-role";
import { parseInflowwExport, normalizeInflowwName, type InflowwEmployeeRow } from "@/lib/infloww";

/**
 * Import de l'export Infloww d'une periode, et rattachement des lignes que
 * l'auto-liaison n'a pas su relier.
 *
 * L'agence n'ayant pas droit a la cle API Infloww, l'admin genere l'export
 * "statistiques par employe", le recoit par email et le depose ici. On en
 * garde le CA brut par chatteur, compare ensuite au declare.
 */

export interface InflowwUnmatched {
  name: string;
  email: string | null;
  salesUsd: number;
}

export interface InflowwImportResult {
  error?: string;
  ok?: boolean;
  format?: "aggregated" | "detail";
  periodLabel?: string | null;
  imported?: number;
  matched?: number;
  unmatched?: InflowwUnmatched[];
  totalUsd?: number;
  /**
   * Le fichier deborde-t-il de la periode selectionnee ?
   *
   * Un import partiel (8-13 dans P2) est voulu — l'admin compare en cours de
   * periode. Un debordement (le fichier va avant le debut ou apres la fin de la
   * periode) rattacherait a tort des ventes d'une autre periode, on le signale
   * sans bloquer.
   */
  spillWarning?: string;
}

export async function importInfloww(
  periodRange: string,
  formData: FormData
): Promise<InflowwImportResult> {
  const { supabase, user, profile } = await requireAgencyAdmin();

  const [periodStart, periodEnd] = periodRange.split("|");
  if (!periodStart || !periodEnd) return { error: "Période invalide." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Aucun fichier reçu." };
  if (file.size > 5_000_000) return { error: "Fichier trop volumineux (max 5 Mo)." };

  const parsed = parseInflowwExport(Buffer.from(await file.arrayBuffer()));
  if (parsed.format === "unknown" || parsed.rows.length === 0) {
    return {
      error:
        "Fichier non reconnu. Dépose l'export Infloww (.xlsx) des statistiques par employé.",
    };
  }

  const { data: chatters } = await supabase
    .from("profiles")
    .select("id, full_name, infloww_email")
    .eq("agency_id", profile.agency_id)
    .eq("role", "chatter");

  // Deux voies de rapprochement : l'email deja lie (stable), sinon le prenom
  // normalise mais SEULEMENT s'il ne designe qu'un seul chatteur — deux
  // "Arthur" rendraient le rapprochement par prenom ambigu, on prefere alors
  // laisser l'admin trancher que de risquer une attribution fausse.
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  const nameCount = new Map<string, number>();
  for (const c of (chatters ?? []) as { id: string; full_name: string | null; infloww_email: string | null }[]) {
    if (c.infloww_email) byEmail.set(c.infloww_email.toLowerCase(), c.id);
    const key = normalizeInflowwName(c.full_name ?? "");
    if (key) {
      nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
      byName.set(key, c.id);
    }
  }

  const resolve = (row: InflowwEmployeeRow): string | null => {
    if (row.email && byEmail.has(row.email.toLowerCase())) return byEmail.get(row.email.toLowerCase())!;
    const key = normalizeInflowwName(row.name);
    if (key && nameCount.get(key) === 1) return byName.get(key) ?? null;
    return null;
  };

  // Remplacement atomique de la periode : on efface puis on reinsere, pour
  // qu'un import corrige (une ligne retiree chez Infloww) ne laisse rien
  // d'obsolete derriere lui.
  await supabase
    .from("infloww_period_stats")
    .delete()
    .eq("agency_id", profile.agency_id)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd);

  const toInsert = parsed.rows.map((r) => ({
    agency_id: profile.agency_id,
    period_start: periodStart,
    period_end: periodEnd,
    infloww_email: r.email,
    infloww_name: r.name,
    chatter_id: resolve(r),
    sales_usd: r.salesUsd,
    ppv_usd: r.ppvUsd,
    tips_usd: r.tipsUsd,
    imported_by: user.id,
  }));

  const { error } = await supabase.from("infloww_period_stats").insert(toInsert);
  if (error) return { error: error.message };

  const unmatched = parsed.rows
    .filter((r) => !resolve(r) && r.salesUsd > 0)
    .map((r) => ({ name: r.name, email: r.email, salesUsd: r.salesUsd }));

  // Debordement : le fichier sort-il de la periode ? Partiel dedans = ok.
  const fmt = (d: string) => {
    const [, m, day] = d.split("-");
    return `${Number(day)}/${Number(m)}`;
  };
  let spillWarning: string | undefined;
  const { coverageStart: cs, coverageEnd: ce } = parsed;
  if ((cs && cs < periodStart) || (ce && ce > periodEnd)) {
    spillWarning =
      `Le fichier couvre le ${fmt(cs ?? periodStart)}–${fmt(ce ?? periodEnd)}, ` +
      `mais tu es sur la période ${fmt(periodStart)}–${fmt(periodEnd)}. ` +
      `Les ventes hors de cette période sont comptées ici à tort — ré-exporte avec les bonnes dates.`;
  }

  revalidatePath("/admin/paie/recap");
  revalidatePath("/admin/paie");

  return {
    ok: true,
    format: parsed.format as "aggregated" | "detail",
    periodLabel: parsed.periodLabel,
    imported: toInsert.length,
    matched: toInsert.filter((r) => r.chatter_id).length,
    unmatched,
    totalUsd: Math.round(parsed.rows.reduce((s, r) => s + r.salesUsd, 0) * 100) / 100,
    spillWarning,
  };
}

export interface InflowwLinkState {
  error?: string;
  ok?: boolean;
}

/**
 * Relie une ligne Infloww non reconnue a un chatteur.
 *
 * On enregistre l'email cote profil (mapping stable, reutilise aux prochains
 * imports) ET on rattache immediatement les lignes de la periode courante. Sans
 * email dans l'export, on retombe sur le nom Infloww exact.
 */
export async function linkInflowwEmployee(
  periodRange: string,
  email: string | null,
  name: string,
  chatterId: string
): Promise<InflowwLinkState> {
  const { supabase, profile } = await requireAgencyAdmin();

  const [periodStart, periodEnd] = periodRange.split("|");
  if (!periodStart || !periodEnd) return { error: "Période invalide." };
  if (!chatterId) return { error: "Choisis un chatteur." };

  if (email) {
    const { error: e1 } = await supabase
      .from("profiles")
      .update({ infloww_email: email })
      .eq("id", chatterId)
      .eq("agency_id", profile.agency_id);
    if (e1) return { error: e1.message };
  }

  // Rattacher les lignes de la periode : par email si on l'a, sinon par le nom
  // Infloww exact de cette ligne.
  let q = supabase
    .from("infloww_period_stats")
    .update({ chatter_id: chatterId })
    .eq("agency_id", profile.agency_id)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd);
  q = email ? q.eq("infloww_email", email) : q.eq("infloww_name", name);

  const { error: e2 } = await q;
  if (e2) return { error: e2.message };

  revalidatePath("/admin/paie/recap");
  revalidatePath("/admin/paie");
  return { ok: true };
}
