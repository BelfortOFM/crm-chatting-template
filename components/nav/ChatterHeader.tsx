import Link from "next/link";
import { LogoutButton } from "./LogoutButton";

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function ChatterHeader({ fullName }: { fullName: string }) {
  return (
    <header className="safe-top sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        {/* Le profil a quitte la barre du bas (5 onglets = illisible sur
            telephone) : l'avatar devient son point d'entree. */}
        <Link
          href="/profile"
          className="flex min-h-10 items-center gap-2.5 rounded-lg pr-2 transition-opacity hover:opacity-80"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-info via-sky-500 to-accent text-xs font-bold text-white shadow-[0_2px_10px_rgb(56_189_248/0.5)]">
            {initials(fullName)}
          </span>
          <span className="text-sm font-bold text-foreground">{fullName}</span>
        </Link>
        <LogoutButton label="Log out" />
      </div>
    </header>
  );
}
