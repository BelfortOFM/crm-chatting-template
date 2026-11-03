import Link from "next/link";
import { Wallet, TrendingUp, Clock, PiggyBank, Download, Check, AlertTriangle, ClipboardList } from "lucide-react";
import { getSupabase, getSessionProfile } from "@/lib/session";
import { formatUsd, PLATFORM_FEE_PCT } from "@/lib/currency";
import { fetchPayroll, computeTotals, selectablePeriods, parsePeriodKey } from "@/lib/payroll";
import { fetchCaBreakdown, scopeRowsToModel } from "@/lib/payroll-platform";
import { paiePlatformConfig, periodPrefix, type PaiePlatform } from "@/lib/paie-platforms";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { PageHeader, SectionTitle, EmptyState } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { ClosePeriodButton, ReopenButton } from "./PayrollActions";
import { ModelFilter } from "./ModelFilter";

const PAID_FMT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });

/**
 * Page de paie OnlyFans : le calcul est filtre cote base via
 * fn_agency_payroll(p_platform), jamais proratise a l'affichage.
 */
export default async function PaieView({
  platform,
  p,
  model,
}: {
  platform: PaiePlatform;
  p?: string;
  model?: string;
}) {
  const config = paiePlatformConfig(platform)!;
  const scheme = config.scheme;
  const prefix = periodPrefix(scheme);

  const [supabase, session] = await Promise.all([getSupabase(), getSessionProfile()]);
  const agencyId = session!.agencyId;

  const now = new Date();
  const period = parsePeriodKey(p, now, scheme);
  const periods = selectablePeriods(now, 2, scheme);

  const [platformRows, breakdown] = await Promise.all([
    fetchPayroll(supabase, agencyId, period.start, period.end, platform),
    fetchCaBreakdown(supabase, agencyId, period.start, period.end),
  ]);

  // Modeles de cette plateforme ayant genere du CA sur la periode, pour le filtre.
  const platformModels = breakdown.models.filter((m) => m.platform === platform);

  // Vue par modele : on part de la paie de la plateforme (exacte, calculee en
  // base) et on la reduit au modele demande, prorata sur le CA. Un modele hors
  // de cette plateforme (URL bricolee) est ignore.
  const modelId = model && platformModels.some((m) => m.id === model) ? model : null;
  const rows = modelId ? scopeRowsToModel(platformRows, breakdown, platform, modelId) : platformRows;

  const totals = computeTotals(rows);

  // Un chatter sans taux est paye zero sans que rien ne le signale. On separe
  // le CA deja genere sans commission (de l'argent en jeu maintenant, a regler
  // avant de cloturer) du simple taux absent (rien a rattraper, mais la
  // prochaine declaration partira a zero).
  const uncovered = rows.filter((r) => r.uncoveredRevenueUsd > 0);
  const noRate = rows.filter((r) => r.active && !r.hasRate && r.uncoveredRevenueUsd === 0);
  const usd = (amount: number) => formatUsd(amount);

  const recapHref = `/admin/paie/recap?platform=${platform}&p=${period.key}&scheme=${scheme}`;
  const exportHref = `/admin/paie/export?start=${period.start}&end=${period.end}&platform=${platform}${modelId ? `&model=${modelId}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Paie ${config.label}`}
        subtitle="Ce qu'il y a à verser sur la période, chatter par chatter."
        action={
          <Link
            href={exportHref}
            prefetch={false}
            title="Télécharge le tableau de cette période, tel qu'affiché ci-dessous"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-surface-2 px-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-border"
          >
            <Download size={14} /> Export CSV
          </Link>
        }
      />

      {/* Selecteur de periode : hebdomadaire, P1-P4 du mois. */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {periods.slice(0, 12).map((opt) => {
          const active = opt.key === period.key;
          return (
            <Link
              key={opt.key}
              href={`/admin/paie/${platform}?p=${opt.key}${modelId ? `&model=${modelId}` : ""}`}
              className={cn(
                "flex min-h-10 shrink-0 items-center rounded-full px-3.5 text-xs font-medium transition-colors",
                active
                  ? "bg-gradient-to-r from-info/20 to-accent/25 text-foreground shadow-[inset_0_0_0_1px_rgb(56_189_248/0.45)]"
                  : "bg-surface text-muted hover:text-foreground"
              )}
            >
              {prefix}{opt.periodNumber} · {opt.label}
            </Link>
          );
        })}
      </div>

      {/* Filtre par modele, dans le perimetre de cette plateforme. */}
      <ModelFilter models={platformModels} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="CA net de la période"
          icon={<TrendingUp size={14} />}
          value={usd(totals.netRevenueUsd)}
          tone="info"
          sub={`${usd(totals.revenueUsd)} brut − ${usd(totals.feeUsd)} de frais`}
        />
        <StatCard
          label="À verser"
          icon={<Wallet size={14} />}
          value={usd(totals.netUsd)}
          tone="accent"
          sub={`${totals.paidCount} payé${totals.paidCount > 1 ? "s" : ""} · ${totals.unpaidCount} en attente`}
        />
        <StatCard
          label="Marge agence"
          icon={<PiggyBank size={14} />}
          value={usd(totals.marginUsd)}
          tone="success"
          sub={`${totals.marginPct.toFixed(1)} % du CA net`}
        />
        <StatCard
          label="Heures déclarées"
          icon={<Clock size={14} />}
          tone="warning"
          value={`${totals.hours.toFixed(0)} h`}
          sub={totals.hours > 0 ? `${formatUsd(totals.netRevenueUsd / totals.hours)}/h net en moyenne` : undefined}
        />
      </div>

      {(uncovered.length > 0 || noRate.length > 0) && (
        <Card className="border-warning/40 bg-warning/5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
            <div className="min-w-0 space-y-2 text-sm">
              {uncovered.length > 0 && (
                <p className="text-foreground">
                  <strong>Du CA ne rapporte aucune commission sur cette période.</strong>{" "}
                  Aucun taux ne couvre les dates concernées, la commission vaut donc 0 :{" "}
                  {uncovered.map((r, i) => (
                    <span key={r.chatterId}>
                      {i > 0 && ", "}
                      <Link href={`/admin/chatters/${r.chatterId}`} className="text-accent hover:underline">
                        {r.fullName}
                      </Link>{" "}
                      ({usd(r.uncoveredRevenueUsd)})
                    </span>
                  ))}
                  . À régler avant de clôturer la paie.
                </p>
              )}
              {noRate.length > 0 && (
                <p className="text-muted">
                  Sans taux de commission, leur prochaine déclaration sera payée zéro :{" "}
                  {noRate.map((r, i) => (
                    <span key={r.chatterId}>
                      {i > 0 && ", "}
                      <Link href={`/admin/chatters/${r.chatterId}`} className="text-accent hover:underline">
                        {r.fullName}
                      </Link>
                    </span>
                  ))}
                  .
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionTitle>
              {prefix}{period.periodNumber} · {period.label}
            </SectionTitle>
            <p className="mt-1 text-xs text-muted">
              Les {PLATFORM_FEE_PCT} % de frais de plateforme sont retirés de chaque vente, puis la
              commission s&apos;applique sur le CA net, au taux en vigueur le jour de chaque shift —
              jamais rétroactivement. Cette page ne couvre que {config.label}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={recapHref}
              className="flex min-h-10 items-center gap-1.5 rounded-xl bg-surface-2 px-3.5 text-sm font-medium text-foreground ring-1 ring-inset ring-border transition-colors hover:bg-border"
            >
              <ClipboardList size={15} /> Vérifier le récapitulatif
            </Link>
            {/* La cloture fige la paie de la PLATEFORME entiere : en vue par
                modele on ne l'expose pas, pour ne pas laisser croire qu'on ne
                cloture qu'un modele. */}
            {modelId ? (
              <Link
                href={`/admin/paie/${platform}?p=${period.key}`}
                className="flex min-h-10 items-center gap-1.5 rounded-xl bg-surface-2 px-3.5 text-sm font-medium text-muted ring-1 ring-inset ring-border transition-colors hover:text-foreground"
              >
                Voir toute la plateforme pour clôturer
              </Link>
            ) : (
              <ClosePeriodButton
                periodStart={period.start}
                periodEnd={period.end}
                platform={platform}
                unpaidCount={totals.unpaidCount}
              />
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState>Aucun chatter concerné par cette période.</EmptyState>
        ) : (
          <>
            {/* Mobile : une carte par chatter. Le tableau devient illisible
                sous 640px, or l'admin consulte aussi depuis son telephone. */}
            <div className="space-y-2 sm:hidden">
              {rows.map((r) => (
                <div key={r.chatterId} className="rounded-xl border border-border bg-surface-2/40 p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">
                        <Link
                          href={`/admin/chatters/${r.chatterId}`}
                          className="hover:text-accent"
                        >
                          {r.fullName}
                        </Link>
                        {!r.active && (
                          <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">
                            parti
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        <span className="font-medium text-info">{usd(r.netRevenueUsd)}</span> net · {r.hours.toFixed(1)} h ·{" "}
                        {r.hours > 0 ? `${formatUsd(r.usdPerHour)}/h` : "—"}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("tnum font-bold", r.netUsd === 0 ? "text-muted" : "text-accent")}>{usd(r.netUsd)}</p>
                      {r.paidAt ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
                          <Check size={11} /> {PAID_FMT.format(new Date(r.paidAt))}
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">{r.netUsd === 0 ? "—" : "à verser"}</span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 border-t border-border/60 pt-2 text-xs text-muted">
                    {r.revenueUsd > 0 && (
                      <span className="mr-1.5 block text-[11px] opacity-80">
                        {usd(r.revenueUsd)} brut − {usd(r.feeUsd)} de frais
                      </span>
                    )}
                    Commission {usd(r.commissionUsd)}{" "}
                    {r.uncoveredRevenueUsd > 0 ? (
                      <span className="font-medium text-warning">(sans taux)</span>
                    ) : (
                      <>({r.effectiveRate}%)</>
                    )}
                    {r.bonusUsd > 0 && <span className="text-success"> · +{usd(r.bonusUsd)}</span>}
                    {r.sanctionUsd > 0 && <span className="text-danger"> · -{usd(r.sanctionUsd)}</span>}
                  </p>
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                    <th className="pb-2 font-medium">Chatter</th>
                    <th className="pb-2 text-right font-medium">CA brut</th>
                    <th className="pb-2 text-right font-medium">Frais {PLATFORM_FEE_PCT}%</th>
                    <th className="pb-2 text-right font-medium">CA net</th>
                    <th className="pb-2 text-right font-medium">Heures</th>
                    <th className="pb-2 text-right font-medium">$/h</th>
                    <th className="pb-2 text-right font-medium">Commission</th>
                    <th className="pb-2 text-right font-medium">Bonus</th>
                    <th className="pb-2 text-right font-medium">Sanction</th>
                    <th className="pb-2 text-right font-medium">Net</th>
                    <th className="pb-2 text-right font-medium">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.chatterId} className="border-b border-border/40 transition-colors last:border-0 hover:bg-surface-2/40">
                      <td className="py-2.5">
                        <Link
                          href={`/admin/chatters/${r.chatterId}`}
                          className="font-medium text-foreground hover:text-accent"
                        >
                          {r.fullName}
                        </Link>
                        {!r.active && (
                          <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">
                            parti
                          </span>
                        )}
                      </td>
                      <td className="tnum py-2.5 text-right text-muted">{r.revenueUsd === 0 ? "—" : usd(r.revenueUsd)}</td>
                      <td className="tnum py-2.5 text-right text-danger/70">{r.feeUsd === 0 ? "—" : `-${usd(r.feeUsd)}`}</td>
                      <td className={cn("tnum py-2.5 text-right font-medium", r.netRevenueUsd === 0 ? "text-muted" : "text-info")}>{usd(r.netRevenueUsd)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted">{r.hours.toFixed(1)}</td>
                      <td className="py-2.5 text-right tabular-nums text-muted">
                        {r.hours > 0 ? formatUsd(r.usdPerHour) : "—"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-foreground">
                        {usd(r.commissionUsd)}
                        {r.uncoveredRevenueUsd > 0 ? (
                          <span
                            title={`${usd(r.uncoveredRevenueUsd)} de CA net sans taux de commission`}
                            className="ml-1 cursor-help text-xs font-medium text-warning"
                          >
                            sans taux
                          </span>
                        ) : (
                          <span className="ml-1 text-xs text-muted">{r.effectiveRate}%</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-success">
                        {r.bonusUsd > 0 ? usd(r.bonusUsd) : "—"}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-danger">
                        {r.sanctionUsd > 0 ? usd(r.sanctionUsd) : "—"}
                      </td>
                      <td className={cn("tnum py-2.5 text-right font-bold", r.netUsd === 0 ? "text-muted" : "text-accent")}>{usd(r.netUsd)}</td>
                      <td className="py-2.5 text-right">
                        {r.paidAt ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                              <Check size={12} /> {PAID_FMT.format(new Date(r.paidAt))}
                            </span>
                            <ReopenButton
                              chatterId={r.chatterId}
                              periodStart={period.start}
                              periodEnd={period.end}
                              platform={platform}
                            />
                          </span>
                        ) : (
                          <span className="text-xs text-muted">{r.netUsd === 0 ? "—" : "à verser"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-semibold">
                    <td className="pt-2.5 text-foreground">Total</td>
                    <td className="tnum pt-2.5 text-right text-muted">{usd(totals.revenueUsd)}</td>
                    <td className="tnum pt-2.5 text-right text-danger/70">-{usd(totals.feeUsd)}</td>
                    <td className="tnum pt-2.5 text-right font-bold text-info">{usd(totals.netRevenueUsd)}</td>
                    <td className="pt-2.5 text-right tabular-nums text-muted">{totals.hours.toFixed(1)}</td>
                    <td colSpan={4} />
                    <td className="pt-2.5 text-right tabular-nums text-accent">{usd(totals.netUsd)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
