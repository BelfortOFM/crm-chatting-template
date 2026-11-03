"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Send, Check, AlertCircle, Smartphone } from "lucide-react";
import { saveSubscription, removeSubscription, sendTestNotification } from "@/app/notifications-actions-en";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Status = "checking" | "unsupported" | "needs-install" | "denied" | "off" | "on";

/** base64url -> Uint8Array, format attendu par pushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** English copy of NotificationsPanel, for the chatter-facing planning page. */
export function ChatterNotificationsPanel({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (typeof window === "undefined") return;
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

      // Sur iPhone, l'API push n'existe que dans une app installée sur
      // l'écran d'accueil. Dans Safari, elle est purement absente — d'où ce
      // cas distinct, sinon l'utilisateur croit à une panne.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const installed = window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;

      if (!supported) {
        if (!cancelled) setStatus(isIOS && !installed ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }

      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!cancelled) setStatus(sub ? "on" : "off");
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setError(null);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await saveSubscription(
        {
          endpoint: json.endpoint!,
          keys: { p256dh: json.keys!.p256dh!, auth: json.keys!.auth! },
        },
        navigator.userAgent
      );
      if (res.error) {
        setError(res.error);
        return;
      }
      setStatus("on");
      setMessage("This device will receive notifications.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to enable.");
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await removeSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setStatus("off");
    setMessage(null);
  }

  function test() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await sendTestNotification();
      if (res.error) setError(res.error);
      else setMessage(res.message ?? null);
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-info-soft text-info">
          <Bell size={14} />
        </span>
        <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
      </div>

      {status === "checking" && <p className="text-xs text-muted">Checking…</p>}

      {status === "needs-install" && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-xs text-warning">
          <Smartphone size={14} className="mt-0.5 shrink-0" />
          On iPhone, notifications only exist inside the app installed on your home screen. Open
          this site in Safari, then &laquo; Share &rarr; Add to Home Screen &raquo;, and come back
          here from the icon.
        </p>
      )}

      {status === "unsupported" && (
        <p className="text-xs text-muted">This browser doesn't support push notifications.</p>
      )}

      {status === "denied" && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          Notifications were denied for this site. You'll need to re-allow them in your browser
          settings — the page can no longer ask on its own.
        </p>
      )}

      {(status === "off" || status === "on") && (
        <>
          <p className="text-xs text-muted">
            {status === "on"
              ? "This device is subscribed. The test goes through the server and the system's notification service: the exact path future shift reminders will take."
              : "Enable notifications on this device to get shift reminders."}
          </p>
          <div className="flex flex-wrap gap-2">
            {status === "off" ? (
              <Button type="button" onClick={enable}>
                <span className="inline-flex items-center gap-1.5">
                  <Bell size={15} /> Enable on this device
                </span>
              </Button>
            ) : (
              <>
                <Button type="button" onClick={test} disabled={pending}>
                  <span className="inline-flex items-center gap-1.5">
                    <Send size={15} /> {pending ? "Sending…" : "Send a test notification"}
                  </span>
                </Button>
                <Button type="button" variant="ghost" onClick={disable}>
                  <span className="inline-flex items-center gap-1.5">
                    <BellOff size={15} /> Disable
                  </span>
                </Button>
              </>
            )}
          </div>
        </>
      )}

      {message && (
        <p className="flex items-start gap-2 text-xs text-success">
          <Check size={14} className="mt-0.5 shrink-0" />
          {message}
        </p>
      )}
      {error && (
        <p className="flex items-start gap-2 text-xs text-danger">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </Card>
  );
}
