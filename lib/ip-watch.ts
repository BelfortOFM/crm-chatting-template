import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";

interface IpWatchHit {
  id: string;
  reason: string;
}

/**
 * Verifie si l'IP de connexion correspond a une entree de la watchlist
 * anti-fraude de l'agence (fn_ip_watch_hits, migration 20261001000036), et
 * alerte les admins actifs si oui. Appele depuis login() juste apres
 * l'authentification reussie — ne doit jamais la faire echouer : toute
 * erreur est avalee silencieusement, comme logAction() dans lib/audit.ts.
 *
 * Service role necessaire : le client RLS-scope du chatter qui vient de se
 * connecter n'a pas acces a ip_watch (reserve aux agency_admin).
 */
export async function checkIpWatchOnLogin(agencyId: string, chatterId: string, ip: string | null): Promise<void> {
  if (!ip) return;

  try {
    const admin = createAdminClient();

    const { data: hits } = await admin.rpc("fn_ip_watch_hits", { p_agency_id: agencyId, p_ip: ip });
    if (!hits || (hits as IpWatchHit[]).length === 0) return;

    const today = new Date().toISOString().slice(0, 10);

    const [{ data: chatter }, { data: admins }] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", chatterId).maybeSingle(),
      admin.from("profiles").select("id").eq("agency_id", agencyId).eq("role", "agency_admin").eq("active", true),
    ]);

    for (const hit of hits as IpWatchHit[]) {
      // Une ligne par (watch, chatter, jour) : une connexion repetee le meme
      // jour depuis le meme reseau ne reenvoie pas la notification.
      const { error } = await admin
        .from("notification_log")
        .insert({ agency_id: agencyId, kind: "ip_watch.hit", dedupe_key: `ipwatch|${hit.id}|${chatterId}|${today}` });
      if (error) continue;

      for (const a of admins ?? []) {
        await sendPushToUser(admin, a.id as string, {
          title: "IP surveillée détectée",
          body: `${chatter?.full_name ?? "Un chatter"} vient de se connecter depuis un réseau surveillé (${hit.reason}).`,
          url: "/admin/verifications",
          tag: "ip-watch",
        });
      }
    }
  } catch {
    // Ne doit jamais empecher la connexion.
  }
}
