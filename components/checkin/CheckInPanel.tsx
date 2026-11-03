"use client";

import { useState, useTransition } from "react";
import { Play, Square, Clock, Check, AlertCircle, CalendarOff } from "lucide-react";
import { checkIn, checkOut } from "@/app/(chatter)/planning/checkin-actions";
import { Button } from "@/components/ui/Button";
import { SLOT_LABEL_EN, SHIFT_NOTE_MIN_CHARS, type ShiftSlot } from "@/lib/shifts";
import { cn } from "@/lib/utils";

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/**
 * Pointage de prise et de fin de poste, en tête de l'onglet Déclarer.
 *
 * Il vit là parce que c'est l'écran que le chatter ouvre de toute façon : en
 * début de shift pour pointer, en fin de shift pour saisir ses ventes puis
 * dépointer. Un même onglet, les deux gestes de la journée.
 *
 * Le bloc porte l'état en clair plutôt qu'un simple bouton : « En poste depuis
 * 14:02 » répond à la question que le chatter se pose réellement en arrivant
 * sur l'écran — ai-je pensé à pointer ?
 *
 * Le ressenti de fin de poste s'ouvre par-dessus la page : une zone de texte
 * confortable vaut mieux qu'un champ glissé dans le bloc, et l'ouvrir en grand
 * dit que la réponse compte.
 *
 * Sans créneau assigné le bloc reste affiché et le dit. Le masquer était pire
 * que tout : le chatter cherchait un bouton de pointage introuvable sans
 * pouvoir deviner que le problème venait de son planning, et l'agence ne
 * voyait rien non plus.
 */
export function CheckInPanel({
  slots,
  openSince,
  doneToday,
}: {
  slots: ShiftSlot[];
  openSince: string | null;
  doneToday: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<ShiftSlot>(slots[0] ?? "09-15");
  const [wrapUp, setWrapUp] = useState(false);
  const [note, setNote] = useState("");

  const missing = Math.max(0, SHIFT_NOTE_MIN_CHARS - note.trim().length);

  function begin() {
    setError(null);
    startTransition(async () => {
      const res = await checkIn(choice);
      if (res.error) setError(res.error);
    });
  }

  function finish() {
    setError(null);
    startTransition(async () => {
      const res = await checkOut(note);
      if (res.error) setError(res.error);
      else {
        setWrapUp(false);
        setNote("");
      }
    });
  }

  // Rien à pointer : le planning du chatter est vide. On l'écrit plutôt que
  // de faire disparaître le bloc, et on nomme le responsable — c'est l'agence
  // qui assigne les créneaux, le chatter n'y peut rien de son côté.
  if (slots.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-surface p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
          <CalendarOff size={17} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Check-in unavailable</p>
          <p className="mt-0.5 text-xs text-muted">
            No slot is assigned to you yet: ask your agency to assign you one and the button will
            show up here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border p-4",
          openSince ? "border-success/30 bg-success/10" : "border-border bg-surface"
        )}
      >
        {/* Le choix ne s'affiche qu'en double shift : un seul créneau ne laisse
            rien à décider. */}
        {!openSince && slots.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {slots.map((slot) => (
              <button
                key={slot}
                type="button"
                onClick={() => setChoice(slot)}
                aria-pressed={choice === slot}
                className={cn(
                  "flex min-h-9 items-center rounded-lg px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/50",
                  choice === slot
                    ? "bg-accent-soft text-accent shadow-[inset_0_0_0_1px_rgb(56_189_248/0.4)]"
                    : "bg-surface-2 text-muted hover:text-foreground"
                )}
              >
                {SLOT_LABEL_EN[slot]}
              </button>
            ))}
          </div>
        )}

        {openSince ? (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
                <Clock size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  Checked in since {TIME.format(new Date(openSince))}
                </p>
                <p className="truncate text-xs text-muted">Check out to record your feedback</p>
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setWrapUp(true)}
              className="mt-3 h-12 w-full text-base"
            >
              <span className="inline-flex items-center gap-2">
                <Square size={18} /> Check out
              </span>
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              disabled={pending}
              onClick={begin}
              className="h-14 w-full text-base"
            >
              <span className="inline-flex items-center gap-2">
                <Play size={20} /> {pending ? "…" : doneToday ? "Check in again" : "Check in"}
              </span>
            </Button>
            <p className="mt-2 text-center text-xs text-muted">
              {slots.length > 1
                ? "Choose your slot above"
                : `Shift ${SLOT_LABEL_EN[slots[0]!]}`}
            </p>
          </>
        )}

        {error && (
          <p className="mt-2.5 flex items-start gap-1.5 text-xs text-danger">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* Ressenti de fin de poste : obligatoire, donc il prend le dessus sur la
          page. Feuille remontant du bas sur téléphone, fenêtre centrée à partir
          de sm — collée au bas d'un grand écran, elle obligerait à descendre
          les yeux pour écrire. */}
      {wrapUp && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6">
          <div className="safe-bottom max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border-t border-border bg-background px-4 pb-4 pt-5 sm:max-w-xl sm:rounded-2xl sm:border sm:p-6 sm:shadow-2xl">
            <div className="mx-auto max-w-lg space-y-3 sm:max-w-none">
              <div>
                <label htmlFor="shift-note" className="block text-base font-semibold text-foreground">
                  How did your shift go?
                </label>
                <p className="mt-1 text-xs text-muted">
                  Two or three lines: what worked, what didn't, a fan or model to flag.
                </p>
              </div>

              <textarea
                id="shift-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={5}
                autoFocus
                placeholder="E.g.: Big day on Model1, two $50 PPVs sold fast. A recurring fan is getting pushy with off-limits requests, I'd rather flag it."
                className="w-full resize-y rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base text-foreground outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/25"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  {missing > 0 ? (
                    `${missing} more character${missing > 1 ? "s" : ""}`
                  ) : (
                    <span className="inline-flex items-center gap-1 text-success">
                      <Check size={13} /> Good to go
                    </span>
                  )}
                </span>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => {
                      setWrapUp(false);
                      setError(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="button" disabled={pending || missing > 0} onClick={finish}>
                    <span className="inline-flex items-center gap-1.5">
                      <Square size={15} /> {pending ? "Saving…" : "Send and check out"}
                    </span>
                  </Button>
                </div>
              </div>

              {error && (
                <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
