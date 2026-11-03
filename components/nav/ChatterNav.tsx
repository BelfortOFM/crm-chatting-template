"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PlusCircle, CalendarDays, Wallet, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

// Cinq onglets maximum : au-dela les libelles se chevauchent sur un ecran de
// telephone. Le profil est atteint par l'avatar de l'en-tete.
const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/report", label: "Report", icon: PlusCircle },
  { href: "/planning", label: "Planning", icon: CalendarDays },
  { href: "/paiements", label: "Payments", icon: Wallet },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

/**
 * Navigation de l'espace chatter, en deux dispositions.
 *
 * `bar` : barre d'onglets collee en bas, pour le pouce — c'est l'usage
 * majoritaire. `rail` : liste verticale dans la colonne laterale, sur les
 * ecrans larges ou une barre d'onglets etiree sur 1400 px donnerait cinq
 * pastilles perdues au milieu du vide.
 *
 * Les deux dispositions partagent la meme liste : un lien ajoute ici apparait
 * des deux cotes, il n'y a pas de navigation "version PC" a maintenir a part.
 */
export function ChatterNav({ variant = "bar" }: { variant?: "bar" | "rail" }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  if (variant === "rail") {
    return (
      <nav className="flex flex-col gap-0.5 px-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                "outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
                active
                  ? "bg-gradient-to-r from-info/15 to-accent/20 text-foreground shadow-[inset_0_0_0_1px_rgb(56_189_248/0.4)]"
                  : "text-muted hover:bg-surface-2 hover:text-foreground"
              )}
            >
              <Icon size={17} strokeWidth={active ? 2.4 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="safe-bottom border-t border-border bg-background/85 backdrop-blur-xl">
      <ul className="mx-auto flex max-w-lg items-stretch justify-around">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="relative flex-1">
              {/* Thin indicator bar along the top edge of the active tab. */}
              {active && (
                <span className="absolute -top-px left-1/2 h-0.5 w-10 -translate-x-1/2 rounded-full bg-gradient-to-r from-info to-accent shadow-[0_0_8px_rgb(56_189_248/0.8)]" />
              )}
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-accent" : "text-muted hover:text-foreground"
                )}
              >
                <Icon size={21} strokeWidth={active ? 2.4 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
