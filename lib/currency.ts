import type { Currency, Platform } from "./types";

const PLATFORM_CURRENCY: Record<Platform, Currency> = {
  onlyfans: "USD",
};

export function currencyForPlatform(platform: Platform): Currency {
  return PLATFORM_CURRENCY[platform];
}

export function currencySymbol(currency: Currency): string {
  return currency === "USD" ? "$" : "€";
}

export function formatAmount(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// English-locale counterpart, for chatter-facing screens (admin keeps the
// fr-FR formatter above).
export function formatAmountEn(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Frais preleves par la plateforme sur chaque vente.
 *
 * Les chatters declarent le montant brut affiche sur la vente ; la plateforme
 * en garde ce pourcentage. L'agence ne percoit que le reste, et c'est sur ce
 * reste que se calcule la commission.
 *
 * Doit rester aligne avec fn_platform_fee_pct() en base (migration 0021), qui
 * fait foi pour tous les calculs. Cette constante ne sert qu'a l'affichage.
 */
export const PLATFORM_FEE_PCT = 20;

/** Montant restant apres frais de plateforme. */
export function afterPlatformFee(amount: number): number {
  return amount * (1 - PLATFORM_FEE_PCT / 100);
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatUsdEn(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(amount);
}
