import { inflateRawSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Import des statistiques Infloww (OnlyFans) depuis l'export XLSX de l'agence.
 *
 * Le compte Infloww de l'agence n'a pas droit a la cle API officielle. On se
 * rabat donc sur l'export "statistiques par employe" qu'Infloww envoie par
 * email : l'admin le depose dans le CRM, on en tire le CA brut par chatteur
 * pour le comparer au declare.
 *
 * On lit le XLSX a la main plutot que d'ajouter une dependance : l'export
 * n'utilise que des chaines "inlineStr" et un format stable (c'est Infloww qui
 * le produit), un mini-lecteur zip + zlib suffit et garde le projet lean.
 */

/* --- Lecture XLSX minimale (zip + inflate, sans dependance) -------------- */

/**
 * Extrait une entree du zip par son nom, ou null si absente.
 *
 * On passe par le REPERTOIRE CENTRAL et non par les en-tetes locaux : les
 * exports Infloww utilisent un data descriptor (bit 3 du flag), qui laisse la
 * taille compressee a zero dans l'en-tete local. Le repertoire central, lui,
 * porte toujours la taille reelle et l'offset de l'en-tete local.
 */
function readZipEntry(buf: Buffer, name: string): Buffer | null {
  const target = Buffer.from(name, "utf8");

  // 1. Localiser l'End Of Central Directory (signature PK\x05\x06), depuis la
  //    fin — le commentaire de fin d'archive fait au plus 65535 octets.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  let off = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);

  // 2. Parcourir les entrees du repertoire central (signature PK\x01\x02).
  for (let n = 0; n < count; n++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const entryName = buf.subarray(off + 46, off + 46 + nameLen);

    if (entryName.equals(target)) {
      // 3. L'en-tete local donne la longueur reelle de ses propres champs
      //    nom/extra, qui peut differer de celle du repertoire central.
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const comp = buf.subarray(dataStart, dataStart + compSize);
      return method === 0 ? Buffer.from(comp) : inflateRawSync(comp);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Rend chaque ligne de la feuille sous forme de tableau de cellules texte. */
function parseSheet(xml: string): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)) {
      const inner = cellMatch[1];
      const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      const v = inner.match(/<v>([\s\S]*?)<\/v>/);
      cells.push(unescapeXml(t ? t[1] : v ? v[1] : ""));
    }
    rows.push(cells);
  }
  return rows;
}

