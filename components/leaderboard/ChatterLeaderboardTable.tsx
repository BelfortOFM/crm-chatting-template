import { formatUsdEn } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { LeaderboardRow } from "@/lib/leaderboard";

// Podium tints for ranks 1-3; everyone else gets the neutral treatment.
const RANK_STYLES: Record<number, string> = {
  1: "bg-amber-400/15 text-amber-300 ring-1 ring-inset ring-amber-400/30",
  2: "bg-slate-300/10 text-slate-300 ring-1 ring-inset ring-slate-300/25",
  3: "bg-orange-400/10 text-orange-300 ring-1 ring-inset ring-orange-400/25",
};

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** English copy of LeaderboardTable, for the chatter-facing leaderboard page. */
export function ChatterLeaderboardTable({
  rows,
  highlightId,
}: {
  rows: LeaderboardRow[];
  highlightId?: string;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const rank = Number(row.rank);
        const isMe = row.chatter_id === highlightId;
        return (
          <div
            key={row.chatter_id}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-3",
              isMe && "border-accent/60 bg-accent-soft shadow-[0_0_16px_-6px_rgb(56_189_248/0.6)]"
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                RANK_STYLES[rank] ?? "bg-surface-2 text-muted"
              )}
            >
              {rank}
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted">
              {initials(row.full_name)}
            </span>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm font-medium",
                isMe ? "text-accent" : "text-foreground"
              )}
            >
              {row.full_name}
              {isMe && <span className="ml-1.5 text-[10px] font-semibold uppercase text-accent/80">you</span>}
            </span>
            <span className="shrink-0 font-bold tabular-nums text-foreground">
              {formatUsdEn(Number(row.total_usd))}
            </span>
          </div>
        );
      })}
      {rows.length === 0 && <p className="text-sm text-muted">No data yet.</p>}
    </div>
  );
}
