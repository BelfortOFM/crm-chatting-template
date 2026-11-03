import Link from "next/link";
import { ArrowLeft, Radar, AlertTriangle, Lock } from "lucide-react";
import { getSupabase, getSessionProfile } from "@/lib/session";
import { buildRecap } from "@/lib/recap";
import { parsePeriodKey } from "@/lib/payroll";
import { PAIE_PLATFORMS, paiePlatformConfig, periodPrefix } from "@/lib/paie-platforms";
import { formatUsd } from "@/lib/currency";
import { Card } from "@/components/ui/Card";
import { PageHeader, EmptyState, SectionTitle } from "@/components/ui/PageHeader";
import { RecapTable } from "./RecapTable";
import { InflowwImport } from "./InflowwImport";
import { PaieAnalyse } from "./PaieAnalyse";

/**
 * Recapitulatif avant versement.
 *
 * L'ecran ou l'on verifie avant d'engager de l'argent : l'ecart entre ce que le
 * chatter a declare et ce que l'import Infloww a trace, et les primes.
 */
export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; platform?: string }>;
}) {
  const { p, platform } = await searchParams;
  const [supabase, session] = await Promise.all([getSupabase(), getSessionProfile()]);
  const agencyId = session!.agencyId;

  // Le recap est toujours atteint depuis une page de paie : plateforme connue.
  // Un code inconnu (lien ancien) retombe sur OnlyFans.
  const config = paiePlatformConfig(platform ?? "") ?? PAIE_PLATFORMS[0]!;
  const resolvedPlatform = config.code;
  const prefix = periodPrefix(config.scheme);

  const period = parsePeriodKey(p, new Date(), config.scheme);
  const periodLabel = `${prefix}${period.periodNumber} · ${period.label}`;
  const periodRange = `${period.start}|${period.end}`;

  const [recap, { data: chatterRows }, { count: inflowwCount }] = await Promise.all([
    buildRecap(supabase, agencyId, period.start, period.end, resolvedPlatform),
    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("agency_id", agencyId)
      .eq("role", "chatter")
      .order("full_name"),
    // L'import Infloww ne couvre qu'OnlyFans : inutile de compter ailleurs.
    supabase
      .from("infloww_period_stats")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("period_start", period.start)
      .eq("period_end", period.end),
  ]);

  const chatterOptions = ((chatterRows ?? []) as { id: string; full_name: string | null }[]).map(
    (c) => ({ id: c.id, fullName: c.full_name ?? "—" })
  );

  const payable = recap.rows.filter((r) => r.totalUsd !== 0 || r.declaredUsd > 0);

  // OnlyFans n'a aucune source automatique (Infloww n'ouvre pas sa clé API,
  // cf. lib/infloww.ts) : sans l'import, le "tracké" et donc tout le récap
  // reposeraient sur du vide. On verrouille le reste de la page tant qu'aucun
  // import n'existe pour CETTE période — un import plus ancien ne compte pas,
  // les ventes bougent d'une période à l'autre.
  const importRequired = resolvedPlatform === "onlyfans";
  const hasImport = (inflowwCount ?? 0) > 0;
  const locked = importRequired && !hasImport;

  return (
    <div className="space-y-5">
      <div>
        <Link
          href={`/admin/paie/${resolvedPlatform}?p=${period.key}`}
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} /> Paie {config.label}
        </Link>
      </div>

      <PageHeader
        title={`Récapitulatif ${config.label}`}
        subtitle={`${periodLabel} — à vérifier avant de verser.`}
      />

      {importRequired && (
        <InflowwImport
          periodRange={periodRange}
          chatters={chatterOptions}
          existingCount={inflowwCount ?? 0}
        />
      )}

      {locked ? (
        <Card className="flex items-start gap-3 border-dashed">
          <Lock size={18} className="mt-0.5 shrink-0 text-muted" />
          <div className="text-sm">
            <p className="font-medium text-foreground">Récapitulatif verrouillé</p>
            <p className="mt-0.5 text-xs text-muted">
              Dépose l&apos;export Infloww de cette période ci-dessus pour débloquer les chiffres —
              sans lui, il n&apos;y a rien à comparer au déclaré.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <PaieAnalyse periodRange={periodRange} periodLabel={periodLabel} platform={resolvedPlatform} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Total à verser</p>
          <p className="tnum mt-1.5 text-2xl font-bold text-accent">{formatUsd(recap.totalUsd)}</p>
          <p className="text-xs text-muted">
            {payable.length} chatter{payable.length > 1 ? "s" : ""} concerné{payable.length > 1 ? "s" : ""}
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Déclaré</p>
          <p className="tnum mt-1.5 text-2xl font-bold text-foreground">
            {formatUsd(payable.reduce((s, r) => s + r.declaredUsd, 0))}
          </p>
          <p className="text-xs text-muted">chiffre d&apos;affaires brut saisi</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Tracké</p>
          <p className="tnum mt-1.5 text-2xl font-bold text-foreground">
            {formatUsd(payable.reduce((s, r) => s + (r.trackedUsd ?? 0), 0))}
          </p>
          <p className="text-xs text-muted">{recap.sources.infloww ? "Infloww" : "aucune source"}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Non vérifiable</p>
          <p className="tnum mt-1.5 text-2xl font-bold text-warning">
            {formatUsd(payable.reduce((s, r) => s + r.declaredUncheckableUsd, 0))}
          </p>
          <p className="text-xs text-muted">déclaré sans suivi possible</p>
        </Card>
      </div>

      {/* CA importe qu'aucun chatteur ne recupere : soit non assigne cote
          Infloww, soit un employe Infloww pas encore relie a un de nos
          chatteurs. Ca n'entre dans le tracke de personne ; le taire le
          rendrait invisible apres l'import. */}
      {recap.unassignedInflowwUsd > 0 && (
        <Card className="flex items-start gap-3 border-warning/40 bg-warning/5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {formatUsd(recap.unassignedInflowwUsd)} de CA Infloww non rattaché à un chatteur
            </p>
            <p className="mt-0.5 text-xs text-muted">
              Ce chiffre est bien dans Infloww mais n&apos;entre dans le tracké de personne — deux
              causes possibles : un employé Infloww pas encore relié à l&apos;un de tes chatteurs
              (relie-le après l&apos;import, ci-dessus), ou une vente qu&apos;Infloww n&apos;a
              attribuée à aucun employé (à réattribuer côté Infloww, puis ré-importe).
            </p>
          </div>
        </Card>
      )}

      {/* Sans cet avertissement, l'ecart d'un chatter travaillant sur un modele
          non relie se lirait comme une fraude, alors que rien ne le verifie. */}
      {recap.unconnectedModels.length > 0 && (
        <Card className="flex items-start gap-3 border-warning/40 bg-warning/5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {recap.unconnectedModels.length > 1 ? "Modèles" : "Modèle"} pas encore relié
              {recap.unconnectedModels.length > 1 ? "s" : ""} à leur suivi
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {recap.unconnectedModels
                .map((m) => `${m.name} → Infloww`)
                .join(" · ")}
              . Le chiffre déclaré dessus n&apos;est comparable à rien : il est compté dans « non
              vérifiable » et exclu de l&apos;écart, pour ne pas faire passer un chatter pour un
              surdéclarant sans raison. Relie-les depuis{" "}
              <Link href="/admin/models" className="text-accent hover:underline">
                la page Modèles
              </Link>{" "}
              et ils rentreront d&apos;eux-mêmes dans le périmètre vérifiable.
            </p>
          </div>
        </Card>
      )}

      {payable.length === 0 ? (
        <EmptyState>Aucun chiffre déclaré ni montant à verser sur cette période.</EmptyState>
      ) : (
        <>
          <div>
            <SectionTitle>Chatter par chatter</SectionTitle>
            <p className="mt-1 text-xs text-muted">
              Déplie une ligne pour voir l&apos;écart détaillé, les primes et les corriger.
            </p>
          </div>
          <RecapTable
            rows={payable}
            platform={resolvedPlatform}
            periodStart={period.start}
            periodEnd={period.end}
            periodRange={periodRange}
          />
        </>
      )}

          <Card className="flex items-start gap-3 border-dashed bg-surface-2/40">
            <Radar size={16} className="mt-0.5 shrink-0 text-muted" />
            <div className="text-xs leading-relaxed text-muted">
              Les ventes déclarées restent la base du calcul ; le suivi automatique sert à repérer
              les écarts, jamais à remplacer la saisie. Une correction passe par une prime ou une
              sanction motivée, jamais par une retouche du montant — c&apos;est ce qui rend un
              versement justifiable après coup.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
