import Link from "next/link";
import { Sparkles, ChevronRight } from "lucide-react";
import { ChatterNav } from "./ChatterNav";
import { LogoutButton } from "./LogoutButton";

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/**
 * Colonne laterale de l'espace chatter, sur ordinateur uniquement.
 *
 * Une partie des chatteurs travaille au clavier sur un grand ecran : la barre
 * d'onglets du bas, pensee pour le pouce, y devient cinq pastilles perdues a
 * 1400 px du regard. La colonne remet profil et navigation la ou la souris se
 * trouve deja.
 *
 * Elle remplace l'en-tete mobile plutot que de s'y ajouter : afficher le nom et
 * la deconnexion a deux endroits a la fois donnerait deux fois le meme bouton.
 */
export function ChatterSidebar({ fullName }: { fullName: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface/40 lg:flex">
      <div className="flex items-center gap-2 px-5 pb-4 pt-5 text-sm font-bold text-foreground">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-info via-sky-500 to-accent text-white shadow-[0_2px_10px_rgb(99_102_241/0.55)]">
          <Sparkles size={13} />
        </span>
        CRM Chatting
      </div>

      <Link
        href="/profile"
        className="mx-3 mb-4 flex items-center gap-2.5 rounded-xl px-2 py-2 outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-info via-sky-500 to-accent text-xs font-bold text-white shadow-[0_2px_10px_rgb(56_189_248/0.5)]">
          {initials(fullName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{fullName}</span>
          <span className="block text-[11px] text-muted">My profile</span>
        </span>
        <ChevronRight size={15} className="shrink-0 text-muted" />
      </Link>

      <ChatterNav variant="rail" />

      {/* Deconnexion au pied de la colonne : la navigation reste en haut, la
          ou on la cherche. */}
      <div className="mt-auto p-3">
        <LogoutButton label="Log out" />
      </div>
    </aside>
  );
}
