"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2, AlertCircle, Lock, X } from "lucide-react";
import { updateShift, deleteShift } from "./actions";
import { SaleAmounts } from "./SaleAmounts";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/PageHeader";
import { formatAmountEn } from "@/lib/currency";
import { toDateString } from "@/lib/period";
import { parisNow } from "@/lib/shifts";
import type { Currency } from "@/lib/types";

export interface ShiftItem {
  id: string;
  modelName: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  /** Devise réelle du modèle — celle dans laquelle le chatter a saisi. */
  currency: Currency;
  amounts: string[];
  total: number;
  /** Période clôturée : plus modifiable sans passer par l'agence. */
  locked: boolean;
}

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Europe/Paris",
});

function formatShiftDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return DATE_FMT.format(new Date(y!, m! - 1, d!));
}

export function ShiftHistory({ shifts }: { shifts: ShiftItem[] }) {
  if (shifts.length === 0) {
    return <EmptyState>No shift reported yet.</EmptyState>;
  }
  return (
    <div className="space-y-2">
      {shifts.map((s) => (
        <ShiftRow key={s.id} shift={s} />
      ))}
    </div>
  );
}

function ShiftRow({ shift }: { shift: ShiftItem }) {
  const [mode, setMode] = useState<"idle" | "edit" | "confirm">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteShift(shift.id);
      // En cas de succès la ligne disparaît au rafraîchissement du serveur :
      // rien à remettre à zéro ici, le composant est démonté.
      if (res.error) {
        setError(res.error);
        setMode("idle");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{shift.modelName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {formatShiftDate(shift.shiftDate)} · {shift.startTime.slice(0, 5)}–
            {shift.endTime.slice(0, 5)} · {shift.amounts.length} sale
            {shift.amounts.length > 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <p className="mr-1 font-bold tabular-nums text-foreground">{formatAmountEn(shift.total, shift.currency)}</p>

          {shift.locked ? (
            <span
              title="Period closed: ask your agency to correct this shift."
              className="flex h-9 w-9 cursor-help items-center justify-center text-muted/60"
            >
              <Lock size={15} />
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode(mode === "edit" ? "idle" : "edit");
                }}
                aria-label="Edit this shift"
                title="Edit this shift"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
              >
                {mode === "edit" ? <X size={16} /> : <Pencil size={15} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode(mode === "confirm" ? "idle" : "confirm");
                }}
                aria-label="Delete this shift"
                title="Delete this shift"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Confirmation avant suppression : le geste efface le shift et toutes
          ses ventes, et un chiffre d'affaires retiré par erreur ne se retrouve
          pas tout seul. */}
      {mode === "confirm" && (
        <div className="border-t border-border px-4 py-3">
          <p className="text-sm text-foreground">
            Delete this shift and its {shift.amounts.length} sale
            {shift.amounts.length > 1 ? "s" : ""} ({formatAmountEn(shift.total, shift.currency)})?
          </p>
          <p className="mt-1 text-xs text-muted">
            The corresponding revenue will disappear from your tracking, your goal and the
            leaderboard. This is final.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={remove}
              className="bg-danger bg-none text-white shadow-none hover:brightness-110"
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => setMode("idle")}
              className="bg-surface-2 bg-none text-foreground shadow-none hover:bg-border hover:brightness-100"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "edit" && (
        <EditForm shift={shift} onDone={() => setMode("idle")} onError={setError} />
      )}

      {error && (
        <p className="flex items-start gap-2 border-t border-border px-4 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

function EditForm({
  shift,
  onDone,
  onError,
}: {
  shift: ShiftItem;
  onDone: () => void;
  onError: (msg: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onError(null);
    startTransition(async () => {
      const res = await updateShift({}, fd);
      if (res.error) onError(res.error);
      else onDone();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 border-t border-border px-4 py-4">
      <input type="hidden" name="shift_id" value={shift.id} />

      <Field label="Date" htmlFor={`edit-date-${shift.id}`}>
        <Input
          id={`edit-date-${shift.id}`}
          name="shift_date"
          type="date"
          required
          defaultValue={shift.shiftDate}
          max={toDateString(parisNow())}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start" htmlFor={`edit-start-${shift.id}`}>
          <Input
            id={`edit-start-${shift.id}`}
            name="start_time"
            type="time"
            required
            defaultValue={shift.startTime.slice(0, 5)}
          />
        </Field>
        <Field label="End" htmlFor={`edit-end-${shift.id}`}>
          <Input
            id={`edit-end-${shift.id}`}
            name="end_time"
            type="time"
            required
            defaultValue={shift.endTime.slice(0, 5)}
          />
        </Field>
      </div>

      <SaleAmounts initial={shift.amounts} currency={shift.currency} />

      {/* Le modèle est figé : en changer changerait la devise, alors que le
          taux de change du shift, lui, est figé à la déclaration. */}
      <p className="text-xs text-muted">
        Model: <strong className="text-foreground">{shift.modelName}</strong> — it can't be
        changed. If you picked the wrong model, delete this shift and report it again.
      </p>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          disabled={pending}
          onClick={onDone}
          className="bg-surface-2 bg-none text-foreground shadow-none hover:bg-border hover:brightness-100"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
