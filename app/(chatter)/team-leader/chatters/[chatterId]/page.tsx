import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, Ban, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/session";
import { getLedModels } from "@/lib/team-leader";
import { getPeriodsForMonth, toDateString } from "@/lib/period";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/PageHeader";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatUsdEn } from "@/lib/currency";
import { addWarning, deleteWarning, addSanction, deleteSanction } from "./actions";

export default async function TeamLeaderChatterPage({
  params,
}: {
  params: Promise<{ chatterId: string }>;
}) {
  const { chatterId } = await params;
  const profile = await getSessionProfile();
  if (!profile) notFound();

  const supabase = await createClient();

  // Le chatter cible doit etre actuellement lie a un modele que ce TL mene —
  // sinon la fiche n'a pas lieu d'exister pour lui (la RLS bloquerait de
  // toute facon la lecture des avertissements/sanctions plus bas).
  const ledModelIds = (await getLedModels(supabase, profile.userId)).map((m) => m.id);
  const todayIso = toDateString(new Date());

  const { data: link } =
    ledModelIds.length > 0
      ? await supabase
          .from("chatter_model_assignments")
          .select("chatter_id")
          .eq("chatter_id", chatterId)
          .in("model_id", ledModelIds)
          .lte("assigned_from", todayIso)
          .or(`assigned_to.is.null,assigned_to.gte.${todayIso}`)
          .limit(1)
      : { data: [] };

  if (chatterId === profile.userId || !link || link.length === 0) notFound();

  const { data: chatter } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", chatterId)
    .eq("role", "chatter")
    .maybeSingle();
  if (!chatter) notFound();

  const now = new Date();
  const periods = getPeriodsForMonth(now.getFullYear(), now.getMonth() + 1);

  const [{ data: warningRows }, { data: sanctionRows }] = await Promise.all([
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

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <div>
        <Link
          href="/team-leader/planning"
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} /> Team planning
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">{chatter.full_name}</h1>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <AlertTriangle size={14} />
          </span>
          <SectionTitle>Warnings</SectionTitle>
        </div>

        <div className="space-y-2">
          {(warningRows ?? []).map((w) => (
            <div key={w.id} className="rounded-xl border border-border px-3.5 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm text-foreground">{w.reason}</p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(w.created_at).toLocaleDateString("en-US", { timeZone: "Europe/Paris" })}
                  </p>
                </div>
                <form action={deleteWarning.bind(null, w.id, chatterId)}>
                  <button
                    type="submit"
                    aria-label="Delete this warning"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <X size={15} />
                  </button>
                </form>
              </div>
            </div>
          ))}
          {(warningRows ?? []).length === 0 && <p className="text-sm text-muted">No warning.</p>}
        </div>

        <form action={addWarning.bind(null, chatterId)} className="space-y-2 border-t border-border pt-4">
          <Input name="reason" required placeholder="Reason for the warning" aria-label="Reason for the warning" />
          <Button
            type="submit"
            className="w-full bg-warning/10 bg-none text-warning shadow-none hover:bg-warning/20 hover:brightness-100"
          >
            Add a warning
          </Button>
        </form>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger/10 text-danger">
            <Ban size={14} />
          </span>
          <SectionTitle>Penalties</SectionTitle>
        </div>

        <div className="space-y-2">
          {(sanctionRows ?? []).map((s) => (
            <div key={s.id} className="rounded-xl border border-border px-3.5 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Badge tone="danger">-{formatUsdEn(Number(s.amount_usd))}</Badge>
                  <p className="mt-1.5 text-xs text-muted">
                    {s.period_start} → {s.period_end}
                  </p>
                  <p className="mt-1 break-words text-xs text-foreground">{s.reason}</p>
                </div>
                <form action={deleteSanction.bind(null, s.id, chatterId)}>
                  <button
                    type="submit"
                    aria-label="Delete this penalty"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <X size={15} />
                  </button>
                </form>
              </div>
            </div>
          ))}
          {(sanctionRows ?? []).length === 0 && <p className="text-sm text-muted">No penalty.</p>}
        </div>

        <form action={addSanction.bind(null, chatterId)} className="space-y-2 border-t border-border pt-4">
          <Select name="period_range" required aria-label="Period concerned">
            {periods.map((p) => (
              <option key={p.periodNumber} value={`${toDateString(p.start)}|${toDateString(p.end)}`}>
                Period {p.periodNumber} ({toDateString(p.start)} → {toDateString(p.end)})
              </option>
            ))}
          </Select>
          <Input
            name="amount_usd"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="Amount ($)"
            aria-label="Penalty amount in dollars"
          />
          <Input name="reason" required placeholder="Reason" aria-label="Reason for the penalty" />
          <Button
            type="submit"
            className="w-full bg-danger/10 bg-none text-danger shadow-none hover:bg-danger/20 hover:brightness-100"
          >
            Add a penalty
          </Button>
        </form>
      </Card>
    </div>
  );
}
