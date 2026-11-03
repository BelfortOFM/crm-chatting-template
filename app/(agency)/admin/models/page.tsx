import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PageHeader, SectionTitle, EmptyState } from "@/components/ui/PageHeader";
import { CreateModelForm } from "./CreateModelForm";
import { PlatformManager } from "./PlatformManager";
import { DeleteModelButton } from "./DeleteModelButton";
import { BUILTIN_PLATFORMS, platformLabel } from "@/lib/platforms";
import { getPeriodForDate, toDateString } from "@/lib/period";
import { Users, Target, Settings2, Gauge } from "lucide-react";
import {
  updateModelName,
  toggleModelActive,
  recordSubscribers,
  setModelGoal,
  setModelLtvTarget,
} from "./actions";

export default async function ModelsPage() {
  const supabase = await createClient();

  const period = getPeriodForDate(new Date());
  const periodStart = toDateString(period.start);
  const periodEnd = toDateString(period.end);

  const [{ data: models }, { data: subs }, { data: goals }, { data: ltvTargets }, { data: customPlatforms }] = await Promise.all([
    // Pas de jointure vers model_chatting_types : la table a ete supprimee du
    // schema, et une jointure vers une relation inexistante fait echouer la
    // requete entiere — la page affichait "Aucun modele" avec deux modeles.
    supabase.from("models").select("*").order("name"),
    supabase
      .from("model_subscriber_counts")
      .select("model_id, subscriber_count, recorded_on")
      .order("recorded_on", { ascending: false }),
    supabase
      .from("model_period_goals")
      .select("model_id, target_amount_usd")
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd),
    supabase
      .from("model_period_ltv_targets")
      .select("model_id, target_ltv_usd")
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd),
    supabase.from("custom_platforms").select("code, label, currency").order("label"),
  ]);

  // Plateformes disponibles : les 4 integrees + celles ajoutees par l'agence.
  const custom = ((customPlatforms ?? []) as { code: string; label: string; currency: string }[]);
  const platformOptions = [
    ...BUILTIN_PLATFORMS.map((p) => ({ code: p.code, label: p.label, currency: p.currency })),
    ...custom,
  ];
  const customLabels = new Map(custom.map((c) => [c.code, c.label]));

  const goalByModel = new Map(
    ((goals ?? []) as { model_id: string; target_amount_usd: number }[]).map((g) => [
      g.model_id,
      Number(g.target_amount_usd),
    ])
  );

  const ltvTargetByModel = new Map(
    ((ltvTargets ?? []) as { model_id: string; target_ltv_usd: number }[]).map((t) => [
      t.model_id,
      Number(t.target_ltv_usd),
    ])
  );

  // Dernier relevé connu par modèle (la requête est déjà triée du plus récent
  // au plus ancien, le premier vu gagne).
  const latestSubs = new Map<string, { count: number; on: string }>();
  for (const row of (subs ?? []) as { model_id: string; subscriber_count: number; recorded_on: string }[]) {
    if (!latestSubs.has(row.model_id)) {
      latestSubs.set(row.model_id, { count: row.subscriber_count, on: row.recorded_on });
    }
  }


  return (
    <div className="space-y-5">
      <PageHeader
        title="Modèles"
        subtitle="Gérées uniquement côté agence — devise fixée par la plateforme."
      />

      {/* Repond d'un coup d'oeil a "quels comptes sont branches ?" : un modele
          dont la plateforme n'apparait pas ici ne peut pas etre suivi. */}

      <Card>
        <SectionTitle>Plateformes</SectionTitle>
        <p className="mb-3 mt-1 text-xs text-muted">
          OnlyFans a un suivi automatique. Ajoute d&apos;autres plateformes (Fanvue,
          Fancentro…) pour y créer des modèles — toutes en USD, devise unique.
        </p>
        <PlatformManager
          builtins={BUILTIN_PLATFORMS.map((p) => ({ code: p.code, label: p.label, currency: p.currency }))}
          custom={custom}
        />
      </Card>

      <Card>
        <SectionTitle>Nouveau modèle</SectionTitle>
        <CreateModelForm platforms={platformOptions} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {(models ?? []).map((model) => {

          return (
            <Card key={model.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-foreground">{model.name}</p>
                  <p className="mt-0.5 text-xs uppercase tracking-wide text-muted">
                    {platformLabel(model.platform, customLabels)} · {model.currency}
                  </p>
                  <Link
                    href={`/admin/models/${model.id}`}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent transition-colors hover:underline"
                  >
                    <Settings2 size={12} /> Règles de prime/sanction
                  </Link>
                </div>
                <form action={toggleModelActive.bind(null, model.id, !model.active)}>
                  <button
                    type="submit"
                    aria-label={model.active ? "Désactiver ce modèle" : "Activer ce modèle"}
                    className="flex min-h-10 items-center px-1"
                  >
                    <Badge tone={model.active ? "success" : "neutral"}>
                      {model.active ? "Actif" : "Inactif"}
                    </Badge>
                  </button>
                </form>
              </div>

              <form action={updateModelName.bind(null, model.id)} className="flex items-center gap-2">
                <input
                  name="name"
                  aria-label="Nom du modèle"
                  defaultValue={model.name}
                  className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-base text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25 sm:text-sm"
                />
                <button
                  type="submit"
                  className="flex min-h-10 shrink-0 items-center rounded-lg px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
                >
                  Renommer
                </button>
              </form>

              <form
                action={setModelGoal.bind(null, model.id)}
                className="space-y-2 border-t border-border pt-3"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  <Target size={12} /> Objectif · P{period.periodNumber} ({periodStart} → {periodEnd})
                </p>
                <div className="flex items-center gap-2">
                  <input
                    name="target_amount_usd"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    defaultValue={goalByModel.get(model.id) ?? ""}
                    placeholder="Ex: 15000"
                    aria-label={`Objectif de la période en cours de ${model.name}, en dollars`}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-base text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25 sm:text-sm"
                  />
                  <button
                    type="submit"
                    className="flex min-h-10 shrink-0 items-center rounded-lg px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
                  >
                    Enregistrer
                  </button>
                </div>
                <p className="text-[11px] text-muted">
                  Se répartit ensuite entre les chatters, depuis leur fiche.
                </p>
              </form>

              <form
                action={recordSubscribers.bind(null, model.id)}
                className="space-y-2 border-t border-border pt-3"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  <Users size={12} /> Abonnés
                  {latestSubs.get(model.id) && (
                    <span className="normal-case text-muted/70">
                      · relevé du{" "}
                      {new Date(latestSubs.get(model.id)!.on).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    name="subscriber_count"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    defaultValue={latestSubs.get(model.id)?.count ?? ""}
                    placeholder="Ex: 1250"
                    aria-label={`Nombre d'abonnés de ${model.name}`}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-base text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25 sm:text-sm"
                  />
                  <button
                    type="submit"
                    className="flex min-h-10 shrink-0 items-center rounded-lg px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
                  >
                    Enregistrer
                  </button>
                </div>
                <p className="text-[11px] text-muted">
                  Relève-le depuis la plateforme. Sert au calcul de la
                  LTV.
                </p>
              </form>

              <form
                action={setModelLtvTarget.bind(null, model.id)}
                className="space-y-2 border-t border-border pt-3"
              >
                <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  <Gauge size={12} /> Objectif LTV · P{period.periodNumber}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    name="target_ltv_usd"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    defaultValue={ltvTargetByModel.get(model.id) ?? ""}
                    placeholder="Ex: 12 ($ net par abonné)"
                    aria-label={`Objectif de LTV de la période en cours de ${model.name}, en dollars`}
                    className="w-full rounded-xl border border-border bg-surface-2 px-3.5 py-2 text-base text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25 sm:text-sm"
                  />
                  <button
                    type="submit"
                    className="flex min-h-10 shrink-0 items-center rounded-lg px-3 text-xs font-semibold text-accent transition-colors hover:bg-accent-soft"
                  >
                    Enregistrer
                  </button>
                </div>
                <p className="text-[11px] text-muted">
                  CA net par abonné à atteindre cette période. Visible par les chatters assignés.
                </p>
              </form>

              <div className="border-t border-border pt-3">
                <DeleteModelButton modelId={model.id} active={model.active} />
              </div>
            </Card>
          );
        })}
        {(models ?? []).length === 0 && (
          <div className="lg:col-span-2">
            <EmptyState>Aucun modèle pour l&apos;instant.</EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
