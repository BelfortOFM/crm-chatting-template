import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

/**
 * Chaque nature de chiffre garde la meme teinte partout dans l'app : le CA est
 * toujours bleu, la remuneration toujours violette, la marge toujours verte.
 * On identifie la carte a sa couleur avant d'avoir lu son libelle.
 */
const TONES = {
  info: { icon: "bg-info-soft text-info", bar: "from-info/70 to-info/0" },
  accent: { icon: "bg-accent-soft text-accent", bar: "from-accent/70 to-accent/0" },
  success: { icon: "bg-success-soft text-success", bar: "from-success/70 to-success/0" },
  warning: { icon: "bg-warning-soft text-warning", bar: "from-warning/70 to-warning/0" },
  neutral: { icon: "bg-surface-2 text-muted", bar: "from-border to-transparent" },
} as const;

export type StatTone = keyof typeof TONES;

export function StatCard({
  label,
  icon,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  icon?: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
}) {
  const t = TONES[tone];
  return (
    <Card className="relative overflow-hidden">
      {/* Filet colore en haut de carte : repere la nature du chiffre meme
          quand la grille est parcourue en diagonale. */}
      <span
        aria-hidden
        className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r", t.bar)}
      />
      <div className="flex items-center gap-2">
        {icon && (
          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", t.icon)}>
            {icon}
          </span>
        )}
        <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      </div>
      <p className="tnum mt-2 text-2xl font-bold text-foreground">{value}</p>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
}
