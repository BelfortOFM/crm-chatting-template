"use client";

import { useState, useTransition } from "react";
import { Moon, Sun, Wrench, CalendarOff, AlertCircle, Check } from "lucide-react";
import { toggleDayOff } from "./actions";
import { SLOT_INFO, SLOT_LABEL_EN, dayNameEn, dayDateEn, totalHours, type PlanningDay } from "@/lib/shifts";
import { cn } from "@/lib/utils";

export function WeekView({ days, canEdit }: { days: PlanningDay[]; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  function toggle(iso: string) {
    setError(null);
    setTarget(iso);
    startTransition(async () => {
      const res = await toggleDayOff(iso);
      if (res.error) setError(res.error);
      setTarget(null);
    });
  }

  return (
    <div className="space-y-2">
      {days.map((day) => {
        const busy = pending && target === day.iso;
        return (
          <div
            key={day.iso}
            className={cn(
              "flex items-center gap-3 rounded-xl border bg-surface px-4 py-3 transition-colors",
              day.isToday ? "border-accent/60 bg-accent-soft" : "border-border",
              day.isPast && "opacity-50"
            )}
          >
            <div className="w-20 shrink-0">
              <p className={cn("text-sm font-semibold", day.isToday ? "text-accent" : "text-foreground")}>
                {dayNameEn(day.date)}
              </p>
              <p className="text-xs text-muted">{dayDateEn(day.date)}</p>
            </div>

            <div className="min-w-0 flex-1">
              {day.isOff ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
                  <CalendarOff size={12} /> Day OFF
                </span>
              ) : day.slots.length > 0 ? (
                // Double shift : les creneaux s'affichent cote a cote, dans
                // l'ordre de la journee.
                <span className="flex flex-wrap items-center gap-1.5">
                  {day.slots.map((slot) => {
                    const info = SLOT_INFO[slot];
                    return (
                      <span
                        key={slot}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                          slot === "depannage"
                            ? "bg-accent-soft text-accent"
                            : info.overnight
                              ? "bg-info-soft text-info"
                              : "bg-warning-soft text-warning"
                        )}
                      >
                        {slot === "depannage" ? (
                          <Wrench size={12} />
                        ) : info.overnight ? (
                          <Moon size={12} />
                        ) : (
                          <Sun size={12} />
                        )}
                        {SLOT_LABEL_EN[slot]}
                      </span>
                    );
                  })}
                  {day.slots.length > 1 && (
                    <span className="text-[11px] text-muted">{totalHours(day.slots)} h total</span>
                  )}
                </span>
              ) : (
                <span className="text-xs text-muted">No slot assigned</span>
              )}
            </div>

            {canEdit && !day.isPast && (
              <button
                type="button"
                disabled={busy}
                onClick={() => toggle(day.iso)}
                className={cn(
                  "flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors",
                  day.isOff
                    ? "text-accent hover:bg-accent-soft"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                )}
              >
                {busy ? "…" : day.isOff ? <Check size={13} /> : <CalendarOff size={13} />}
                {busy ? "" : day.isOff ? "Undo" : "Request OFF"}
              </button>
            )}
          </div>
        );
      })}

      {error && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
