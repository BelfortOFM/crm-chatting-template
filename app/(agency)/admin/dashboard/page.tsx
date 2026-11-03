import Link from "next/link";
import { Users, Clapperboard, ArrowRight, PiggyBank, TrendingUp, Wallet } from "lucide-react";
import { getSupabase, getSessionProfile } from "@/lib/session";
import { fetchAgencyLeaderboard } from "@/lib/leaderboard";
import { formatUsd } from "@/lib/currency";
import { fetchPayroll, computeTotals, periodOption } from "@/lib/payroll";
import { getPeriodForDate } from "@/lib/period";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/StatCard";
import { LeaderboardTable } from "@/components/leaderboard/LeaderboardTable";
import { Card } from "@/components/ui/Card";
import { PageHeader, SectionTitle } from "@/components/ui/PageHeader";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

const MONTH_FMT = new Intl.DateTimeFormat("fr-FR", { month: "short" });

interface ModelRevenueRow {
  model_name: string;
  platform: string;
  revenue_usd: number | string;
  hours: number | string;
}

interface LtvRow {
  revenue_usd: number | string;
  subscribers: number | string;
  ltv_usd: number | string;
  models_counted: number | string;
  models_total: number | string;
}

interface HistoryRow {
  month: string;
  revenue_usd: number | string;
  hours: number | string;
}

