"use client";

import { useState, useTransition } from "react";
import { X, AlertCircle, Lock } from "lucide-react";
import { assignShiftSlot, toggleDayOffAsAdmin } from "./actions";
import { SHIFT_SLOTS, SLOT_INFO, type ShiftSlot } from "@/lib/shifts";
import { cn } from "@/lib/utils";

/** Créneau visible dans cette vue mais qui appartient à une autre portée. */
export interface InheritedSlot {
  slot: ShiftSlot;
  /** Nom du modèle, ou « tous modèles » pour un créneau générique. */
  label: string;
}

/**
 * Boutons de créneau : un clic assigne, un clic sur l'actif le retire.
 *
 * `modelId` fixe la portée : null pour un créneau valable sur tous les modèles
 * du chatter, sinon l'identifiant du modèle sélectionné. Les créneaux d'une
 * autre portée s'affichent verrouillés — les voir évite de croire la plage
 * libre, les verrouiller évite de supprimer depuis la mauvaise vue un créneau
 * qui engage d'autres modèles.
 */
export function SlotPicker({
  chatterId,
  current,
  inherited = [],
  modelId = null,
}: {
  chatterId: string;
  current: ShiftSlot[];
  inherited?: InheritedSlot[];
  modelId?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Un clic bascule ce seul creneau : les autres restent en place, ce qui
  // permet d'en cumuler deux.
  function pick(slot: ShiftSlot) {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("shift_slot", slot);
      fd.set("model_id", modelId ?? "");
      const res = await assignShiftSlot(chatterId, fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {SHIFT_SLOTS.map((slot) => {
        const active = current.includes(slot);
        const locked = !active ? inherited.find((i) => i.slot === slot) : undefined;

        if (locked) {
          return (
            <span
              key={slot}
              title={
                modelId
                  ? `Créneau « tous modèles » : il couvre déjà ce modèle. Pour le modifier, repasse sur « Tous les modèles ».`
                  : `Créneau propre à ${locked.label}. Pour le modifier, sélectionne ce modèle.`
              }
              className="flex min-h-9 cursor-help items-center gap-1 rounded-lg border border-dashed border-border px-2.5 text-xs font-medium text-muted"
            >
              <Lock size={10} className="opacity-60" />
              {SLOT_INFO[slot].label}
              <span className="opacity-70">· {locked.label}</span>
            </span>
          );
        }

        return (
          <button
            key={slot}
            type="button"
            disabled={pending}
            onClick={() => pick(slot)}
            title={active ? "Retirer ce créneau" : `Assigner ${SLOT_INFO[slot].label}`}
            className={cn(
              "flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-50",
              active
                ? "bg-gradient-to-r from-info/25 to-accent/25 text-foreground shadow-[inset_0_0_0_1px_rgb(56_189_248/0.45)]"
                : "bg-surface-2 text-muted hover:text-foreground"
            )}
          >
            {SLOT_INFO[slot].label}
            {active && <X size={11} className="text-muted" />}
          </button>
        );
      })}
      {error && (
        <span className="inline-flex items-center gap-1 text-[11px] text-danger">
          <AlertCircle size={11} /> {error}
        </span>
      )}
    </div>
  );
}

/** Case d'un jour dans la grille : clic pour poser/lever un OFF. */
export function DayCell({
  chatterId,
  iso,
  isOff,
  hasSlot,
  isToday,
  isPast,
  label,
}: {
  chatterId: string;
  iso: string;
  isOff: boolean;
  hasSlot: boolean;
  isToday: boolean;
  isPast: boolean;
  label: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => toggleDayOffAsAdmin(chatterId, iso).then(() => undefined))}
      title={isOff ? "Lever le jour OFF" : "Poser un jour OFF"}
      className={cn(
        "flex min-h-10 w-full items-center justify-center rounded-lg px-1 text-[11px] font-medium transition-colors disabled:opacity-50",
        isOff
          ? "bg-surface-2 text-muted line-through"
          : hasSlot
            ? "bg-info-soft text-info hover:bg-info/20"
            : "text-muted/50 hover:bg-surface-2",
        isToday && "ring-1 ring-inset ring-accent/50",
        isPast && "opacity-50"
      )}
    >
      {pending ? "…" : isOff ? "OFF" : label}
    </button>
  );
}
