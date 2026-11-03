import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Anneau interieur plutot qu'aplat seul : sur fond sombre un simple fond
// translucide manque de contour et le badge se dilue dans la carte.
const TONES = {
  neutral: "bg-surface-2 text-muted ring-border",
  success: "bg-success-soft text-success ring-success/30",
  danger: "bg-danger/10 text-danger ring-danger/30",
  warning: "bg-warning-soft text-warning ring-warning/30",
  accent: "bg-accent-soft text-accent ring-accent/30",
  info: "bg-info-soft text-info ring-info/30",
} as const;

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof TONES }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone]
      )}
    >
      {children}
    </span>
  );
}