export default async function AdminDashboardPage() {
  // Session et profil déjà résolus par le layout : cet appel réutilise le
  // même résultat au lieu de refaire deux allers-retours vers Supabase.
  const [supabase, session] = await Promise.all([getSupabase(), getSessionProfile()]);
  const agencyId = session!.agencyId;

  const now = new Date();
  const current = getPeriodForDate(now);
  const period = periodOption(now.getFullYear(), now.getMonth() + 1, current.periodNumber);

  const [
    { count: chatterCount },
    { count: modelCount },
    payroll,
    { data: modelRows },
    { data: historyRows },
    { data: ltvRows },
    { rows, periodNumber },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "chatter").eq("active", true),
    supabase.from("models").select("id", { count: "exact", head: true }).eq("active", true),
    fetchPayroll(supabase, agencyId, period.start, period.end),
    supabase.rpc("fn_agency_model_revenue", {
      p_agency_id: agencyId,
      p_period_start: period.start,
      p_period_end: period.end,
    }),
    supabase.rpc("fn_agency_monthly_history", { p_agency_id: agencyId, p_months: 6 }),
    supabase.rpc("fn_agency_ltv", {
      p_agency_id: agencyId,
      p_period_start: period.start,
      p_period_end: period.end,
    }),
    // Le classement partait en série après ce bloc : un aller-retour de plus
    // pour rien, il ne dépend d'aucun des résultats ci-dessus.
    fetchAgencyLeaderboard(supabase, agencyId, "period"),
  ]);
  const totals = computeTotals(payroll);
  const usd = (amount: number) => formatUsd(amount);

  const models = ((modelRows ?? []) as ModelRevenueRow[])
    .map((m) => ({ ...m, revenue: Number(m.revenue_usd), hours: Number(m.hours) }))
    .filter((m) => m.revenue > 0);
  const modelMax = models[0]?.revenue ?? 0;

  // LTV : CA NET (apres frais de plateforme) rapporte aux abonnes des modeles
  // pour lesquels un releve existe. Les modeles sans releve sont exclus des
  // deux cotes du ratio, sinon leur chiffre d'affaires gonflerait la valeur
  // sans audience en face.
  const ltv = ((ltvRows ?? []) as LtvRow[])[0];
  const ltvUsd = Number(ltv?.ltv_usd ?? 0);
  const subscribers = Number(ltv?.subscribers ?? 0);
  const modelsCounted = Number(ltv?.models_counted ?? 0);
  const modelsTotal = Number(ltv?.models_total ?? 0);

  const history = ((historyRows ?? []) as HistoryRow[]).map((h) => ({
    month: new Date(h.month),
    revenue: Number(h.revenue_usd),
  }));
  const historyMax = Math.max(...history.map((h) => h.revenue), 0.01);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard agence"
        subtitle={`Période ${periodNumber} en cours · ${period.label}`}
      />

      {/* Les 4 chiffres qui disent si l'agence tourne : ce qu'elle encaisse,
          ce qu'elle reverse, ce qu'il lui reste, et le rendement horaire. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="CA de la période" icon={<TrendingUp size={14} />} value={usd(totals.revenueUsd)} tone="info" />
        <StatCard
          label="À verser"
          icon={<Wallet size={14} />}
          value={usd(totals.netUsd)}
          tone="accent"
          sub={
            totals.unpaidCount > 0 ? (
              <Link href="/admin/paie" className="text-accent hover:underline">
                {totals.unpaidCount} en attente →
              </Link>
            ) : (
              "période soldée"
            )
          }
        />
        <StatCard
          label="Marge agence"
          icon={<PiggyBank size={14} />}
          value={usd(totals.marginUsd)}
          tone="success"
          sub={`${totals.marginPct.toFixed(1)} % du CA net`}
        />
        <StatCard
          label="LTV par abonné"
          icon={<Users size={14} />}
          tone="warning"
          value={subscribers > 0 ? usd(ltvUsd) : "—"}
          sub={
            subscribers > 0 ? (
              <>
                {subscribers.toLocaleString("fr-FR")} abonnés
                {modelsCounted < modelsTotal && (
                  <Link href="/admin/models" className="ml-1 text-warning hover:underline">
                    · {modelsTotal - modelsCounted} modèle
                    {modelsTotal - modelsCounted > 1 ? "s" : ""} sans relevé
                  </Link>
                )}
              </>
            ) : (
              <Link href="/admin/models" className="text-accent hover:underline">
                Renseigne les abonnés →
              </Link>
            )
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard label="Chatters actifs" icon={<Users size={14} />} value={chatterCount ?? 0} tone="info" />
        <StatCard label="Modèles actifs" icon={<Clapperboard size={14} />} value={modelCount ?? 0} tone="accent" />
      </div>

      {/* Tendance : sans historique, un decrochage ne se voit qu'une fois
          le mois termine, donc trop tard pour reagir. */}
      <Card>
        <SectionTitle>Tendance sur 6 mois</SectionTitle>
        <div className="mt-4 flex items-end justify-between gap-2">
          {history.map((h, i) => {
            const isCurrent = i === history.length - 1;
            return (
              <div key={h.month.toISOString()} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] font-medium tabular-nums text-muted">
                  {h.revenue > 0 ? formatUsd(h.revenue).replace(/,\d+/, "") : "—"}
                </span>
                <div className="flex h-24 w-full items-end rounded-md bg-surface-2/35 p-0.5 ring-1 ring-inset ring-border/40">
                  <div
                    className={cn(
                      "w-full rounded-[3px] transition-all",
                      isCurrent ? "bg-gradient-to-t from-info via-sky-500 to-accent" : "bg-info/35"
                    )}
                    style={{ height: `${Math.max(3, (h.revenue / historyMax) * 100)}%` }}
                  />
                </div>
                <span className={cn("text-[10px] font-semibold uppercase", isCurrent ? "text-accent" : "text-muted")}>
                  {MONTH_FMT.format(h.month)}
                </span>
              </div>
            );
          })}
        </div>
      </Card>

      <NotificationsPanel vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <SectionTitle>Classement — Période {periodNumber}</SectionTitle>
            <Link
              href="/admin/leaderboard"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-accent transition-opacity hover:opacity-80"
            >
              Tout voir <ArrowRight size={13} />
            </Link>
          </div>
          <div className="mt-4">
            <LeaderboardTable rows={rows.slice(0, 5)} />
          </div>
        </Card>

        <Card>
          <SectionTitle>CA par modèle — Période {periodNumber}</SectionTitle>
          <div className="mt-4 space-y-3">
            {models.map((m) => (
              <div key={m.model_name}>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate pr-3 text-foreground">{m.model_name}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">
                    {usd(m.revenue)}
                    {m.hours > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-muted">
                        {formatUsd(m.revenue / m.hours)}/h
                      </span>
                    )}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-info to-info/50"
                    style={{ width: `${modelMax > 0 ? (m.revenue / modelMax) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
            {models.length === 0 && <p className="text-sm text-muted">Aucune vente sur cette période.</p>}
          </div>
        </Card>
      </div>

    </div>
  );
}
