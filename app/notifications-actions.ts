"use server";

import { getSessionProfile, getSupabase } from "@/lib/session";
import { sendPushToUser, hasVapidKeys } from "@/lib/push";

export interface SubscribeState {
  error?: string;
  ok?: boolean;
}

/** Enregistre l'appareil courant pour recevoir les notifications. */
export async function saveSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string
): Promise<SubscribeState> {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Session expirée." };

  const supabase = await getSupabase();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: profile.userId,
      agency_id: profile.agencyId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent.slice(0, 300),
      failed_at: null,
    },
    // Le même appareil qui se réabonne ne doit pas créer un doublon : son
    // endpoint est stable tant que l'app n'est pas réinstallée.
    { onConflict: "endpoint" }
  );

  if (error) return { error: error.message };
  return { ok: true };
}

export async function removeSubscription(endpoint: string): Promise<SubscribeState> {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Session expirée." };

  const supabase = await getSupabase();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", profile.userId);
  return { ok: true };
}

export interface TestState {
  error?: string;
  message?: string;
}

/**
 * Envoie une notification de test a soi-meme.
 *
 * Elle part par le meme chemin que les futurs rappels de shift — serveur,
 * service de push du systeme, appareil — et non par un appel local dans la
 * page : c'est le seul moyen de verifier que la chaine complete fonctionne,
 * app fermee comprise.
 */
export async function sendTestNotification(): Promise<TestState> {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Session expirée." };
  if (!hasVapidKeys()) return { error: "Clés de notification absentes côté serveur." };

  const supabase = await getSupabase();
  const result = await sendPushToUser(supabase, profile.userId, {
    title: "CRM Chatting",
    body: "Test réussi — les notifications fonctionnent sur cet appareil.",
    url: "/",
    tag: "test",
  });

  if (result.noDevice) {
    return { error: "Aucun appareil abonné. Active d'abord les notifications ci-dessus." };
  }
  if (result.sent === 0) {
    return {
      error: `Échec de l'envoi sur ${result.failed} appareil(s).${result.reason ? ` Réponse du service : ${result.reason}` : ""}`,
    };
  }

  return {
    message:
      result.failed > 0
        ? `Envoyée sur ${result.sent} appareil(s), échec sur ${result.failed}.`
        : `Envoyée sur ${result.sent} appareil(s) — vérifie ton écran.`,
  };
}
