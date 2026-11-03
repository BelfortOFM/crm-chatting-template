import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Envoi des notifications push (Web Push / VAPID).
 *
 * VAPID identifie le serveur emetteur aupres du service de push (Apple,
 * Google). La cle publique part dans le navigateur au moment de
 * l'abonnement, la privee signe chaque envoi et ne quitte jamais le serveur.
 */

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  const subject = process.env.VAPID_SUBJECT;
  // Apple valide ce champ et rejette les domaines inexistants (403
  // BadJwtToken) : pas de repli sur un domaine de production fixe ici,
  // chaque agence doit fournir le sien via VAPID_SUBJECT.
  if (!subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushResult {
  sent: number;
  failed: number;
  noDevice: boolean;
  /** Raison du dernier echec, telle que renvoyee par le service de push. */
  reason?: string;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Notifie tous les appareils d'un utilisateur.
 *
 * Un endpoint qui repond 404 ou 410 correspond a une app desinstallee ou a un
 * abonnement revoque : il est marque en echec plutot que supprime, pour
 * pouvoir distinguer plus tard "jamais abonne" de "ne repond plus".
 */
export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload
): Promise<PushResult> {
  if (!configure()) return { sent: 0, failed: 0, noDevice: true };

  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .is("failed_at", null);

  const subs = (data ?? []) as SubscriptionRow[];
  if (subs.length === 0) return { sent: 0, failed: 0, noDevice: true };

  let sent = 0;
  let failed = 0;
  let reason: string | undefined;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
        sent++;
        await supabase
          .from("push_subscriptions")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", sub.id);
      } catch (error) {
        failed++;
        const err = error as { statusCode?: number; body?: string; message?: string };
        const status = err.statusCode;
        // Sans cette remontee, un refus du service se resumait a "echec sur
        // 1 appareil" : il a fallu interroger Apple a la main pour decouvrir
        // que le sujet VAPID etait en cause.
        reason = [status, (err.body || err.message || "").toString().slice(0, 120)]
          .filter(Boolean)
          .join(" ");
        if (status === 404 || status === 410) {
          await supabase
            .from("push_subscriptions")
            .update({ failed_at: new Date().toISOString() })
            .eq("id", sub.id);
        }
      }
    })
  );

  return { sent, failed, noDevice: false, reason };
}

export function hasVapidKeys(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
