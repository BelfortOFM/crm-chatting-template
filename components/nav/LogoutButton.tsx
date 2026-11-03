"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/lib/auth-actions";

export function LogoutButton({ label = "Déconnexion" }: { label?: string }) {
  return (
    <form action={logout}>
      {/* Icône seule sur mobile : le libellé mangeait la largeur du header. */}
      <button
        type="submit"
        aria-label={label}
        className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <LogOut size={16} />
        <span className="hidden sm:inline">{label}</span>
      </button>
    </form>
  );
}
