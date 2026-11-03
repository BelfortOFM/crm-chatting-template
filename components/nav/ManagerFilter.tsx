"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { SlidersHorizontal, X } from "lucide-react";
import { platformLabel } from "@/lib/platforms";

/**
 * Filtre plateforme + modele, partage par les ecrans manager qui affichent du
 * CA. Il vit dans l'URL (?platform=&model=) : la page se recharge cote serveur
 * avec le perimetre voulu, et le lien reste partageable.
 *
 * Choisir une plateforme reinitialise le modele — un modele n'appartient qu'a
 * une plateforme, garder l'ancien n'aurait pas de sens. Choisir un modele est
 * plus fin que la plateforme et gagne.
 */
export function ManagerFilter({
  platforms,
  models,
}: {
  platforms: string[];
  models: { id: string; name: string; platform: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const platform = params.get("platform");
  const modelId = params.get("model");

  function push(next: URLSearchParams) {
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function setPlatform(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("platform", value);
    else next.delete("platform");
    next.delete("model"); // un modele n'a plus de sens hors de sa plateforme
    push(next);
  }

  function setModel(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set("model", value);
    else next.delete("model");
    push(next);
  }

  // Rien a filtrer : aucun CA sur la periode.
  if (platforms.length === 0) return null;

  const modelsForPlatform = platform ? models.filter((m) => m.platform === platform) : models;
  const active = Boolean(platform || modelId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
        <SlidersHorizontal size={14} /> Filtrer
      </span>

      <select
        value={platform ?? ""}
        onChange={(e) => setPlatform(e.target.value)}
        className="min-h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-xs font-medium text-foreground outline-none focus:border-accent"
      >
        <option value="">Toutes les plateformes</option>
        {platforms.map((p) => (
          <option key={p} value={p}>
            {platformLabel(p)}
          </option>
        ))}
      </select>

      {modelsForPlatform.length > 0 && (
        <select
          value={modelId ?? ""}
          onChange={(e) => setModel(e.target.value)}
          className="min-h-9 rounded-lg border border-border bg-surface-2 px-2.5 text-xs font-medium text-foreground outline-none focus:border-accent"
        >
          <option value="">Tous les modèles</option>
          {modelsForPlatform.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      )}

      {active && (
        <button
          type="button"
          onClick={() => push(clearScope(params))}
          className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          <X size={13} /> Réinitialiser
        </button>
      )}
    </div>
  );
}

function clearScope(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("platform");
  next.delete("model");
  return next;
}
