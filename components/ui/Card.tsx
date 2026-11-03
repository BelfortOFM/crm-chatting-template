import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // Bordure nette plutot qu'ombre lourde : sur fond sombre, c'est le
        // trait qui separe les blocs, pas la profondeur.
        "rounded-2xl border border-border bg-surface p-5",
        "shadow-[inset_0_1px_0_0_rgb(255_255_255/0.05),0_8px_24px_-14px_rgb(0_0_0/0.7)]",
        className
      )}
    >
      {children}
    </div>
  );
}
