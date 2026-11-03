import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LeaderboardView } from "@/lib/leaderboard";

export function ViewToggle({
  basePath,
  active,
  periodNumber,
}: {
  basePath: string;
  active: LeaderboardView;
  periodNumber: number;
}) {
  const tabs: { view: LeaderboardView; label: string }[] = [
    { view: "period", label: `Période ${periodNumber}` },
    { view: "month", label: "Mois cumulé" },
  ];

  return (
    <div className="inline-flex rounded-xl border border-border bg-surface p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.view}
          href={`${basePath}?view=${tab.view}`}
          className={cn(
            "rounded-lg px-4 py-2 text-xs font-semibold transition-all",
            active === tab.view
              ? "bg-gradient-to-b from-accent to-accent-hover text-white shadow-[0_2px_8px_-2px_rgb(56_189_248/0.6)]"
              : "text-muted hover:text-foreground"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
