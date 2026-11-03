import { CalendarPlus, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState, SectionTitle } from "@/components/ui/PageHeader";
import { CheckInPanel } from "@/components/checkin/CheckInPanel";
import { ShiftForm } from "./ShiftForm";
import { ShiftHistory, type ShiftItem } from "./ShiftHistory";
import { fetchCheckInState } from "@/lib/checkin";
import { toDateStringDaysAgo, isShiftDateLocked } from "@/lib/period";
import type { Currency, Platform } from "@/lib/types";

export default async function ReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Recently ended assignments stay in the dropdown so a chatter can still
  // declare a late shift for a date the assignment covered (the DB checks
  // date coverage and period locking anyway — 25 days safely spans every
  // still-unlocked date).
  const graceCutoff = toDateStringDaysAgo(25);

  const [{ data: assignments }, { data: shifts }, checkIn] = await Promise.all([
    supabase
      .from("chatter_model_assignments")
      .select("model:models(id, name, platform, currency)")
      .eq("chatter_id", user!.id)
      .or(`assigned_to.is.null,assigned_to.gte.${graceCutoff}`),
    supabase
      .from("shift_entries")
      .select("id, shift_date, start_time, end_time, model:models(name, currency), sale_lines(id, amount)")
      .eq("chatter_id", user!.id)
      .order("shift_date", { ascending: false })
      .order("start_time", { ascending: false })
      .limit(20),
    fetchCheckInState(supabase, user!.id),
  ]);

  const models = [
    ...new Map(
      (assignments ?? [])
        .map((a) => (Array.isArray(a.model) ? a.model[0] : a.model))
        .filter((m): m is { id: string; name: string; platform: Platform; currency: Currency } => Boolean(m))
        .map((m) => [m.id, m] as const)
    ).values(),
  ];

  const history: ShiftItem[] = (shifts ?? []).map((shift) => {
    const model = Array.isArray(shift.model) ? shift.model[0] : shift.model;
    // Postgres `numeric` is serialized as a string by PostgREST — coerce before summing.
    const lines = (shift.sale_lines as { id: string; amount: number | string }[])
      .map((l) => Number(l.amount))
      .sort((a, b) => b - a);
    const currency: Currency = model?.currency ?? "USD";

    return {
      id: shift.id,
      modelName: model?.name ?? "",
      shiftDate: shift.shift_date,
      startTime: shift.start_time,
      endTime: shift.end_time,
      currency,
      amounts: lines.map((a) => a.toFixed(2)),
      total: lines.reduce((sum, a) => sum + a, 0),
      locked: isShiftDateLocked(shift.shift_date),
    };
  });

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Report a shift</h1>
        <p className="mt-1 text-sm text-muted">One entry per shift, multiple sales possible.</p>
      </div>

      {/* Le pointage est maintenant exigé avant l'envoi (garde cote base,
          trg_shift_entries_guard) : ce bandeau previent plutot que de
          laisser decouvrir le refus seulement au moment d'enregistrer. */}
      {checkIn.slots.length > 0 && !checkIn.openSince && !checkIn.doneToday && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-sm text-foreground">
            <strong>Check in to your shift first</strong> — without checking in, submitting your
            sales will be refused.
          </p>
        </div>
      )}

      {/* Le pointage ferme l'ecran : le chatter arrive ici en debut de shift
          pour pointer et y revient en fin de shift pour saisir ses ventes puis
          depointer. Un meme onglet, les deux gestes de la journee. */}
      <CheckInPanel
        slots={checkIn.slots}
        openSince={checkIn.openSince}
        doneToday={checkIn.doneToday}
      />

      {models.length === 0 ? (
        <EmptyState>
          <CalendarPlus size={24} className="mx-auto mb-2 text-muted" />
          No model is assigned to you yet — contact your agency.
        </EmptyState>
      ) : (
        <Card>
          <ShiftForm models={models} />
        </Card>
      )}

      <div>
        <SectionTitle>Recent history</SectionTitle>
        <p className="mt-1 text-xs text-muted">
          Made a mistake? Edit or delete the entry as long as the period isn't closed.
        </p>
        <div className="mt-3">
          <ShiftHistory shifts={history} />
        </div>
      </div>
    </div>
  );
}
