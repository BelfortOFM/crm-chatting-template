import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  // Le degrade violet -> indigo signe l'action principale et rappelle la
  // bi-chromie de la marque sans introduire une troisieme teinte.
  primary:
    "bg-gradient-to-br from-accent via-accent-hover to-sky-600 text-white shadow-[0_4px_16px_-4px_rgb(56_189_248/0.55)] hover:brightness-110 disabled:opacity-60",
  secondary: "bg-surface-2 text-foreground ring-1 ring-inset ring-border hover:bg-border disabled:opacity-60",
  danger: "bg-danger/10 text-danger ring-1 ring-inset ring-danger/25 hover:bg-danger/20 disabled:opacity-60",
  ghost: "text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-60",
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
}

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        // py-2.5 keeps the touch target ≥44px on mobile.
        "rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]",
        "outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}
