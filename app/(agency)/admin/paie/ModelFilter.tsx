"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

/**
 * Filtre par modele, dans le perimetre d'une page de paie deja fixee sur une
 * plateforme. Il vit dans l'URL (?model=) et conserve la periode (?p=) et la
 * plateforme choisies : la page se recharge cote serveur avec le modele seul.
 */
export function ModelFilter({ models }: { models: { id: string; name: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const model = params.get("model");

  if (models.length === 0) return null;

  function push(next: URLSearchParams) {
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function setModel(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("model", value);
    else next.delete("model");
    push(next);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted">Modèle</span>
      <select
        value={model ?? ""}
        onChange={(e) => setModel(e.target.value)}
        aria-label="Filtrer par modèle"
        className="min-h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-xs font-medium text-foreground outline-none focus:border-accent"
      >
        <option value="">Tous les modèles</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {model && (
        <button
          type="button"
          onClick={() => setModel("")}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          <X size={13} /> Réinitialiser
        </button>
      )}
    </div>
  );
}
