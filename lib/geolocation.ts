import "server-only";

/**
 * Localisation cote serveur pour la verification d'identite : lecture de
 * l'IP de la requete, et estimation ville/pays quand le navigateur n'a pas
 * fourni de position GPS (refus, timeout, appareil sans capteur).
 */

/**
 * L'IP publique du visiteur n'est jamais dans `request.ip` derriere le tunnel
 * Cloudflare : cf-connecting-ip est le seul en-tete fiable ici (pose par
 * l'edge Cloudflare, pas falsifiable depuis le navigateur). x-forwarded-for
 * reste en repli pour un acces hors tunnel (ex: `next dev` en local).
 */
export function clientIp(h: Headers): string | null {
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export interface IpLocation {
  lat: number | null;
  lon: number | null;
  city: string | null;
  country: string | null;
}

/**
 * ip-api.com, palier gratuit : pas de cle, HTTP uniquement (appel
 * serveur-a-serveur, aucun contenu mixte cote navigateur). Echec silencieux —
 * une localisation manquante ne doit jamais bloquer l'envoi du dossier.
 */
export async function lookupIpLocation(ip: string | null): Promise<IpLocation | null> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return null;

  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city,lat,lon`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "success") return null;
    return {
      lat: typeof data.lat === "number" ? data.lat : null,
      lon: typeof data.lon === "number" ? data.lon : null,
      city: data.city || null,
      country: data.country || null,
    };
  } catch {
    return null;
  }
}
