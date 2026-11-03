import type { Currency, Platform } from "./types";

/**
 * Plateformes : OnlyFans (integree) + celles ajoutees par l'agence.
 *
 * OnlyFans est particuliere — elle a un suivi (Infloww) et une destination
 * comptable, d'ou sa presence en dur dans le code. Une plateforme custom n'a
 * ni suivi ni compta : son CA sort en "non verifiable" dans le recap. Ce
 * module ne porte que l'affichage et la devise ; le suivi reste decrit dans
 * lib/recap.ts.
 */

export interface PlatformOption {
  code: string;
  label: string;
  currency: Currency;
  /** Integree (suivi + compta possibles) ou ajoutee par l'agence. */
  builtin: boolean;
}

export const BUILTIN_PLATFORMS: { code: Platform; label: string; currency: Currency }[] = [
  { code: "onlyfans", label: "OnlyFans", currency: "USD" },
];

const BUILTIN_LABELS: Record<string, string> = Object.fromEntries(
  BUILTIN_PLATFORMS.map((p) => [p.code, p.label])
);

export const BUILTIN_CODES = new Set(BUILTIN_PLATFORMS.map((p) => p.code));

/**
 * Libelle d'affichage d'un code de plateforme.
 *
 * Integree : le nom officiel. Custom : le libelle fourni si on le connait,
 * sinon le code capitalise — pour qu'un ecran qui n'a pas charge la liste
 * custom (le recap) affiche quand meme "Fanvue" plutot que "fanvue".
 */
export function platformLabel(code: string, customLabels?: Map<string, string>): string {
  return (
    BUILTIN_LABELS[code] ??
    customLabels?.get(code) ??
    (code.charAt(0).toUpperCase() + code.slice(1))
  );
}

/** Normalise un nom saisi en code slug (ex: "Fan Vue" -> "fanvue"). */
export function slugifyPlatform(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 30);
}
