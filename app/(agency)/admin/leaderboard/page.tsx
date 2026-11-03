import { getSupabase, getSessionProfile } from "@/lib/session";
import { fetchAgencyLeaderboard, type LeaderboardView } from "@/lib/leaderboard";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { ViewToggle } from "@/components/leaderboard/ViewToggle";

export default async function AdminLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const activeView: LeaderboardView = view === "month" ? "month" : "period";

  const [supabase, session] = await Promise.all([getSupabase(), getSessionProfile()]);

  const { rows, periodNumber } = await fetchAgencyLeaderboard(supabase, session!.agencyId, activeView);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Classement</h1>
        <p className="mt-1 text-sm text-muted">Vue agence complète, triée par CA généré.</p>
      </div>

      <ViewToggle basePath="/admin/leaderboard" active={activeView} periodNumber={periodNumber} />

      <LeaderboardTable rows={rows} />
    </div>
  );
}
