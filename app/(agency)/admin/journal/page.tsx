import { History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ACTION_LABELS } from "@/lib/audit";
import { PageHeader, EmptyState } from "@/components/ui/PageHeader";

const STAMP_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

// Les actions qui retirent de l'argent ou coupent un acces meritent d'etre
// reperables d'un coup d'oeil dans une longue liste.
const TONE: Record<string, string> = {
  "bonus.delete": "text-danger",
  "sanction.add": "text-danger",
  "chatter.deactivate": "text-danger",
  "payout.reopen": "text-warning",
  "payout.close": "text-success",
  "chatter.create": "text-success",
  "chatter.reactivate": "text-success",
};

function formatDetails(details: Record<string, unknown> | null): string {
  if (!details) return "";
  return Object.entries(details)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")} : ${v}`)
    .join(" · ");
}

export default async function JournalPage() {
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("audit_log")
    .select("id, actor_name, action, target_label, details, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Journal"
        subtitle="Qui a modifié quoi : commissions, bonus, sanctions, clôtures de paie, accès."
      />

      {(entries ?? []).length === 0 ? (
        <EmptyState>
          <History size={24} className="mx-auto mb-2 text-muted" />
          Aucune action enregistrée pour l&apos;instant. Le journal se remplit dès la première
          modification (commission, bonus, clôture de paie…).
        </EmptyState>
      ) : (
        <div className="space-y-1.5">
          {(entries ?? []).map((e) => {
            const details = formatDetails(e.details as Record<string, unknown> | null);
            return (
              <div
                key={e.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm"
              >
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                  {STAMP_FMT.format(new Date(e.created_at))}
                </span>
                <span className={`font-medium ${TONE[e.action] ?? "text-foreground"}`}>
                  {ACTION_LABELS[e.action] ?? e.action}
                </span>
                {e.target_label && <span className="text-foreground">· {e.target_label}</span>}
                {details && <span className="text-xs text-muted">({details})</span>}
                <span className="ml-auto shrink-0 text-xs text-muted">par {e.actor_name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
