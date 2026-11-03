"use client";

import { useState, useTransition } from "react";
import { Sparkles, CheckCircle2, AlertTriangle, XOctagon, AlertCircle, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { runPaieAnalysis, type PaieAnalysisResult } from "./analyse-actions";
import type { PaieVerdictStatus } from "@/lib/paie-analyse";

const STATUS = {
  go: {
    label: "Tu peux lancer la paie",
    icon: CheckCircle2,
    cls: "border-success/40 bg-success/5 text-success",
  },
  verifier: {
    label: "À vérifier avant de verser",
    icon: AlertTriangle,
    cls: "border-warning/40 bg-warning/5 text-warning",
  },
  bloque: {
    label: "À régler avant de verser",
    icon: XOctagon,
    cls: "border-danger/40 bg-danger/5 text-danger",
  },
} satisfies Record<PaieVerdictStatus, { label: string; icon: typeof CheckCircle2; cls: string }>;

/**
 * Analyse IA de la periode : un bouton qui envoie les chiffres deja calcules a
 * DeepSeek et affiche son verdict (go / a verifier / a regler). Consultatif —
 * il ne bloque jamais la cloture, il eclaire la decision.
 */
export function PaieAnalyse({
  periodRange,
  periodLabel,
  platform,
}: {
  periodRange: string;
  periodLabel: string;
  platform?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PaieAnalysisResult | null>(null);

  function analyse() {
    setResult(null);
    startTransition(async () => {
      setResult(await runPaieAnalysis(periodRange, periodLabel, platform));
    });
  }

  const status = result?.status ? STATUS[result.status] : null;
  const StatusIcon = status?.icon;

  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-info via-sky-500 to-accent text-white shadow-[0_2px_10px_rgb(56_189_248/0.5)]">
          <Sparkles size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Étape 2</p>
          <p className="text-sm font-semibold text-foreground">Analyse — puis-je lancer la paie ?</p>
          <p className="mt-0.5 text-xs text-muted">
            Compare ce que chaque chatter a déclaré à ce que l&apos;import Infloww a tracké sur la
            période, et signale les écarts à vérifier avant de verser. Ne calcule
            aucun montant et ne bloque rien — c&apos;est un avis.
          </p>
        </div>
        <Button type="button" disabled={pending} onClick={analyse} className="shrink-0">
          <span className="inline-flex items-center gap-1.5">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {pending ? "Analyse…" : result ? "Relancer" : "Analyser"}
          </span>
        </Button>
      </div>

      {result?.error && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {result.error}
        </p>
      )}

      {status && StatusIcon && (
        <div className="space-y-3">
          <div className={cn("flex items-center gap-2.5 rounded-xl border px-3.5 py-3", status.cls)}>
            <StatusIcon size={20} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold">{status.label}</p>
              <p className="text-xs opacity-90">{result!.summary}</p>
            </div>
          </div>

          {(result!.blockers?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5">
              <p className="text-xs font-semibold text-danger">À régler avant de verser</p>
              <ul className="mt-1.5 space-y-1">
                {result!.blockers!.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                    <XOctagon size={13} className="mt-0.5 shrink-0 text-danger" />
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(result!.points?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-border bg-surface-2/40 px-3.5 py-2.5">
              <p className="text-xs font-semibold text-muted">Points d&apos;attention</p>
              <ul className="mt-1.5 space-y-1.5">
                {result!.points!.map((p, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[11px] text-muted">
            Avis généré par IA à partir des chiffres du CRM. Il t&apos;éclaire, il ne décide pas : tu
            peux clôturer quoi qu&apos;il dise.
          </p>
        </div>
      )}
    </Card>
  );
}
