import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Native <select> with the same visual treatment as <Input>, including the
 * text-base/sm:text-sm rule that stops iOS Safari from zooming on focus.
 */
export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "mt-1 w-full appearance-none rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-base text-foreground sm:text-sm",
        "outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25",
        className
      )}
      {...props}
    />
  );
}
