import Link from "next/link";
import { cn } from "@/lib/utils";
import type { LeaderboardView } from "@/lib/leaderboard";

/** English copy of ViewToggle, for the chatter-facing leaderboard page. */
export function ChatterViewToggle({
  basePath,
  active,
  periodNumber,
}: {
  basePath: string;
  active: LeaderboardView;
  periodNumber: number;
}) {
  const tabs: { view: LeaderboardView; label: string }[] = [
    { view: "period", label: `Period ${periodNumber}` },
    { view: "month", label: "Month to date" },
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
