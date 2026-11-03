import { Wallet, Check, Gift, Ban, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatUsdEn, PLATFORM_FEE_PCT } from "@/lib/currency";
import { Card } from "@/components/ui/Card";
import { PageHeader, SectionTitle, EmptyState } from "@/components/ui/PageHeader";

const RANGE_FMT = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" });
const PAID_FMT = new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatRange(start: string, end: string): string {
  const d = (s: string) => {
    const [y, m, day] = s.split("-").map(Number);
    return new Date(y!, m! - 1, day!);
  };
  return `${RANGE_FMT.format(d(start))} → ${RANGE_FMT.format(d(end))}`;
}

/**
 * Historique de ce qui a ete verse au chatter. Les bonus et sanctions des
 * periodes passees n'etaient visibles nulle part cote chatter : seule la
 * periode en cours apparaissait, ce qui en faisait une source de contestation.
 */
export default async function PaiementsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const chatterId = user!.id;

  const [{ data: payouts }, { data: bonuses }, { data: warnings }, { data: sanctions }] = await Promise.all([
    supabase
      .from("payouts")
      .select("id, period_start, period_end, revenue_usd, fee_usd, net_revenue_usd, commission_usd, bonus_usd, sanction_usd, net_usd, hours, paid_at")
      .eq("chatter_id", chatterId)
      .order("period_start", { ascending: false })
      .limit(24),
    supabase
      .from("bonuses")
      .select("id, period_start, period_end, amount_usd, reason")
      .eq("chatter_id", chatterId)
      .order("period_start", { ascending: false })
      .limit(20),
    supabase
      .from("warnings")
      .select("id, reason, created_at")
      .eq("chatter_id", chatterId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("sanctions")
      .select("id, period_start, period_end, amount_usd, reason")
      .eq("chatter_id", chatterId)
      .order("period_start", { ascending: false })
      .limit(20),
  ]);

  const usd = (n: number | string) => formatUsdEn(Number(n));
  const totalPaid = (payouts ?? []).reduce((s, p) => s + Number(p.net_usd), 0);

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <PageHeader title="My payments" subtitle="What's been paid to you, period by period." />

      {(payouts ?? []).length > 0 && (
        <Card className="border-accent/30 bg-gradient-to-br from-accent/12 via-surface to-surface">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Wallet size={14} />
            </span>
            <span className="text-xs font-medium uppercase tracking-wide text-muted">Total paid</span>
          </div>
          <p className="mt-2 text-3xl font-bold tabular-nums leading-none text-foreground">{usd(totalPaid)}</p>
          <p className="mt-1.5 text-xs text-muted">
            across {(payouts ?? []).length} closed period{(payouts ?? []).length > 1 ? "s" : ""}
          </p>
        </Card>
      )}

      <div>
        <SectionTitle>Payments</SectionTitle>
        <div className="mt-3 space-y-2">
          {(payouts ?? []).map((p) => (
            <Card key={p.id} className="!p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {formatRange(p.period_start, p.period_end)}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-success">
                    <Check size={12} /> Paid on {PAID_FMT.format(new Date(p.paid_at))}
                  </p>
                </div>
                <p className="shrink-0 text-lg font-bold tabular-nums text-foreground">{usd(p.net_usd)}</p>
              </div>
              {/* Le detail brut -> frais -> net est indispensable : sans lui, un
                  chatter a 12 % lit une commission qui vaut 9,6 % de son CA
                  declare et croit a une erreur de taux. */}
              <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted">
                {usd(p.revenue_usd)} reported revenue
                {Number(p.fee_usd) > 0 && (
                  <>
                    {" "}− {usd(p.fee_usd)} {PLATFORM_FEE_PCT}% fee ={" "}
                    <span className="font-medium text-foreground">{usd(p.net_revenue_usd)}</span> net
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-muted">
                {Number(p.hours).toFixed(1)} h · commission {usd(p.commission_usd)}
                {Number(p.bonus_usd) > 0 && <span className="text-success"> · +{usd(p.bonus_usd)} bonus</span>}
                {Number(p.sanction_usd) > 0 && <span className="text-danger"> · -{usd(p.sanction_usd)} penalty</span>}
              </p>
            </Card>
          ))}
          {(payouts ?? []).length === 0 && (
            <EmptyState>
              No closed payment yet. Your current period is visible on the Dashboard.
            </EmptyState>
          )}
        </div>
      </div>

      {(bonuses ?? []).length > 0 && (
        <div>
          <SectionTitle>
            <span className="flex items-center gap-1.5">
              <Gift size={14} className="text-success" /> Bonuses received
            </span>
          </SectionTitle>
          <div className="mt-3 space-y-2">
            {(bonuses ?? []).map((b) => (
              <div key={b.id} className="rounded-xl border border-border bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{b.reason}</p>
                    <p className="mt-0.5 text-xs text-muted">{formatRange(b.period_start, b.period_end)}</p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-success">+{usd(b.amount_usd)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(warnings ?? []).length > 0 && (
        <div>
          <SectionTitle>
            <span className="flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-warning" /> Warnings
            </span>
          </SectionTitle>
          <div className="mt-3 space-y-2">
            {(warnings ?? []).map((w) => (
              <div key={w.id} className="rounded-xl border border-border bg-surface px-4 py-3">
                <p className="text-sm text-foreground">{w.reason}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {new Date(w.created_at).toLocaleDateString("en-US", { timeZone: "Europe/Paris" })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(sanctions ?? []).length > 0 && (
        <div>
          <SectionTitle>
            <span className="flex items-center gap-1.5">
              <Ban size={14} className="text-danger" /> Penalties
            </span>
          </SectionTitle>
          <div className="mt-3 space-y-2">
            {(sanctions ?? []).map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-surface px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">{s.reason}</p>
                    <p className="mt-0.5 text-xs text-muted">{formatRange(s.period_start, s.period_end)}</p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-danger">-{usd(s.amount_usd)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
