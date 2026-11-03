import Link from "next/link";
import { ChevronLeft, ChevronRight, CalendarDays, Info, Crown, ChevronRight as ChevronRightIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { toDateString } from "@/lib/period";
import { buildWeek, weekStart, addDays, weekLabelEn, sortSlots, totalHours, SLOT_LABEL_EN, type ShiftSlot } from "@/lib/shifts";
import { getLedModels } from "@/lib/team-leader";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { WeekView } from "./WeekView";
import { ChatterNotificationsPanel } from "@/components/notifications/ChatterNotificationsPanel";

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const { w } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = new Date();
  // `w` = lundi de la semaine affichée ; on retombe sur la semaine courante
  // si le paramètre est absent ou mal formé.
  const monday = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? weekStart(new Date(`${w}T12:00:00`)) : weekStart(today);
  const sunday = addDays(monday, 6);

  const [{ data: assignment }, { data: offRows }, ledModels] = await Promise.all([
    supabase
      .from("chatter_shift_assignments")
      .select("shift_slot, model:models(name)")
      .eq("chatter_id", user!.id)
      .is("assigned_to", null),
    supabase
      .from("chatter_days_off")
      .select("day_off")
      .eq("chatter_id", user!.id)
      .gte("day_off", toDateString(monday))
      .lte("day_off", toDateString(sunday)),
    getLedModels(supabase, user!.id),
  ]);

  // Un meme creneau peut exister plusieurs fois : une ligne par modele depuis
  // le planning par modele, plus l'eventuelle ligne generique. Le chatter, lui,
  // ne travaille qu'une fois sur la plage — sans deduplication le bandeau
  // compterait 12 h la ou il y en a 6 et le pointage proposerait deux boutons
  // identiques.
  // PostgREST type la jointure comme un tableau alors qu'elle renvoie un objet
  // (cle etrangere many-to-one) : meme normalisation que dans report/page.tsx.
  type AssignRow = { shift_slot: ShiftSlot; model: { name: string } | { name: string }[] | null };
  const rowsAssign = ((assignment ?? []) as AssignRow[]).map((a) => ({
    shift_slot: a.shift_slot,
    model: Array.isArray(a.model) ? (a.model[0] ?? null) : a.model,
  }));
  const slots = sortSlots([...new Set(rowsAssign.map((a) => a.shift_slot))]);

  // Modeles couverts sur chaque creneau, pour que le chatter sache sur quel
  // compte il est attendu. Un creneau generique n'en nomme aucun : il vaut
  // pour tous les modeles qui lui sont affectes.
  const modelsBySlot = new Map<ShiftSlot, string[]>();
  for (const a of rowsAssign) {
    if (!a.model) continue;
    modelsBySlot.set(a.shift_slot, [...(modelsBySlot.get(a.shift_slot) ?? []), a.model.name]);
  }
  const slotLabel = (s: ShiftSlot) => {
    const names = modelsBySlot.get(s);
    return names?.length ? `${SLOT_LABEL_EN[s]} (${names.join(", ")})` : SLOT_LABEL_EN[s];
  };
  const daysOff = new Set((offRows ?? []).map((r) => r.day_off as string));
  const days = buildWeek(monday, slots, daysOff, today);

  const prev = toDateString(addDays(monday, -7));
  const next = toDateString(addDays(monday, 7));
  const isCurrentWeek = toDateString(monday) === toDateString(weekStart(today));

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <PageHeader
        title="My planning"
        subtitle={
          slots.length > 0
            ? `${slots.length > 1 ? "Assigned slots" : "Assigned slot"}: ${slots
                .map(slotLabel)
                .join(" and ")}${slots.length > 1 ? ` · ${totalHours(slots)} h per day` : ""}`
            : "No slot assigned yet"
        }
      />

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/planning?w=${prev}`}
          className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronLeft size={15} /> <span className="hidden sm:inline">Prev. week</span>
        </Link>
        <span className="text-center text-sm font-semibold text-foreground">
          {weekLabelEn(monday)}
          {isCurrentWeek && <span className="ml-1.5 text-xs font-normal text-accent">· current</span>}
        </span>
        <Link
          href={`/planning?w=${next}`}
          className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <span className="hidden sm:inline">Next</span> <ChevronRight size={15} />
        </Link>
      </div>

      {slots.length > 0 ? (
        <WeekView days={days} canEdit />
      ) : (
        <Card className="flex items-start gap-3 border-dashed">
          <CalendarDays size={20} className="mt-0.5 shrink-0 text-muted" />
          <p className="text-sm text-muted">
            Your agency hasn&apos;t assigned you a work slot yet. As soon as it has, your weekly
            planning will show up here and you'll be able to request a day OFF.
          </p>
        </Card>
      )}

      {ledModels.length > 0 && (
        <Link href="/team-leader/planning">
          <Card className="flex items-center gap-3 border-accent/30 bg-accent-soft/40 transition-colors hover:bg-accent-soft/60">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Crown size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">Team planning</p>
              <p className="truncate text-xs text-muted">
                Team Leader for {ledModels.map((m) => m.name).join(", ")}
              </p>
            </div>
            <ChevronRightIcon size={16} className="shrink-0 text-muted" />
          </Card>
        </Link>
      )}

      <ChatterNotificationsPanel vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />

      <Card className="flex items-start gap-3 border-dashed bg-surface-2/40">
        <Info size={16} className="mt-0.5 shrink-0 text-muted" />
        <div className="text-xs leading-relaxed text-muted">
          You can request <strong className="text-foreground">several days OFF per week</strong>,
          only on upcoming days. A day that's already passed can no longer be changed — check with
          your agency if you need an exceptional absence.
        </div>
      </Card>
    </div>
  );
}
