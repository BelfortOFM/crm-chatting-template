import { Target, Wallet, TrendingUp, Trophy, Crown, Gauge } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getPeriodForDate, getPreviousPeriod, toDateString } from "@/lib/period";
import { formatAmountEn, formatUsdEn } from "@/lib/currency";
import { platformLabel } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { ProgressBar } from "@/components/dashboard/ProgressBar";
import { VariationBadge } from "@/components/dashboard/VariationBadge";

interface ModelLite {
  id: string;
  name: string;
  platform: string;
}

interface ModelLtvRpcRow {
  revenue_usd: number | string;
  subscribers: number | string;
  ltv_usd: number | string;
}

export default async function ChatterDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const chatterId = user!.id;

  const { data: myProfile } = await supabase.from("profiles").select("agency_id").eq("id", chatterId).single();
  const agencyId = myProfile!.agency_id;

  const now = new Date();
  const monthStart = toDateString(new Date(now.getFullYear(), now.getMonth(), 1));
  const today = toDateString(now);
  const period = getPeriodForDate(now);
  const periodStartStr = toDateString(period.start);
  const periodEndStr = toDateString(period.end);
  const previousPeriod = getPreviousPeriod(now);
  const prevPeriodStartStr = toDateString(previousPeriod.start);
  const prevPeriodEndStr = toDateString(previousPeriod.end);

  const [
    { data: summaryRows },
    { data: goal },
    { data: commissionRule },
    { data: bonuses },
    { data: sanctions },
    { data: periodRevenue },
    { data: leaderboard },
    { data: monthShifts },
    { data: modelLinks },
  ] = await Promise.all([
    supabase.rpc("fn_chatter_monthly_summary", { p_chatter_id: chatterId, p_month: monthStart }),
    // Son objectif = la somme de ce qui lui est confie sur chaque modele, pour
    // la periode en cours (monthly_goals a disparu au profit d'objectifs
    // portes par les comptes, au grain periode comme partout ailleurs).
    supabase
      .from("model_goal_allocations")
      .select("target_amount_usd")
      .eq("chatter_id", chatterId)
      .eq("period_start", periodStartStr)
      .eq("period_end", periodEndStr),
    supabase
      .from("commission_rules")
      .select("rate_percent")
      .eq("chatter_id", chatterId)
      .lte("valid_from", today)
      .or(`valid_to.is.null,valid_to.gte.${today}`)
      .order("valid_from", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("bonuses").select("amount_usd").eq("chatter_id", chatterId).eq("period_start", periodStartStr).eq("period_end", periodEndStr),
    supabase.from("sanctions").select("amount_usd").eq("chatter_id", chatterId).eq("period_start", periodStartStr).eq("period_end", periodEndStr),
    supabase.rpc("fn_chatter_period_revenue", {
      p_chatter_id: chatterId,
      p_period_start: periodStartStr,
      p_period_end: periodEndStr,
    }),
    supabase.rpc("fn_agency_leaderboard_month", { p_agency_id: agencyId, p_month: monthStart }),
    supabase
      .from("shift_entries")
      .select("model:models(name), sale_lines(amount)")
      .eq("chatter_id", chatterId)
      .gte("shift_date", monthStart),
    supabase
      .from("chatter_model_assignments")
      .select("model:models(id, name, platform)")
      .eq("chatter_id", chatterId)
      .is("assigned_to", null),
  ]);

  const myModels = ((modelLinks ?? []) as { model: ModelLite | ModelLite[] | null }[])
    .map((r) => (Array.isArray(r.model) ? (r.model[0] ?? null) : r.model))
    .filter((m): m is ModelLite => m !== null);

  const [ltvPrevRows, ltvCurRows, ltvTargetRows] = await Promise.all([
    Promise.all(
      myModels.map((m) =>
        supabase.rpc("fn_model_ltv", { p_model_id: m.id, p_period_start: prevPeriodStartStr, p_period_end: prevPeriodEndStr })
      )
    ),
    Promise.all(
      myModels.map((m) =>
        supabase.rpc("fn_model_ltv", { p_model_id: m.id, p_period_start: periodStartStr, p_period_end: today })
      )
    ),
    myModels.length > 0
      ? supabase
          .from("model_period_ltv_targets")
          .select("model_id, target_ltv_usd")
          .in("model_id", myModels.map((m) => m.id))
          .eq("period_start", periodStartStr)
          .eq("period_end", periodEndStr)
      : Promise.resolve({ data: [] as { model_id: string; target_ltv_usd: number }[] }),
  ]);

  const targetLtvByModel = new Map(
    (ltvTargetRows.data ?? []).map((t) => [t.model_id, Number(t.target_ltv_usd)])
  );

  const ltvByModel = myModels.map((model, i) => {
    const prev = (ltvPrevRows[i]?.data ?? [])[0] as ModelLtvRpcRow | undefined;
    const cur = (ltvCurRows[i]?.data ?? [])[0] as ModelLtvRpcRow | undefined;
    return {
      model,
      previousLtv: Number(prev?.ltv_usd ?? 0),
      previousSubs: Number(prev?.subscribers ?? 0),
      currentLtv: Number(cur?.ltv_usd ?? 0),
      currentSubs: Number(cur?.subscribers ?? 0),
      targetLtv: targetLtvByModel.get(model.id) ?? 0,
    };
  });

  // Postgres `numeric`/`bigint` are serialized as strings by PostgREST — coerce before doing arithmetic.
  // Every amount below is stored/computed in USD (devise unique, aucune conversion).
  const summary = summaryRows?.[0];
  const targetAmount = ((goal ?? []) as { target_amount_usd: number | string }[]).reduce(
    (sum, g) => sum + Number(g.target_amount_usd),
    0
  );
  const totalMonth = Number(summary?.total_month_usd ?? 0);
  const revenueThisPeriod = Number(periodRevenue ?? 0);
  // L'objectif porte sur la periode en cours : on le compare au CA de CETTE
  // periode (revenueThisPeriod), pas au cumul du mois — sinon un objectif de
  // periode paraitrait deja depasse des la premiere quinzaine.
  const pctReached = targetAmount > 0 ? (revenueThisPeriod / targetAmount) * 100 : 0;
  const remaining = Math.max(0, targetAmount - revenueThisPeriod);

  const commissionRate = Number(commissionRule?.rate_percent ?? 0);
  const salary = (commissionRate / 100) * revenueThisPeriod;
  const bonusTotal = (bonuses ?? []).reduce((s, b) => s + Number(b.amount_usd), 0);
  const sanctionTotal = (sanctions ?? []).reduce((s, sc) => s + Number(sc.amount_usd), 0);
  const totalPaid = salary + bonusTotal - sanctionTotal;

  const previousMonth = Number(summary?.previous_month_usd ?? 0);
  const variationPct = previousMonth > 0 ? ((totalMonth - previousMonth) / previousMonth) * 100 : null;

  // Devise unique USD : le CA de chaque modele se somme tel quel, sans
  // conversion, et le classement comme la largeur des barres sont en dollars.
  const modelTotals = new Map<string, number>();
  for (const shift of monthShifts ?? []) {
    const model = Array.isArray(shift.model) ? shift.model[0] : shift.model;
    if (!model) continue;
    const lines = shift.sale_lines as { amount: number | string }[];
    const native = lines.reduce((s, l) => s + Number(l.amount), 0);
    modelTotals.set(model.name, (modelTotals.get(model.name) ?? 0) + native);
  }
  const modelRanking = [...modelTotals.entries()].sort((a, b) => b[1] - a[1]);
  const modelMax = modelRanking[0]?.[1] ?? 0;

  const rows = (leaderboard ?? []) as { chatter_id: string; full_name: string; total_usd: number | string; rank: number | string }[];
  const myRank = rows.find((r) => r.chatter_id === chatterId);
  const topThree = rows.slice(0, 3);

  const usd = (amount: number) => formatUsdEn(amount);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">
          Period {period.periodNumber} in progress · {usd(totalMonth)} this month
        </p>
      </div>

      {/* Objectif : la carte héro du mobile, en gradient pour l'ancrer visuellement */}
      <Card className="relative overflow-hidden border-accent/30 bg-gradient-to-br from-accent/15 via-surface to-surface">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-accent/20 blur-3xl"
        />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Target size={14} />
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Goal · period {period.periodNumber}
            </span>
          </div>
          <p className="mt-3 text-3xl font-bold tabular-nums leading-none text-foreground">
            {usd(revenueThisPeriod)}
          </p>
          <p className="mt-1.5 text-sm text-muted">of {usd(targetAmount)}</p>
          <div className="mt-4">
            <ProgressBar value={pctReached} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-accent">{pctReached.toFixed(0)}% reached</span>
            <span className="text-muted">{usd(remaining)} left</span>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label={`Period ${period.periodNumber} pay`}
          icon={<Wallet size={14} />}
          value={usd(totalPaid)}
          sub={
            <>
              Commission {usd(salary)}
              {bonusTotal > 0 && <> · +{usd(bonusTotal)} bonus</>}
              {sanctionTotal > 0 && <> · -{usd(sanctionTotal)} penalty</>}
            </>
          }
        />
        <StatCard
          label="End-of-month forecast"
          icon={<TrendingUp size={14} />}
          value={usd(Number(summary?.forecast_usd ?? 0))}
          sub={
            <span className="flex items-center gap-1.5">
              vs last month <VariationBadge pct={variationPct} />
            </span>
          }
        />
      </div>

      {ltvByModel.length > 0 && (
        <Card>
          <SectionTitle>LTV per subscriber</SectionTitle>
          <div className="mt-4 space-y-4">
            {ltvByModel.map(({ model, previousLtv, previousSubs, currentLtv, currentSubs, targetLtv }) => {
              const pct = targetLtv > 0 ? (currentLtv / targetLtv) * 100 : 0;
              return (
                <div key={model.id} className="space-y-2 border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">{model.name}</span>
                    <span className="text-[10px] uppercase tracking-wide text-muted">
                      {platformLabel(model.platform)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>Period {previousPeriod.periodNumber} (past)</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {previousSubs > 0 ? `${usd(previousLtv)} / subscriber` : "—"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Gauge size={13} className="shrink-0 text-accent" />
                    <span className="flex-1 text-xs text-muted">
                      This period (P{period.periodNumber})
                      {currentSubs === 0 && previousSubs === 0 && " · no subscriber data yet"}
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground">
                      {currentSubs > 0 ? `${usd(currentLtv)} / subscriber` : "—"}
                    </span>
                  </div>

                  {targetLtv > 0 ? (
                    <>
                      <ProgressBar value={pct} />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-accent">{pct.toFixed(0)}% of goal</span>
                        <span className="text-muted">goal {usd(targetLtv)} / subscriber</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-[11px] text-muted">No LTV goal set for this period.</p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle>Performance by model (this month)</SectionTitle>
        <div className="mt-4 space-y-3">
          {modelRanking.map(([name, usdValue]) => (
            <div key={name}>
              <div className="flex items-center justify-between text-sm">
                <span className="truncate pr-3 text-foreground">{name}</span>
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {formatAmountEn(usdValue, "USD")}
                </span>
              </div>
              {/* Barre relative au meilleur modèle : comparaison lisible d'un coup d'œil */}
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-info to-info/50"
                  style={{ width: `${modelMax > 0 ? (usdValue / modelMax) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
          {modelRanking.length === 0 && <p className="text-sm text-muted">No sales this month.</p>}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <SectionTitle>
            <span className="flex items-center gap-1.5">
              <Trophy size={14} className="text-accent" /> Leaderboard (month)
            </span>
          </SectionTitle>
          {myRank && (
            <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
              You · #{myRank.rank}
            </span>
          )}
        </div>
        <div className="mt-3 space-y-2">
          {topThree.map((row, i) => (
            <div
              key={row.chatter_id}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                row.chatter_id === chatterId ? "bg-accent-soft text-accent" : "text-foreground"
              )}
            >
              <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-muted">
                {i === 0 ? <Crown size={14} className="mx-auto text-amber-300" /> : row.rank}
              </span>
              <span className="min-w-0 flex-1 truncate">{row.full_name}</span>
              <span className="shrink-0 font-semibold tabular-nums">{usd(Number(row.total_usd))}</span>
            </div>
          ))}
          {topThree.length === 0 && <p className="text-sm text-muted">Leaderboard is empty for now.</p>}
        </div>
      </Card>
    </div>
  );
}
