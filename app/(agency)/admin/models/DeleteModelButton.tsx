"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { deleteModel, toggleModelActive } from "./actions";

/**
 * Suppression d'un modele, avec retour immediat.
 *
 * Avant, l'echec (modele avec historique de paie, bloque par la cle etrangere)
 * etait avale et la page se rechargeait sans rien changer : le bouton semblait
 * mort. Ici on remonte le resultat, on rafraichit la liste des qu'une
 * suppression aboutit, et si le modele porte de l'historique on propose la
 * desactivation — la seule sortie propre sans effacer de la paie.
 */
export function DeleteModelButton({
  modelId,
  active,
}: {
  modelId: string;
  active: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [canDeactivate, setCanDeactivate] = useState(false);

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteModel(modelId);
      if (res.ok) {
        router.refresh(); // la carte disparait des que le serveur re-rend
      } else {
        setError(res.error ?? "Suppression impossible.");
        setCanDeactivate(Boolean(res.hasHistory) && active);
      }
    });
  }

  function deactivate() {
    setError(null);
    startTransition(async () => {
      await toggleModelActive(modelId, false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg pr-2 text-xs font-medium text-danger/80 transition-colors hover:text-danger disabled:opacity-50"
        >
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          Supprimer ce modèle
        </button>

        {canDeactivate && (
          <button
            type="button"
            onClick={deactivate}
            disabled={pending}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-surface-2 px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-border disabled:opacity-50"
          >
            <EyeOff size={13} /> Désactiver à la place
          </button>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-danger">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
