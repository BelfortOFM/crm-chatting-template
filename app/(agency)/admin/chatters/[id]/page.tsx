import { notFound } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, Percent, Target, Gift, Ban, X, KeyRound, MonitorSmartphone, Crown, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { platformLabel } from "@/lib/platforms";
import { ResetPasswordPanel } from "./ResetPasswordPanel";
import { LifecyclePanel } from "./LifecyclePanel";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/PageHeader";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatUsd } from "@/lib/currency";
import { getPeriodForDate, getPeriodsForMonth, toDateString } from "@/lib/period";
import {
  assignModel,
  unassignModel,
  assignTeamLeader,
  unassignTeamLeader,
  updateCommission,
  setGoalAllocation,
  addBonus,
  deleteBonus,
  addWarning,
  deleteWarning,
  addSanction,
  deleteSanction,
} from "./actions";

export default async function ChatterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: chatter } = await supabase
    .from("profiles")
    .select("id, full_name, role, active, left_on")
    .eq("id", id)
    .single();

  if (!chatter || chatter.role !== "chatter") notFound();

  const now = new Date();
  const periods = getPeriodsForMonth(now.getFullYear(), now.getMonth() + 1);
  const currentPeriod = getPeriodForDate(now);
  const periodStart = toDateString(currentPeriod.start);
  const periodEnd = toDateString(currentPeriod.end);

  const [
    { data: assignments },
    { data: models },
    { count: shiftCount },
    { count: payoutCount },
    { data: commissionRule },
    { data: allocations },
    { data: modelGoals },
    { data: bonuses },
    { data: warnings },
    { data: sanctions },
    { data: loginHistory },
    { data: teamLeaderAssignments },
  ] = await Promise.all([
    supabase
      .from("chatter_model_assignments")
      .select("id, assigned_from, assigned_to, model:models(id, name, platform)")
      .eq("chatter_id", id)
      .order("assigned_from", { ascending: false }),
    supabase.from("models").select("id, name, platform").eq("active", true).order("name"),
    // Un historique interdit la suppression : shift_entries et payouts partent
    // en cascade avec le profil.
    supabase.from("shift_entries").select("id", { count: "exact", head: true }).eq("chatter_id", id),
    supabase.from("payouts").select("id", { count: "exact", head: true }).eq("chatter_id", id),
    supabase
      .from("commission_rules")
      .select("rate_percent")
      .eq("chatter_id", id)
      .is("valid_to", null)
      .maybeSingle(),
    // L'objectif ne vit plus sur la personne mais sur le couple (modele,
    // chatter), par periode (P1-P4) : la table monthly_goals a disparu du
    // schema.
    supabase
      .from("model_goal_allocations")
      .select("model_id, target_amount_usd")
      .eq("chatter_id", id)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd),
    supabase
      .from("model_period_goals")
      .select("model_id, target_amount_usd")
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd),
    supabase
      .from("bonuses")
      .select("id, period_start, period_end, amount_usd, reason")
      .eq("chatter_id", id)
      .order("period_start", { ascending: false })
      .limit(10),
    supabase
      .from("warnings")
      .select("id, reason, created_at")
      .eq("chatter_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("sanctions")
      .select("id, period_start, period_end, amount_usd, reason")
      .eq("chatter_id", id)
      .order("period_start", { ascending: false })
      .limit(10),
    supabase
      .from("login_history")
      .select("ip, user_agent, headers, created_at")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("team_leader_assignments")
      .select("id, assigned_from, assigned_to, model:models(id, name, platform)")
      .eq("chatter_id", id)
      .order("assigned_from", { ascending: false }),
  ]);

  // L'email de connexion vit dans auth.users : il faut l'API admin pour le lire.
  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(id);
  const email = authUser?.user?.email ?? "";
  const host = (await headers()).get("host") ?? "";
  const appUrl = host ? `https://${host}` : "";

  const allocationByModel = new Map(
    ((allocations ?? []) as { model_id: string; target_amount_usd: number }[]).map((a) => [
      a.model_id,
      Number(a.target_amount_usd),
    ])
  );
  const allocationTotal = [...allocationByModel.values()].reduce((s, v) => s + v, 0);
  const goalByModel = new Map(
    ((modelGoals ?? []) as { model_id: string; target_amount_usd: number }[]).map((g) => [
      g.model_id,
      Number(g.target_amount_usd),
    ])
  );

  const activeAssignments = (assignments ?? [])
    .filter((a) => !a.assigned_to)
    .map((a) => ({ ...a, model: Array.isArray(a.model) ? a.model[0] : a.model }));
  const assignedModelIds = new Set(activeAssignments.map((a) => a.model?.id));
  const availableModels = (models ?? []).filter((m) => !assignedModelIds.has(m.id));

  const activeTeamLeaderAssignments = (teamLeaderAssignments ?? [])
    .filter((a) => !a.assigned_to)
    .map((a) => ({ ...a, model: Array.isArray(a.model) ? a.model[0] : a.model }));
  const ledModelIds = new Set(activeTeamLeaderAssignments.map((a) => a.model?.id));
  const modelsAvailableForLead = (models ?? []).filter((m) => !ledModelIds.has(m.id));

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/admin/chatters"
          className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} /> Chatters
        </Link>
        <h1 className="mt-2 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {chatter.full_name}
        </h1>
        <p className="mt-1 text-sm text-muted">Modèles assignés, commission, objectifs, bonus/sanctions.</p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <KeyRound size={14} />
          </span>
          <SectionTitle>Accès au compte</SectionTitle>
        </div>
        <LifecyclePanel
          hasHistory={(shiftCount ?? 0) > 0 || (payoutCount ?? 0) > 0}
          chatterId={id}
          fullName={chatter.full_name}
          active={chatter.active}
          leftOn={chatter.left_on}
        />
        <div className="border-t border-border pt-4" />
        <ResetPasswordPanel
          chatterId={id}
          fullName={chatter.full_name}
          email={email}
          appUrl={appUrl}
        />
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <MonitorSmartphone size={14} />
          </span>
          <SectionTitle>Connexions récentes</SectionTitle>
        </div>
        {!loginHistory || loginHistory.length === 0 ? (
          <p className="text-xs text-muted">Aucune connexion enregistrée pour l&apos;instant.</p>
        ) : (
          <ul className="space-y-2.5">
            {(
              loginHistory as {
                ip: string | null;
                user_agent: string | null;
                headers: Record<string, string> | null;
                created_at: string;
              }[]
            ).map((l, i) => {
              const country = l.headers?.["cf-ipcountry"];
              const referer = l.headers?.referer;
              return (
                <li key={i} className="text-xs leading-relaxed">
                  <span className="font-medium text-foreground">
                    {new Date(l.created_at).toLocaleString("fr-FR", {
                      timeZone: "Europe/Paris",
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <span className="text-muted">
                    {" "}
                    — {l.ip ?? "IP inconnue"}
                    {country && country !== "XX" && <> ({country})</>}
                  </span>
                  <br />
                  <span className="text-muted/70">{l.user_agent ?? "Appareil inconnu"}</span>
                  {referer && (
                    <>
                      <br />
                      <span className="text-muted/50">venu de {referer}</span>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="space-y-4">
        <SectionTitle>Modèles assignés</SectionTitle>

        <div className="flex flex-wrap gap-2">
          {activeAssignments.length === 0 && <p className="text-sm text-muted">Aucun modèle assigné.</p>}
          {activeAssignments.map((a) => (
            <span
              key={a.id}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface-2 py-1.5 pl-3.5 pr-1.5 text-sm text-foreground"
            >
              <span className="font-medium">{a.model?.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted">
                {a.model ? platformLabel(a.model.platform) : ""}
              </span>
              <form action={unassignModel.bind(null, a.id, id)}>
                <button
                  type="submit"
                  aria-label={`Retirer ${a.model?.name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                >
                  <X size={13} />
                </button>
              </form>
            </span>
          ))}
        </div>

        {availableModels.length > 0 && (
          <form action={assignModel.bind(null, id)} className="space-y-3">
            <Label>Assigner un ou plusieurs modèles</Label>
            <div className="flex flex-wrap gap-2">
              {availableModels.map((m) => (
                <label
                  key={m.id}
                  className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 text-sm text-foreground transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent"
                >
                  <input type="checkbox" name="model_id" value={m.id} className="accent-accent" />
                  {m.name}
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    {platformLabel(m.platform)}
                  </span>
                </label>
              ))}
            </div>
            <Button type="submit" className="shrink-0">
              Assigner
            </Button>
          </form>
        )}
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <Crown size={14} />
          </span>
          <SectionTitle>Team Leader</SectionTitle>
        </div>
        <p className="text-xs text-muted">
          Un Team Leader voit, en lecture seule, le planning de tous les chatters liés au(x)
          modèle(s) ci-dessous — toutes plateformes confondues. Il reste par ailleurs un chatter
          normal, qui déclare ses propres shifts.
        </p>

        <div className="flex flex-wrap gap-2">
          {activeTeamLeaderAssignments.length === 0 && (
            <p className="text-sm text-muted">N&apos;est Team Leader d&apos;aucun modèle.</p>
          )}
          {activeTeamLeaderAssignments.map((a) => (
            <span
              key={a.id}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-surface-2 py-1.5 pl-3.5 pr-1.5 text-sm text-foreground"
            >
              <span className="font-medium">{a.model?.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted">
                {a.model ? platformLabel(a.model.platform) : ""}
              </span>
              <form action={unassignTeamLeader.bind(null, a.id, id)}>
                <button
                  type="submit"
                  aria-label={`Retirer le statut Team Leader de ${a.model?.name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger/15 hover:text-danger"
                >
                  <X size={13} />
                </button>
              </form>
            </span>
          ))}
        </div>

        {modelsAvailableForLead.length > 0 && (
          <form action={assignTeamLeader.bind(null, id)} className="space-y-3">
            <Label>Nommer Team Leader d&apos;un ou plusieurs modèles</Label>
            <div className="flex flex-wrap gap-2">
              {modelsAvailableForLead.map((m) => (
                <label
                  key={m.id}
                  className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3.5 text-sm text-foreground transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent"
                >
                  <input type="checkbox" name="model_id" value={m.id} className="accent-accent" />
                  {m.name}
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    {platformLabel(m.platform)}
                  </span>
                </label>
              ))}
            </div>
            <Button type="submit" className="shrink-0">
              Nommer
            </Button>
          </form>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Percent size={14} />
            </span>
            <SectionTitle>Commission</SectionTitle>
          </div>
          <p className="text-3xl font-bold tabular-nums text-foreground">
            {commissionRule ? `${commissionRule.rate_percent}%` : "—"}
          </p>
          <form action={updateCommission.bind(null, id)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="rate_percent">Nouveau taux (%)</Label>
              <Input
                id="rate_percent"
                name="rate_percent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                defaultValue={commissionRule?.rate_percent ?? ""}
              />
            </div>
            <Button type="submit" variant="secondary" className="shrink-0">
              Mettre à jour
            </Button>
          </form>
        </Card>

        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Target size={14} />
            </span>
            <SectionTitle>Objectif · P{currentPeriod.periodNumber} ({periodStart} → {periodEnd})</SectionTitle>
          </div>
          <p className="text-3xl font-bold tabular-nums text-foreground">
            {allocationTotal > 0 ? formatUsd(allocationTotal) : "—"}
          </p>
          <p className="text-xs text-muted">
            Somme de ce qui lui est confié sur chaque modèle, pour la période en cours.
            L&apos;objectif se fixe par compte (page Modèles), puis se répartit ici entre les
            chatters qui y travaillent.
          </p>

          {activeAssignments.length === 0 ? (
            <p className="text-sm text-muted">Assigne-lui un modèle pour lui confier un objectif.</p>
          ) : (
            <div className="space-y-2">
              {activeAssignments.map((a) =>
                a.model ? (
                  <form
                    key={a.model.id}
                    action={setGoalAllocation.bind(null, id, a.model.id)}
                    className="flex items-end gap-2"
                  >
                    <div className="flex-1">
                      <Label htmlFor={`goal-${a.model.id}`}>
                        {a.model.name}
                        {goalByModel.get(a.model.id) !== undefined && (
                          <span className="ml-1 normal-case text-muted/70">
                            · cible du compte {formatUsd(goalByModel.get(a.model.id)!)}
                          </span>
                        )}
                      </Label>
                      <Input
                        id={`goal-${a.model.id}`}
                        name="target_amount_usd"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0 pour retirer"
                        defaultValue={allocationByModel.get(a.model.id) ?? ""}
                      />
                    </div>
                    <Button type="submit" variant="secondary" className="shrink-0">
                      OK
                    </Button>
                  </form>
                ) : null
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10 text-success">
              <Gift size={14} />
            </span>
            <SectionTitle>Bonus</SectionTitle>
          </div>

          <div className="space-y-2">
            {(bonuses ?? []).map((b) => (
              <div key={b.id} className="rounded-xl border border-border px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge tone="success">+{formatUsd(Number(b.amount_usd))}</Badge>
                    <p className="mt-1.5 text-xs text-muted">
                      {b.period_start} → {b.period_end}
                    </p>
                    <p className="mt-1 break-words text-xs text-foreground">{b.reason}</p>
                  </div>
                  <form action={deleteBonus.bind(null, b.id, id)}>
                    <button
                      type="submit"
                      aria-label="Supprimer ce bonus"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <X size={15} />
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {(bonuses ?? []).length === 0 && <p className="text-sm text-muted">Aucun bonus.</p>}
          </div>

          <form action={addBonus.bind(null, id)} className="space-y-2 border-t border-border pt-4">
            <PeriodSelect periods={periods} />
            <Input
              name="amount_usd"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="Montant ($)"
              aria-label="Montant du bonus en dollars"
            />
            <Input name="reason" required placeholder="Motif" aria-label="Motif du bonus" />
            <Button
              type="submit"
              className="w-full bg-success/10 bg-none text-success shadow-none hover:bg-success/20 hover:brightness-100"
            >
              Ajouter un bonus
            </Button>
          </form>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <AlertTriangle size={14} />
            </span>
            <SectionTitle>Avertissements</SectionTitle>
          </div>

          <div className="space-y-2">
            {(warnings ?? []).map((w) => (
              <div key={w.id} className="rounded-xl border border-border px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm text-foreground">{w.reason}</p>
                    <p className="mt-1 text-xs text-muted">
                      {new Date(w.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}
                    </p>
                  </div>
                  <form action={deleteWarning.bind(null, w.id, id)}>
                    <button
                      type="submit"
                      aria-label="Supprimer cet avertissement"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <X size={15} />
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {(warnings ?? []).length === 0 && <p className="text-sm text-muted">Aucun avertissement.</p>}
          </div>

          <form action={addWarning.bind(null, id)} className="space-y-2 border-t border-border pt-4">
            <Input name="reason" required placeholder="Motif de l'avertissement" aria-label="Motif de l'avertissement" />
            <Button
              type="submit"
              className="w-full bg-warning/10 bg-none text-warning shadow-none hover:bg-warning/20 hover:brightness-100"
            >
              Ajouter un avertissement
            </Button>
          </form>
        </Card>

        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-danger/10 text-danger">
              <Ban size={14} />
            </span>
            <SectionTitle>Sanctions</SectionTitle>
          </div>

          <div className="space-y-2">
            {(sanctions ?? []).map((s) => (
              <div key={s.id} className="rounded-xl border border-border px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Badge tone="danger">-{formatUsd(Number(s.amount_usd))}</Badge>
                    <p className="mt-1.5 text-xs text-muted">
                      {s.period_start} → {s.period_end}
                    </p>
                    <p className="mt-1 break-words text-xs text-foreground">{s.reason}</p>
                  </div>
                  <form action={deleteSanction.bind(null, s.id, id)}>
                    <button
                      type="submit"
                      aria-label="Supprimer cette sanction"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <X size={15} />
                    </button>
                  </form>
                </div>
              </div>
            ))}
            {(sanctions ?? []).length === 0 && <p className="text-sm text-muted">Aucune sanction.</p>}
          </div>

          <form action={addSanction.bind(null, id)} className="space-y-2 border-t border-border pt-4">
            <PeriodSelect periods={periods} />
            <Input
              name="amount_usd"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="Montant ($)"
              aria-label="Montant de la sanction en dollars"
            />
            <Input name="reason" required placeholder="Motif" aria-label="Motif de la sanction" />
            <Button
              type="submit"
              className="w-full bg-danger/10 bg-none text-danger shadow-none hover:bg-danger/20 hover:brightness-100"
            >
              Ajouter une sanction
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

function PeriodSelect({ periods }: { periods: { periodNumber: number; start: Date; end: Date }[] }) {
  return (
    <Select name="period_range" required aria-label="Période concernée">
      {periods.map((p) => (
        <option key={p.periodNumber} value={`${toDateString(p.start)}|${toDateString(p.end)}`}>
          Période {p.periodNumber} ({toDateString(p.start)} → {toDateString(p.end)})
        </option>
      ))}
    </Select>
  );
}
