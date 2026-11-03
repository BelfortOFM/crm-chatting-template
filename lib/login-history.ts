import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientIp } from "@/lib/geolocation";

/** Jamais stockes : ce sont des secrets de session, pas des infos sur la personne. */
const EXCLUDED_HEADERS = new Set(["cookie", "authorization"]);

/**
 * Enregistre une connexion avec le maximum d'infos capturables passivement —
 * tous les en-tetes HTTP de la requete (sauf cookie/authorization), pas
 * seulement IP/user-agent/langue. Objectif explicite : matiere maximale pour
 * une investigation a posteriori (incident Camo, faux chatter avec pieces
 * d'identite falsifiees), pas de blocage en temps reel. Pas de
 * fingerprinting actif cote navigateur pour autant — uniquement ce que le
 * navigateur envoie deja de lui-meme.
 *
 * Jamais bloquant : comme checkIpWatchOnLogin (lib/ip-watch.ts), toute
 * erreur est avalee, une panne d'ecriture du journal ne doit jamais
 * empecher la connexion.
 */
export async function recordLogin(agencyId: string, userId: string, h: Headers): Promise<void> {
  try {
    const headers: Record<string, string> = {};
    for (const [key, value] of h.entries()) {
      if (!EXCLUDED_HEADERS.has(key.toLowerCase())) headers[key] = value;
    }

    const admin = createAdminClient();
    await admin.from("login_history").insert({
      agency_id: agencyId,
      user_id: userId,
      ip: clientIp(h),
      user_agent: h.get("user-agent"),
      accept_language: h.get("accept-language"),
      headers,
    });
  } catch {
    // Ignore volontairement.
  }
}
