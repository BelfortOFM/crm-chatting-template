import { createClient } from "@/lib/supabase/server";
import { fetchAgencyLeaderboard, type LeaderboardView } from "@/lib/leaderboard";
import { ChatterLeaderboardTable } from "@/components/leaderboard/ChatterLeaderboardTable";
import { ChatterViewToggle } from "@/components/leaderboard/ChatterViewToggle";

export default async function ChatterLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const activeView: LeaderboardView = view === "month" ? "month" : "period";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("agency_id").eq("id", user!.id).single();

  const { rows, periodNumber } = await fetchAgencyLeaderboard(supabase, profile!.agency_id, activeView);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted">All of the agency's chatters, ranked by revenue generated.</p>
      </div>

      <ChatterViewToggle basePath="/leaderboard" active={activeView} periodNumber={periodNumber} />

      <ChatterLeaderboardTable rows={rows} highlightId={user!.id} />
    </div>
  );
}
