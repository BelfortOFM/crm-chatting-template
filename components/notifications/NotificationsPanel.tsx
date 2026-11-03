"use client";

import { useEffect, useState, useTransition } from "react";
import { Bell, BellOff, Send, Check, AlertCircle, Smartphone } from "lucide-react";
import { saveSubscription, removeSubscription, sendTestNotification } from "@/app/notifications-actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Status = "checking" | "unsupported" | "needs-install" | "denied" | "off" | "on";

/** base64url -> Uint8Array, format attendu par pushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationsPanel({ vapidPublicKey }: { vapidPublicKey: string }) {
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
      setMessage("Cet appareil recevra les notifications.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activation impossible.");
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

      {status === "checking" && <p className="text-xs text-muted">Vérification…</p>}

      {status === "needs-install" && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-xs text-warning">
          <Smartphone size={14} className="mt-0.5 shrink-0" />
          Sur iPhone, les notifications n&apos;existent que dans l&apos;app installée. Ouvre ce site
          dans Safari, puis « Partager → Sur l&apos;écran d&apos;accueil », et reviens ici depuis
          l&apos;icône.
        </p>
      )}

      {status === "unsupported" && (
        <p className="text-xs text-muted">Ce navigateur ne gère pas les notifications push.</p>
      )}

      {status === "denied" && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          Les notifications ont été refusées pour ce site. Il faut les réautoriser dans les
          réglages du navigateur — la page ne peut plus le demander elle-même.
        </p>
      )}

      {(status === "off" || status === "on") && (
        <>
          <p className="text-xs text-muted">
            {status === "on"
              ? "Cet appareil est abonné. Le test passe par le serveur et le service de notification du système : c'est le trajet exact des futurs rappels de shift."
              : "Active les notifications sur cet appareil pour recevoir les rappels."}
          </p>
          <div className="flex flex-wrap gap-2">
            {status === "off" ? (
              <Button type="button" onClick={enable}>
                <span className="inline-flex items-center gap-1.5">
                  <Bell size={15} /> Activer sur cet appareil
                </span>
              </Button>
            ) : (
              <>
                <Button type="button" onClick={test} disabled={pending}>
                  <span className="inline-flex items-center gap-1.5">
                    <Send size={15} /> {pending ? "Envoi…" : "Tester la notification"}
                  </span>
                </Button>
                <Button type="button" variant="ghost" onClick={disable}>
                  <span className="inline-flex items-center gap-1.5">
                    <BellOff size={15} /> Désactiver
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
