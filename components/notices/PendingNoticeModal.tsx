"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Ban } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatUsdEn } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { acknowledgeNotice } from "@/app/(chatter)/notices-actions";
import type { PendingNotice } from "@/lib/notices";

const DATE_FMT = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

/**
 * Popup bloquante au chargement de l'espace chatter : un avertissement ou une
 * sanction pas encore vu s'affiche jusqu'a ce qu'il soit ferme, un par un.
 */
export function PendingNoticeModal({ items }: { items: PendingNotice[] }) {
  const [queue, setQueue] = useState(items);
  const [pending, startTransition] = useTransition();

  if (queue.length === 0) return null;

  const current = queue[0]!;
  const isSanction = current.kind === "sanction";

  function close() {
    startTransition(async () => {
      await acknowledgeNotice(current.kind, current.id);
      setQueue((q) => q.slice(1));
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <span
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-2xl",
            isSanction ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"
          )}
        >
          {isSanction ? <Ban size={22} /> : <AlertTriangle size={22} />}
        </span>

        <div>
          <p className="text-base font-semibold text-foreground">
            {isSanction ? "Penalty" : "Warning"}
          </p>
          <p className="mt-0.5 text-xs text-muted">{DATE_FMT.format(new Date(current.createdAt))}</p>

          {isSanction && current.amountUsd !== null && (
            <p className="mt-2 text-2xl font-bold tabular-nums text-danger">
              -{formatUsdEn(current.amountUsd)}
            </p>
          )}

          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">{current.reason}</p>
        </div>

        <Button type="button" onClick={close} disabled={pending} className="w-full">
          {pending
            ? "…"
            : queue.length > 1
              ? `Got it (${queue.length - 1} left)`
              : "Got it"}
        </Button>
      </div>
    </div>
  );
}
