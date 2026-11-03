"use client";

import { useActionState, useState, useTransition } from "react";
import { Plus, Trash2, Lock } from "lucide-react";
import { addCustomPlatform, deleteCustomPlatform, type ActionState } from "./actions";
import { Field, Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const initialState: ActionState = {};

/**
 * Gestion des plateformes de l'agence : OnlyFans (integree, non modifiable) et
 * celles ajoutees a la main. Une plateforme custom sert a creer des modeles
 * ailleurs que sur OnlyFans ; elle n'a pas de suivi automatique, ce que
 * l'ecran dit pour ne pas laisser croire a un controle qui n'existe pas.
 * Devise unique USD partout.
 */
export function PlatformManager({
  builtins,
  custom,
}: {
  builtins: { code: string; label: string; currency: string }[];
  custom: { code: string; label: string; currency: string }[];
}) {
  const [state, formAction, pending] = useActionState(addCustomPlatform, initialState);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {builtins.map((p) => (
          <span
            key={p.code}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted"
          >
            <Lock size={11} className="opacity-60" />
            {p.label} · {p.currency === "USD" ? "$" : "€"}
          </span>
        ))}
        {custom.map((p) => (
          <CustomChip key={p.code} platform={p} />
        ))}
      </div>

      {open ? (
        <form action={formAction} className="space-y-3 rounded-xl border border-border bg-surface-2/40 p-3">
          <Field label="Nom de la plateforme" htmlFor="label">
            <Input id="label" name="label" required placeholder="Ex: Fanvue" autoFocus />
          </Field>
          {state.error && <p className="text-sm text-danger">{state.error}</p>}
          <p className="text-xs text-muted">
            Une plateforme ajoutée ici n&apos;a pas de suivi automatique (Infloww ne la couvre pas) :
            le CA qu&apos;on y déclare sort en « non vérifiable » dans le récap. Sa devise est fixée
            en USD, comme OnlyFans.
          </p>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Ajout…" : "Ajouter"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Annuler
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
          <span className="inline-flex items-center gap-1.5">
            <Plus size={14} /> Ajouter une plateforme
          </span>
        </Button>
      )}
    </div>
  );
}

function CustomChip({ platform }: { platform: { code: string; label: string; currency: string } }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteCustomPlatform(platform.code);
      if (res.error) setError(res.error);
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground">
      {platform.label} · {platform.currency === "USD" ? "$" : "€"}
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label={`Supprimer ${platform.label}`}
        className="text-muted transition-colors hover:text-danger disabled:opacity-50"
        title={error ?? "Supprimer"}
      >
        <Trash2 size={12} />
      </button>
    </span>
  );
}
