import type { ComponentPropsWithRef, LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-xs font-medium uppercase tracking-wide text-muted", className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentPropsWithRef<"input">) {
  return (
    <input
      className={cn(
        // text-base on mobile: iOS Safari auto-zooms into any input under 16px.
        "mt-1 w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-base text-foreground sm:text-sm",
        "outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/25",
        className
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
