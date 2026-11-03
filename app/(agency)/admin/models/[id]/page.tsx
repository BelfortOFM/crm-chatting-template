import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SectionTitle } from "@/components/ui/PageHeader";
import { platformLabel } from "@/lib/platforms";
import { ModelRules, type RuleRowData } from "./ModelRules";

/**
 * Fiche modèle — onglet « Règles de prime/sanction ».
 *
 * Les règles automatiques se gèrent ici, modèle par modèle. Elles ne font rien
 * tant que le récapitulatif ne les applique pas (bouton explicite) : une règle
 * vaut un montant forfaitaire dès qu'un chatter génère du CA sur ce modèle.
 */
export default async function ModelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: model }, { data: rules }] = await Promise.all([
    supabase.from("models").select("id, name, platform, currency, active").eq("id", id).maybeSingle(),
    supabase
      .from("model_payroll_rules")
      .select("id, kind, amount_usd, reason, active")
      .eq("model_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (!model) notFound();

  const ruleRows = ((rules ?? []) as RuleRowData[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    amount_usd: r.amount_usd,
    reason: r.reason,
    active: r.active,
  }));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/models"
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} /> Modèles
        </Link>
        <h1 className="mt-2 flex flex-wrap items-center gap-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {model.name}
          <Badge tone={model.active ? "success" : "neutral"}>
            {model.active ? "Actif" : "Inactif"}
          </Badge>
        </h1>
        <p className="mt-1 text-sm text-muted">
          {platformLabel(model.platform)} · {model.currency}
        </p>
      </div>

      <Card className="space-y-4">
        <div>
          <SectionTitle>Règles de prime / sanction</SectionTitle>
          <p className="mt-1 text-xs text-muted">
            Déclenchées dès qu&apos;un chatter fait du CA sur ce modèle pendant une période. Le
            montant est fixe, en dollars, et s&apos;applique depuis le récapitulatif (bouton «
            Appliquer les règles »).
          </p>
        </div>
        <ModelRules modelId={id} rules={ruleRows} />
      </Card>
    </div>
  );
}
