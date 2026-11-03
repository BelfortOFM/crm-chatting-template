"use client";

import { useActionState } from "react";
import { createModel, type ActionState } from "./actions";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = {};

export function CreateModelForm({
  platforms,
}: {
  platforms: { code: string; label: string; currency: string }[];
}) {
  const [state, formAction, pending] = useActionState(createModel, initialState);

  return (
    <form action={formAction} className="mt-3 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom" htmlFor="name">
          <Input id="name" name="name" required placeholder="Ex: Aria" />
        </Field>
        <Field label="Plateforme" htmlFor="platform">
          <Select id="platform" name="platform" required defaultValue="">
            <option value="" disabled>
              Choisir…
            </option>
            {platforms.map((p) => (
              <option key={p.code} value={p.code}>
                {p.label} ({p.currency === "USD" ? "$" : "€"})
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {state.error && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>
      )}

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Création…" : "Créer le modèle"}
      </Button>
    </form>
  );
}
