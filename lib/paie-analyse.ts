import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRecap } from "./recap";

/**
 * Analyse IA d'une periode de paie : « puis-je lancer la paie ou non ? ».
 *
 * Regle non negociable : l'IA ne calcule JAMAIS un montant. Tous les chiffres
 * (declare, tracke Infloww, ecarts, taux manquants, CA non rattache)
 * sont produits en dur par buildRecap — deterministes, verifiables. On ne fait
 * que LES DONNER a DeepSeek (moteur choisi pour son cout, cette tache n'etant
 * qu'une lecture de chiffres deja prets), qui les interprete et rend un
 * verdict, exactement comme un humain relirait le recap avant de verser.
 *
 * Le verdict est consultatif : il ne bloque jamais la cloture. L'humain decide.
 */

export type PaieVerdictStatus = "go" | "verifier" | "bloque";

export interface PaieAnalysisResult {
  error?: string;
  /** Etat global : go (rien a signaler) / verifier (points d'attention) / bloque (a regler avant). */
  status?: PaieVerdictStatus;
  /** Une phrase de synthese. */
  summary?: string;
  /** Points d'attention et anomalies expliques, du plus important au moins. */
  points?: string[];
  /** Ce qui devrait etre regle avant de verser (peut etre vide). */
  blockers?: string[];
  /** Rappel du total a verser, tel que calcule par le CRM (jamais par l'IA). */
  totalUsd?: number;
}

/** Chiffres deterministes envoyes a l'IA — aucun calcul cote modele. */
interface AnalysisFacts {
  periode: string;
  total_a_verser_usd: number;
  sources_interrogees: { infloww: boolean };
  ca_infloww_non_rattache_usd: number;
  modeles_non_relies: { nom: string; plateforme: string; source: string }[];
  chatteurs: {
    nom: string;
    declare_usd: number;
    declare_verifiable_usd: number;
    tracke_infloww_usd: number | null;
    ecart_verifiable_usd: number | null;
    part_non_verifiable_usd: number;
    raisons_non_verifiable: string[];
    a_un_taux_de_commission: boolean;
    ca_sans_taux_usd: number;
    a_verser_usd: number;
  }[];
}

/**
 * Rassemble les faits deterministes de la periode, prets a etre juges.
 *
 * S'appuie entierement sur buildRecap : declared vs tracke par chatteur, ecart
 * limite a la part verifiable, CA Infloww non rattache, modeles non relies,
 * taux de commission manquant (hasRate). Rien n'est recalcule ici.
 */
