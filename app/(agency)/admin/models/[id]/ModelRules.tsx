"use client";

import { useActionState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  createModelRule,
  updateModelRule,
  toggleModelRule,
  deleteModelRule,
  type RuleState,
} from "./actions";
import { Field, Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export interface RuleRowData {
  id: string;
  kind: "bonus" | "sanction";
  amount_usd: number | string;
  reason: string;
  active: boolean;
}

const initialCreate: RuleState = {};

/**
 * Gestion des règles de prime/sanction d'un modèle.
 *
 * Une règle déclenche un montant forfaitaire en dollars dès qu'un chatter
 * génère du CA sur ce modèle pendant une période. Elle ne s'applique pas
 * d'elle-même : le bouton « Appliquer les règles » du récapitulatif fait la
 * passe, de façon idempotente.
 */
export function ModelRules({ modelId, rules }: { modelId: string; rules: RuleRowData[] }) {
  const [createState, createAction, createPending] = useActionState(
    createModelRule.bind(null, modelId),
    initialCreate
  );

  return (
    <div className="space-y-4">
      <form
        action={createAction}
        className="space-y-3 rounded-xl border border-border bg-surface-2/40 p-3"
      >
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Nouvelle règle</p>
        <div className="grid gap-3 sm:grid-cols-[auto_1fr_1.5fr] sm:items-start">
          <Field label="Type" htmlFor="rule-kind">
            <Select id="rule-kind" name="kind" defaultValue="bonus">
              <option value="bonus">Prime</option>
              <option value="sanction">Sanction</option>
            </Select>
          </Field>
          <Field label="Montant ($)" htmlFor="rule-amount">
            <Input
              id="rule-amount"
              name="amount_usd"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              required
              placeholder="Ex: 50"
            />
          </Field>
          <Field label="Motif" htmlFor="rule-reason">
            <Input id="rule-reason" name="reason" required placeholder="Motif (obligatoire)" />
          </Field>
        </div>

        {createState.error && <p className="text-sm text-danger">{createState.error}</p>}

        <Button type="submit" disabled={createPending}>
          <span className="inline-flex items-center gap-1.5">
            <Plus size={14} /> {createPending ? "Ajout…" : "Ajouter la règle"}
          </span>
        </Button>
      </form>

      {rules.length === 0 ? (
        <p className="text-sm text-muted">
          Aucune règle. Ajoute-en une pour verser automatiquement une prime (ou appliquer une
          sanction) dès qu&apos;un chatter fait du CA sur ce modèle.
        </p>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <RuleRow key={rule.id} modelId={modelId} rule={rule} />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleRow({ modelId, rule }: { modelId: string; rule: RuleRowData }) {
  const [editState, editAction, editPending] = useActionState(
    updateModelRule.bind(null, rule.id, modelId),
    initialCreate
  );
  const [pending, startTransition] = useTransition();

  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={rule.kind === "bonus" ? "success" : "danger"}>
            {rule.kind === "bonus" ? "Prime" : "Sanction"}
          </Badge>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            ${Number(rule.amount_usd).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
          </span>
          <Badge tone={rule.active ? "success" : "neutral"}>
            {rule.active ? "Active" : "Inactive"}
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => startTransition(async () => toggleModelRule(rule.id, modelId, !rule.active))}
            className="!px-3 !py-1.5 text-xs"
          >
            {rule.active ? "Désactiver" : "Activer"}
          </Button>
          <button
            type="button"
            disabled={pending}
            aria-label="Supprimer cette règle"
            title="Supprimer"
            onClick={() => startTransition(async () => deleteModelRule(rule.id, modelId))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-40"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <form action={editAction} className="grid gap-2 sm:grid-cols-[auto_1fr_1.5fr_auto] sm:items-center">
        <Select name="kind" defaultValue={rule.kind} aria-label="Type">
          <option value="bonus">Prime</option>
          <option value="sanction">Sanction</option>
        </Select>
        <Input
          name="amount_usd"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          defaultValue={Number(rule.amount_usd)}
          aria-label="Montant en dollars"
        />
        <Input name="reason" defaultValue={rule.reason} aria-label="Motif" />
        <Button type="submit" variant="secondary" disabled={editPending} className="!py-2 text-xs">
          {editPending ? "…" : "Enregistrer"}
        </Button>
      </form>

      {editState.error && <p className="mt-2 text-xs text-danger">{editState.error}</p>}
    </div>
  );
}
