"use client";

import { useState, useTransition } from "react";
import { Lock, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";
import { closePeriod, reopenPayout } from "./actions";
import { type PaiePlatform } from "@/lib/paie-platforms";
import { Button } from "@/components/ui/Button";

export function ClosePeriodButton({
  periodStart,
  periodEnd,
  platform,
  unpaidCount,
}: {
  periodStart: string;
  periodEnd: string;
  platform: PaiePlatform;
  unpaidCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ error?: string; closed?: number } | null>(null);

  if (unpaidCount === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-success/10 px-3.5 py-2.5 text-xs font-semibold text-success">
        <CheckCircle2 size={14} /> Période soldée
      </span>
    );
  }

  function run() {
    setResult(null);
    startTransition(async () => {
      setResult(await closePeriod(periodStart, periodEnd, platform));
      setConfirming(false);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {confirming ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-xs text-muted">
            Figer {unpaidCount} versement{unpaidCount > 1 ? "s" : ""} ?
          </span>
          <Button type="button" onClick={run} disabled={pending} className="!py-2 text-xs">
            {pending ? "Clôture…" : "Confirmer"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="!py-2 text-xs"
          >
            Annuler
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={() => setConfirming(true)} className="shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <Lock size={14} /> Clôturer la paie
          </span>
        </Button>
      )}

      {result?.error && (
        <p className="flex items-center gap-1.5 text-xs text-danger">
          <AlertCircle size={13} /> {result.error}
        </p>
      )}
      {result?.closed ? (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 size={13} /> {result.closed} versement{result.closed > 1 ? "s" : ""} figé
          {result.closed > 1 ? "s" : ""}
        </p>
      ) : null}
    </div>
  );
}

export function ReopenButton({
  chatterId,
  periodStart,
  periodEnd,
  platform,
}: {
  chatterId: string;
  periodStart: string;
  periodEnd: string;
  platform: PaiePlatform;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label="Rouvrir ce versement"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <RotateCcw size={14} />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => {
        await reopenPayout(chatterId, periodStart, periodEnd, platform);
        setConfirming(false);
      })}
      className="rounded-lg bg-danger/10 px-2.5 py-2 text-xs font-semibold text-danger transition-colors hover:bg-danger/20"
    >
      {pending ? "…" : "Rouvrir ?"}
    </button>
  );
}