function money(s: string): number {
  const n = Number((s || "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/* --- Parsing de l'export --------------------------------------------------- */

/** Une ligne de l'export agrege : le CA brut d'un chatteur sur la periode. */
export interface InflowwEmployeeRow {
  name: string;
  email: string | null;
  creators: string;
  salesUsd: number;
  ppvUsd: number;
  tipsUsd: number;
}

export interface InflowwParseResult {
  format: "aggregated" | "detail" | "unknown";
  /** Bornes lues dans le fichier ("2026-08-24 00:00:00 - 2026-08-30 23:59:59"). */
  periodLabel: string | null;
  /**
   * Plage de dates reellement couverte par le fichier (AAAA-MM-JJ), pour
   * comparer a la periode selectionnee : un import partiel (8-13 dans P2) est
   * normal, un debordement (6-15 hors P2) doit alerter.
   */
  coverageStart: string | null;
  coverageEnd: string | null;
  rows: InflowwEmployeeRow[];
}

/** Premiere date AAAA-MM-JJ trouvee dans une chaine, ou null. */
function firstDate(s: string): string | null {
  return s.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

const COL = {
  aggPeriod: "Date/Time Europe/Brussels",
  aggName: "Employees",
  aggEmail: "Email",
  aggCreators: "Creators",
  aggSales: "Sales",
  aggPpv: "PPV sales",
  aggTips: "Tips",
  detDate: "Date & time Europe/Brussels",
  detName: "Employee",
  detEmail: "Email",
  detCreator: "Creator",
  detGross: "Gross revenue",
};

/**
 * Lit un export Infloww. On privilegie le format AGREGE (une ligne par
 * chatteur, colonne "Sales") qui donne directement le CA de periode. Le format
 * DETAIL (une ligne par vente) est aussi accepte, agrege par chatteur.
 */
export function parseInflowwExport(buf: Buffer): InflowwParseResult {
  const empty = { format: "unknown" as const, periodLabel: null, coverageStart: null, coverageEnd: null, rows: [] };
  const sheet = readZipEntry(buf, "xl/worksheets/sheet1.xml");
  if (!sheet) return empty;

  const table = parseSheet(sheet.toString("utf8"));
  if (table.length < 2) return empty;

  const header = table[0]!;
  const idx = (label: string) => header.indexOf(label);
  const at = (row: string[], label: string) => {
    const i = idx(label);
    return i >= 0 && i < row.length ? row[i]! : "";
  };
  const nonEmpty = table.slice(1).filter((r) => r.some((c) => c.trim() !== ""));

  if (idx(COL.aggSales) >= 0 && idx(COL.aggName) >= 0) {
    // Le libelle de periode "2026-08-24 00:00:00 - 2026-08-30 23:59:59" porte
    // les deux bornes : on en tire directement la couverture.
    const label = nonEmpty[0] ? at(nonEmpty[0], COL.aggPeriod) : "";
    const dates = label.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    return {
      format: "aggregated",
      periodLabel: label || null,
      coverageStart: dates[0] ?? null,
      coverageEnd: dates[dates.length - 1] ?? null,
      rows: nonEmpty.map((r) => ({
        name: at(r, COL.aggName).trim(),
        email: at(r, COL.aggEmail).trim() || null,
        creators: at(r, COL.aggCreators).trim(),
        salesUsd: money(at(r, COL.aggSales)),
        ppvUsd: money(at(r, COL.aggPpv)),
        tipsUsd: money(at(r, COL.aggTips)),
      })),
    };
  }

  if (idx(COL.detGross) >= 0 && idx(COL.detName) >= 0) {
    // Agregation par (nom, email) : le detail donne une ligne par vente.
    const byKey = new Map<string, InflowwEmployeeRow>();
    let minDate: string | null = null;
    let maxDate: string | null = null;
    for (const r of nonEmpty) {
      const name = at(r, COL.detName).trim();
      const email = at(r, COL.detEmail).trim() || null;
      const key = (email ?? name).toLowerCase();
      const cur = byKey.get(key) ?? { name, email, creators: "", salesUsd: 0, ppvUsd: 0, tipsUsd: 0 };
      cur.salesUsd = Math.round((cur.salesUsd + money(at(r, COL.detGross))) * 100) / 100;
      const creator = at(r, COL.detCreator).trim();
      if (creator && !cur.creators.includes(creator))
        cur.creators = cur.creators ? `${cur.creators},${creator}` : creator;
      byKey.set(key, cur);
      // Couverture : min/max des dates de vente.
      const d = firstDate(at(r, COL.detDate));
      if (d) {
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      }
    }
    return {
      format: "detail",
      periodLabel: minDate && maxDate ? `${minDate} → ${maxDate}` : null,
      coverageStart: minDate,
      coverageEnd: maxDate,
      rows: [...byKey.values()],
    };
  }

  return empty;
}

/* --- Rapprochement avec nos chatteurs ------------------------------------- */

/**
 * Normalise un nom Infloww pour le rapprochement de secours (quand l'email est
 * absent). Les noms y portent souvent le creneau (ex. "Prenom 15H 21H",
 * "prenom-9h-15h") : on retire tout ce qui ressemble a une heure et on garde
 * le premier mot, en minuscules sans accents.
 */
export function normalizeInflowwName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\d{1,2}\s*h(\s*\d{2})?/g, " ") // 15h, 15h21, 9 h 15
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean)[0] ?? "";
}

export interface InflowwStat {
  salesUsd: number;
  ppvUsd: number;
  tipsUsd: number;
}

export interface InflowwPeriodStats {
  /** CA importe indexe par chatter_id (lignes rattachees seulement). */
  byChatter: Map<string, InflowwStat>;
  /**
   * CA importe qu'Infloww n'a rattache a aucun employe, en $.
   *
   * Ce montant ne pese sur l'ecart de personne (on ne peut l'attribuer), mais
   * il ne doit pas disparaitre : c'est souvent le signe d'un chatteur mal
   * configure cote Infloww, ou d'une vente a reattribuer la-bas.
   */
  unassignedUsd: number;
}

/**
 * CA Infloww importe pour une periode : rattache par chatteur, et le total non
 * assigne mis a part.
 *
 * Une ligne non reliee (chatter_id nul) ne pese pas dans le tracke d'un
 * chatteur — elle attend son mapping, ou reste non assignee cote Infloww — mais
 * on en garde la somme pour la rendre visible.
 */
export async function fetchInflowwByChatter(
  supabase: SupabaseClient,
  agencyId: string,
  periodStart: string,
  periodEnd: string
): Promise<InflowwPeriodStats> {
  const { data } = await supabase
    .from("infloww_period_stats")
    .select("chatter_id, sales_usd, ppv_usd, tips_usd")
    .eq("agency_id", agencyId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd);

  const byChatter = new Map<string, InflowwStat>();
  let unassignedUsd = 0;
  for (const r of (data ?? []) as {
    chatter_id: string | null;
    sales_usd: number | string;
    ppv_usd: number | string;
    tips_usd: number | string;
  }[]) {
    if (!r.chatter_id) {
      unassignedUsd += Number(r.sales_usd);
      continue;
    }
    const cur = byChatter.get(r.chatter_id) ?? { salesUsd: 0, ppvUsd: 0, tipsUsd: 0 };
    cur.salesUsd += Number(r.sales_usd);
    cur.ppvUsd += Number(r.ppv_usd);
    cur.tipsUsd += Number(r.tips_usd);
    byChatter.set(r.chatter_id, cur);
  }
  return { byChatter, unassignedUsd: Math.round(unassignedUsd * 100) / 100 };
}

/** True si l'import d'une periode existe (au moins une ligne). */
export async function hasInflowwImport(
  supabase: SupabaseClient,
  agencyId: string,
  periodStart: string,
  periodEnd: string
): Promise<boolean> {
  const { count } = await supabase
    .from("infloww_period_stats")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd);
  return (count ?? 0) > 0;
}

/** Plateformes reellement couvertes par l'export Infloww de l'agence. */
export const INFLOWW_COVERED_PLATFORMS = new Set(["onlyfans"]);