async function gatherFacts(
  supabase: SupabaseClient,
  agencyId: string,
  periodStart: string,
  periodEnd: string,
  periodLabel: string,
  platform?: string | null
): Promise<AnalysisFacts> {
  const recap = await buildRecap(supabase, agencyId, periodStart, periodEnd, platform);
  const payable = recap.rows.filter((r) => r.totalUsd !== 0 || r.declaredUsd > 0);

  return {
    periode: periodLabel,
    total_a_verser_usd: round2(recap.totalUsd),
    sources_interrogees: recap.sources,
    ca_infloww_non_rattache_usd: round2(recap.unassignedInflowwUsd),
    modeles_non_relies: recap.unconnectedModels.map((m) => ({
      nom: m.name,
      plateforme: m.platform,
      source: m.source,
    })),
    chatteurs: payable.map((r) => ({
      nom: r.fullName,
      declare_usd: round2(r.declaredUsd),
      declare_verifiable_usd: round2(r.declaredCheckableUsd),
      tracke_infloww_usd: r.trackedInflowwUsd === null ? null : round2(r.trackedInflowwUsd),
      ecart_verifiable_usd: r.gapUsd === null ? null : round2(r.gapUsd),
      part_non_verifiable_usd: round2(r.declaredUncheckableUsd),
      raisons_non_verifiable: r.uncheckableReasons,
      a_un_taux_de_commission: r.hasRate,
      ca_sans_taux_usd: round2(r.uncoveredRevenueUsd),
      a_verser_usd: round2(r.totalUsd),
    })),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Extrait le verdict JSON de la reponse, tolerant aux enrobages (fences
 * markdown, texte parasite). On ne fait pas confiance a un JSON parfait :
 * mieux vaut un parsing defensif qu'une erreur brute a l'ecran.
 */
function parseVerdict(
  text: string
): { status: PaieVerdictStatus; summary: string; points: string[]; blockers: string[] } | null {
  // Isole le premier objet { ... } (retire d'eventuelles ```json ... ```).
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;

  const o = raw as Record<string, unknown>;
  const status = o.status;
  if (status !== "go" && status !== "verifier" && status !== "bloque") return null;

  const toStrings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  return {
    status,
    summary: typeof o.summary === "string" ? o.summary : "",
    points: toStrings(o.points),
    blockers: toStrings(o.blockers),
  };
}

const SYSTEM_PROMPT = `Tu es l'assistant paie d'une agence de chatting (OnlyFans). On te donne les CHIFFRES DÉJÀ CALCULÉS d'une période, et tu dois dire au gérant s'il peut lancer la paie ou non.

Ton rôle central : repérer les écarts entre ce que chaque chatteur a DÉCLARÉ et ce que l'import Infloww a TRACKÉ, et dire lesquels méritent d'être vérifiés avant de verser.

Règles absolues :
- Tu ne recalcules JAMAIS un montant. Les chiffres fournis font foi. Tu ne fais qu'interpréter.
- La paie se calcule sur le DÉCLARÉ. Le tracké (Infloww) sert au contrôle, il ne change pas ce qui est dû.
- L'import Infloww est déposé à la main par l'admin (pas d'API directe) : une période mal choisie, un fichier partiel ou un employé pas encore relié produisent des écarts qui n'ont rien à voir avec le chatteur. Avant de pointer un chatteur du doigt, élimine ces causes côté import (regarde ca_infloww_non_rattache_usd et modeles_non_relies).
- Un écart déclaré/tracké n'est PAS forcément une fraude. Contexte métier crucial : les chatteurs déclarent TOUT ensemble, TIPS INCLUS, dans un seul chiffre. Or Infloww n'attribue pas les tips — ils tombent dans le "CA Infloww non rattaché". Donc un chatteur peut paraître avoir "sur-déclaré" par rapport à son tracké Infloww, alors que ce sont juste ses tips non rattachés. Vérifie toujours si le CA non rattaché couvre l'écart total de l'équipe avant de crier au loup.
- Sois direct et concret, en français, comme un comptable qui parle à son patron. Pas de jargon.

Tu dois répondre avec un statut :
- "go" : rien de bloquant, les comptes se tiennent, on peut verser.
- "verifier" : ça peut se verser mais il y a des points à connaître (petits écarts, CA non tracké, etc.).
- "bloque" : quelque chose doit être réglé avant (ex : un chatteur a du CA mais AUCUN taux de commission → il serait payé 0 à tort ; un écart énorme et inexpliqué même après avoir tenu compte des tips non rattachés).

Base ton jugement sur les faits fournis, pas sur des suppositions.

FORMAT DE RÉPONSE — réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après, sans balises de code, de la forme exacte :
{"status": "go|verifier|bloque", "summary": "une phrase de synthèse", "points": ["point d'attention 1", "..."], "blockers": ["à régler avant de verser", "..."]}
"points" et "blockers" sont des tableaux de chaînes (vides si rien). Rien d'autre que ce JSON.`;

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

/**
 * Analyse la periode et rend un verdict. L'appel DeepSeek ne recoit que des
 * chiffres deja calcules ; il ne produit qu'un jugement structure.
 */
export async function analysePaiePeriod(
  supabase: SupabaseClient,
  agencyId: string,
  periodStart: string,
  periodEnd: string,
  periodLabel: string,
  platform?: string | null
): Promise<PaieAnalysisResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    return {
      error:
        "L'analyse IA n'est pas configurée : ajoute une clé API DeepSeek (DEEPSEEK_API_KEY) côté serveur.",
    };
  }

  const facts = await gatherFacts(supabase, agencyId, periodStart, periodEnd, periodLabel, platform);

  if (facts.chatteurs.length === 0) {
    return {
      status: "verifier",
      summary: "Aucun chiffre déclaré ni montant à verser sur cette période.",
      points: [],
      blockers: [],
      totalUsd: 0,
    };
  }

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              "Voici les chiffres déjà calculés de la période. Dis-moi si je peux lancer la paie.\n\n```json\n" +
              JSON.stringify(facts, null, 2) +
              "\n```",
          },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (res.status === 401) return { error: "Clé API DeepSeek invalide — vérifie DEEPSEEK_API_KEY." };
    if (res.status === 429) return { error: "Trop de requêtes IA d'un coup — réessaie dans un instant." };
    if (!res.ok) return { error: `Analyse IA indisponible (HTTP ${res.status}).` };

    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";

    const parsed = parseVerdict(text);
    if (!parsed) return { error: "Réponse IA illisible — réessaie." };

    return {
      status: parsed.status,
      summary: parsed.summary,
      points: parsed.points,
      blockers: parsed.blockers,
      totalUsd: facts.total_a_verser_usd,
    };
  } catch (e) {
    return { error: e instanceof Error ? `Analyse IA indisponible : ${e.message}` : "Analyse IA indisponible." };
  }
}
