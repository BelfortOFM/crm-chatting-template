"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ShieldQuestion,
  Zap,
} from "lucide-react";
import { addBonus, addSanction, deleteBonus, deleteSanction } from "../../chatters/[id]/actions";
import { applyPayrollRules } from "../actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatUsd } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { RecapRow } from "@/lib/recap";
import type { PaiePlatform } from "@/lib/paie-platforms";

/** Écart en deçà duquel déclaré et tracké sont considérés concordants. */
const TOLERANCE_USD = 1;

type ApplyRulesResult = Awaited<ReturnType<typeof applyPayrollRules>>;

export function RecapTable({
  rows,
  platform,
  periodStart,
  periodEnd,
  periodRange,
}: {
  rows: RecapRow[];
  platform: PaiePlatform | null;
  periodStart: string;
  periodEnd: string;
  periodRange: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [rules, setRules] = useState<ApplyRulesResult | null>(null);

  const total = rows.reduce((s, r) => s + r.totalUsd, 0);

  function applyRules() {
    if (!platform) return;
    setRules(null);
    startTransition(async () => setRules(await applyPayrollRules(platform, periodStart, periodEnd)));
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map((r) => {
          const isOpen = open === r.chatterId;
          const gap = r.gapUsd;
          const matches = gap !== null && Math.abs(gap) < TOLERANCE_USD;

          return (
            <div
              key={r.chatterId}
              className={cn(
                "overflow-hidden rounded-2xl border bg-surface transition-colors",
                isOpen ? "border-accent/40" : "border-border"
              )}
            >
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : r.chatterId)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {r.fullName}
                    {r.paidAt && (
                      <span className="ml-1.5 rounded bg-success/15 px-1.5 py-0.5 text-[10px] uppercase text-success">
                        soldé
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatUsd(r.declaredUsd)} déclaré · commission {r.effectiveRate}%
                    {gap === null ? (
                      <span className="text-muted"> · aucun suivi</span>
                    ) : matches ? (
                      <span className="text-success"> · concorde</span>
                    ) : (
                      <span className="text-warning">
                        {" "}
                        · écart {gap > 0 ? "+" : ""}
                        {formatUsd(gap)}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="tnum font-bold text-accent">{formatUsd(r.totalUsd)}</span>
                  <ChevronDown
                    size={16}
                    className={cn("text-muted transition-transform", isOpen && "rotate-180")}
                  />
                </div>
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-border px-4 py-4">
                  {/* Comparaison, en distinguant ce qui est verifiable. */}
                  <div className="space-y-1.5 text-xs">
                    <Line label="Déclaré, part vérifiable" value={formatUsd(r.declaredCheckableUsd)} />
                    {r.trackedInflowwUsd !== null && (
                      <Line label="Tracké par Infloww (OnlyFans)" value={formatUsd(r.trackedInflowwUsd)} muted />
                    )}
                    {gap !== null && (
                      <Line
                        label="Écart sur la part vérifiable"
                        value={`${gap > 0 ? "+" : ""}${formatUsd(gap)}`}
                        tone={matches ? "success" : "warning"}
                      />
                    )}
                    {r.declaredUncheckableUsd > 0 && (
                      <Line
                        label="Déclaré non vérifiable"
                        value={formatUsd(r.declaredUncheckableUsd)}
                        tone="warning"
                      />
                    )}
                  </div>

                  {gap !== null && !matches && (
                    <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
                      <ShieldQuestion size={15} className="mt-0.5 shrink-0" />
                      <span>
                        {/* Un tracké à zéro n'accuse personne : la source peut
                            simplement ne rien couvrir sur cette période. */}
                        {gap > 0 && r.trackedUsd === 0
                          ? `Aucune vente tracée sur cette période alors que ${r.fullName} a déclaré ${formatUsd(gap)}. Avant d'en conclure quoi que ce soit : vérifie qu'un export Infloww a bien été importé pour cette période.`
                          : gap > 0
                            ? `${r.fullName} a déclaré ${formatUsd(gap)} de plus que ce que les plateformes ont tracé. Vente saisie deux fois, montant arrondi trop haut, ou déclaration sur un compte non suivi.`
                            : `Les plateformes ont tracé ${formatUsd(-gap)} de plus que ce que ${r.fullName} a déclaré. Ventes oubliées, ou shift non déclaré.`}
                      </span>
                    </p>
                  )}

                  {r.uncheckableReasons.length > 0 && (
                    <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs text-muted">
                      Part non vérifiable — {r.uncheckableReasons.join(" · ")}.
                    </p>
                  )}

                  {/* Primes : le seul moyen de corriger, motif obligatoire. */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      Primes et sanctions
                    </p>
                    {r.adjustments.length === 0 && <p className="text-xs text-muted">Aucune.</p>}
                    {r.adjustments.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3.5 py-2"
                      >
                        <span className="min-w-0 text-xs">
                          <span
                            className={cn(
                              "font-semibold tabular-nums",
                              a.kind === "bonus" ? "text-success" : "text-danger"
                            )}
                          >
                            {a.kind === "bonus" ? "+" : "−"}
                            {formatUsd(a.amountUsd)}
                          </span>{" "}
                          {a.sourceRuleId && (
                            <span className="mr-1 inline-flex items-center rounded bg-accent/15 px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                              auto
                            </span>
                          )}
                          <span className="text-muted">{a.reason}</span>
                        </span>
                        <button
                          type="button"
                          disabled={pending || Boolean(r.paidAt)}
                          title={r.paidAt ? "Période soldée" : "Retirer"}
                          onClick={() =>
                            startTransition(async () => {
                              if (a.kind === "bonus") await deleteBonus(a.id, r.chatterId);
                              else await deleteSanction(a.id, r.chatterId);
                            })
                          }
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}

                    {!r.paidAt && (
                      <AdjustForm chatterId={r.chatterId} periodRange={periodRange} />
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-border/60 pt-3 text-sm">
                    <span className="text-muted">
                      Commission {formatUsd(r.commissionUsd)}
                      {r.bonusUsd > 0 && <span className="text-success"> + {formatUsd(r.bonusUsd)}</span>}
                      {r.sanctionUsd > 0 && <span className="text-danger"> − {formatUsd(r.sanctionUsd)}</span>}
                    </span>
                    <span className="tnum font-bold text-accent">{formatUsd(r.totalUsd)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Total à verser · {formatUsd(total)}
            </p>
            <p className="text-xs text-muted">
              Vérifie les écarts et les primes avant de clôturer la paie.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={applyRules}
              variant="secondary"
              disabled={pending || !platform}
              className="shrink-0"
            >
              <span className="inline-flex items-center gap-1.5">
                <Zap size={15} /> {pending ? "Application…" : "Appliquer les règles"}
              </span>
            </Button>
          </div>
        </div>

        {rules?.error && (
          <p className="flex items-start gap-2 rounded-xl bg-warning/10 px-3.5 py-2.5 text-sm text-warning">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {rules.error}
          </p>
        )}

        {rules?.applied && (
          <p className="flex items-start gap-2 rounded-xl bg-success/10 px-3.5 py-2.5 text-sm text-success">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            {rules.applied.bonuses + rules.applied.sanctions === 0
              ? "Règles déjà appliquées : rien à ajouter."
              : `${rules.applied.bonuses} prime${rules.applied.bonuses > 1 ? "s" : ""} et ${rules.applied.sanctions} sanction${rules.applied.sanctions > 1 ? "s" : ""} appliquée${rules.applied.sanctions > 1 ? "s" : ""}.`}
          </p>
        )}
      </Card>
    </div>
  );
}

function Line({
  label,
  value,
  tone,
  muted,
}: {
  label: string;
  value: string;
  tone?: "success" | "warning";
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-muted", muted && "pl-3 opacity-80")}>{label}</span>
      <span
        className={cn(
          "tnum font-medium",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning",
          !tone && "text-foreground"
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Ajout d'une prime ou d'une sanction.
 *
 * Le montant se saisit en dollars, comme tout le reste de l'écran, et part en
 * dollars — l'unité de stockage unique depuis le retrait du taux de change.
 */
function AdjustForm({
  chatterId,
  periodRange,
}: {
  chatterId: string;
  periodRange: string;
}) {
  const [kind, setKind] = useState<"bonus" | "sanction">("bonus");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const usd = parseFloat(amount);
    if (!Number.isFinite(usd) || usd <= 0 || !reason.trim()) return;

    const fd = new FormData();
    fd.set("amount_usd", usd.toFixed(2));
    fd.set("reason", reason.trim());
    fd.set("period_range", periodRange);

    startTransition(async () => {
      if (kind === "bonus") await addBonus(chatterId, fd);
      else await addSanction(chatterId, fd);
      setAmount("");
      setReason("");
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2 pt-1">
      <div className="flex overflow-hidden rounded-lg border border-border">
        {(["bonus", "sanction"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "min-h-9 px-2.5 text-xs font-medium transition-colors",
              kind === k
                ? k === "bonus"
                  ? "bg-success/20 text-success"
                  : "bg-danger/20 text-danger"
                : "bg-surface-2 text-muted hover:text-foreground"
            )}
          >
            {k === "bonus" ? "Prime" : "Sanction"}
          </button>
        ))}
      </div>
      <div className="relative w-24">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">
          $
        </span>
        <input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0,00"
          aria-label="Montant en dollars"
          className="w-full rounded-lg border border-border bg-surface-2 py-2 pl-6 pr-2 text-sm text-foreground outline-none focus:border-accent"
        />
      </div>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motif (obligatoire)"
        aria-label="Motif"
        className="min-w-40 flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted/60 focus:border-accent"
      />
      <Button
        type="submit"
        variant="secondary"
        disabled={pending}
        className="shrink-0 bg-surface-2 bg-none text-foreground shadow-none hover:bg-border hover:brightness-100"
      >
        <span className="inline-flex items-center gap-1">
          <Plus size={14} /> Ajouter
        </span>
      </Button>
    </form>
  );
}
