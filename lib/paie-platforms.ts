import type { PeriodScheme } from "./payroll";

/**
 * Paie OnlyFans : hebdomadaire, 4 periodes P1-P4 par mois.
 *
 * Avant le retrait du multi-plateforme, cette liste portait aussi Reveal
 * (bi-hebdomadaire) et MYM — d'ou la structure en liste/config (et le champ
 * `scheme`, toujours "weekly" desormais), conservee telle quelle pour
 * qu'une agence ne perde rien si elle veut un jour une deuxieme page de
 * paie dediee.
 */
export type PaiePlatform = "onlyfans";

export interface PaiePlatformConfig {
  code: PaiePlatform;
  label: string;
  scheme: PeriodScheme;
  href: string;
}

export const PAIE_PLATFORMS: PaiePlatformConfig[] = [
  { code: "onlyfans", label: "OnlyFans", scheme: "weekly", href: "/admin/paie/onlyfans" },
];

export function paiePlatformConfig(code: string): PaiePlatformConfig | undefined {
  return PAIE_PLATFORMS.find((p) => p.code === code);
}

/** Prefixe du libelle de periode : toujours "P", OnlyFans etant hebdomadaire. */
export function periodPrefix(scheme: PeriodScheme): string {
  return scheme === "weekly" ? "P" : "Q";
}
