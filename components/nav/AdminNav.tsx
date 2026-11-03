"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Clapperboard, Trophy, Sparkles, Wallet, History, ShieldCheck, CalendarDays, MessageSquareQuote } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoutButton } from "./LogoutButton";

const ITEMS = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/paie", label: "Paie", icon: Wallet },
  { href: "/admin/planning", label: "Planning", icon: CalendarDays },
  { href: "/admin/chatters", label: "Chatters", icon: Users },
  { href: "/admin/verifications", label: "Identités", icon: ShieldCheck },
  { href: "/admin/models", label: "Modèles", icon: Clapperboard },
  { href: "/admin/leaderboard", label: "Classement", icon: Trophy },
  { href: "/admin/ressentis", label: "Ressentis", icon: MessageSquareQuote },
  { href: "/admin/journal", label: "Journal", icon: History },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <header className="safe-top sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-4">
        {/* Brand + logout on their own row so the 6 nav tabs never fight for
            space with them on a phone screen. */}
        <div className="flex items-center justify-between py-3">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-info via-sky-500 to-accent text-white shadow-[0_2px_10px_rgb(99_102_241/0.55)]">
              <Sparkles size={13} />
            </span>
            CRM Chatter
          </span>
          <LogoutButton />
        </div>
        <nav className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-2.5">
          {ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
                  active
                    ? "bg-gradient-to-r from-info/15 to-accent/20 text-foreground shadow-[inset_0_0_0_1px_rgb(56_189_248/0.4)]"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                )}
              >
                <Icon size={15} />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
