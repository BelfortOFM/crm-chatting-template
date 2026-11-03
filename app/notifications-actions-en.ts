"use server";

import { getSessionProfile, getSupabase } from "@/lib/session";
import { sendPushToUser, hasVapidKeys } from "@/lib/push";

export interface SubscribeState {
  error?: string;
  ok?: boolean;
}

/**
 * English copy of notifications-actions.ts, for the chatter-facing
 * ChatterNotificationsPanel. Same logic, English-facing strings only.
 */
export async function saveSubscription(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string
): Promise<SubscribeState> {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Session expired." };

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
    { onConflict: "endpoint" }
  );

  if (error) return { error: error.message };
  return { ok: true };
}

export async function removeSubscription(endpoint: string): Promise<SubscribeState> {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Session expired." };

  const supabase = await getSupabase();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", profile.userId);
  return { ok: true };
}

export interface TestState {
  error?: string;
  message?: string;
}

export async function sendTestNotification(): Promise<TestState> {
  const profile = await getSessionProfile();
  if (!profile) return { error: "Session expired." };
  if (!hasVapidKeys()) return { error: "Notification keys missing on the server." };

  const supabase = await getSupabase();
  const result = await sendPushToUser(supabase, profile.userId, {
    title: "LordAgency Pro",
    body: "Test successful — notifications work on this device.",
    url: "/",
    tag: "test",
  });

  if (result.noDevice) {
    return { error: "No subscribed device. Enable notifications above first." };
  }
  if (result.sent === 0) {
    return {
      error: `Failed to send to ${result.failed} device(s).${result.reason ? ` Service response: ${result.reason}` : ""}`,
    };
  }

  return {
    message:
      result.failed > 0
        ? `Sent to ${result.sent} device(s), failed on ${result.failed}.`
        : `Sent to ${result.sent} device(s) — check your screen.`,
  };
}
