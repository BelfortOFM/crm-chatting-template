"use client";

import { useActionState, useId, useState } from "react";
import { platformLabel } from "@/lib/platforms";
import { AlertCircle } from "lucide-react";
import { createShift, type ActionState } from "./actions";
import { SaleAmounts } from "./SaleAmounts";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { toDateString } from "@/lib/period";
import { parisNow } from "@/lib/shifts";
import type { Currency, Platform } from "@/lib/types";

const initialState: ActionState = {};

interface ModelOption {
  id: string;
  name: string;
  platform: Platform;
  currency: Currency;
}

export function ShiftForm({ models }: { models: ModelOption[] }) {
  const [state, formAction, pending] = useActionState(createShift, initialState);
  const [modelId, setModelId] = useState(models[0]?.id ?? "");
  const listId = useId();
  const currency = models.find((m) => m.id === modelId)?.currency ?? "USD";

  return (
    <form action={formAction} className="space-y-5">
      {/* Date pleine largeur, heures côte à côte : sur mobile trois champs sur
          une ligne rendaient les sélecteurs natifs illisibles. */}
      <Field label="Date" htmlFor={`${listId}-date`}>
        {/* Heure de Paris explicite, pas new Date() : celle-ci suit le
            fuseau de l'appareil, qui n'est pas garanti regle sur la France
            (cf. parisNow()) — un chatter dont le telephone est sur un autre
            fuseau se retrouvait avec une date par defaut differente de celle
            de son pointage, bloquant la declaration ("il faut pointer")
            alors qu'il venait de le faire. Futures dates rejetees cote base
            de toute facon. */}
        <Input
          id={`${listId}-date`}
          name="shift_date"
          type="date"
          required
          defaultValue={toDateString(parisNow())}
          max={toDateString(parisNow())}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Start" htmlFor={`${listId}-start`}>
          <Input id={`${listId}-start`} name="start_time" type="time" required />
        </Field>
        <Field label="End" htmlFor={`${listId}-end`}>
          <Input id={`${listId}-end`} name="end_time" type="time" required />
        </Field>
      </div>

      <Field label="Model" htmlFor={`${listId}-model`}>
        <Select
          id={`${listId}-model`}
          name="model_id"
          required
          value={modelId}
          onChange={(e) => setModelId(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({platformLabel(m.platform)})
            </option>
          ))}
        </Select>
      </Field>

      {/* La `key` change a chaque enregistrement reussi : le composant est
          remonte, donc vide. Sans ca les montants du shift precedent restaient
          affiches, et un second appui creait un doublon. */}
      <SaleAmounts key={state.ok ?? 0} initial={[""]} currency={currency} />

      {state.error && (
        <p className="flex items-start gap-2 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {state.error}
        </p>
      )}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save shift"}
      </Button>
    </form>
  );
}
