import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarOff, Crown, AlertCircle, MessageSquareQuote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/session";
import { getLedModels } from "@/lib/team-leader";
import { toDateString } from "@/lib/period";
import {
  weekStart,
  addDays,
  weekLabelEn,
  dayNameEn,
  dayDateEn,
  sortSlots,
  lateCheckInMinutes,
  isLateCheckIn,
  SHIFT_SLOTS,
  SLOT_LABEL_EN,
  type ShiftSlot,
} from "@/lib/shifts";
import { Card } from "@/components/ui/Card";
import { PageHeader, EmptyState, SectionTitle } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";

interface AssignmentRow {
  chatter_id: string;
  shift_slot: ShiftSlot;
  model_id: string | null;
}

interface CheckInRow {
  id: string;
  chatter_id: string;
  shift_date: string;
  shift_slot: ShiftSlot;
  checked_in_at: string;
  checked_out_at: string | null;
  checkout_note: string | null;
}

const SHIFT_DAY_FMT = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
const CHECKIN_TIME_FMT = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default async function TeamLeaderPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; m?: string }>;
}) {
  const { w, m } = await searchParams;
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");

  const supabase = await createClient();

  // Lecture seule : si ce chatter ne mene aucun modele, cette page ne lui
  // sert a rien (et sans modele mene, les policies RLS ne lui rendraient
  // aucune ligne de toute facon).
  const ledModels = await getLedModels(supabase, profile.userId);
  if (ledModels.length === 0) redirect("/planning");

  const selected = ledModels.find((x) => x.id === m) ?? ledModels[0]!;

  const today = new Date();
  const monday = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? weekStart(new Date(`${w}T12:00:00`)) : weekStart(today);
  const sunday = addDays(monday, 6);
  const todayIso = toDateString(today);

  const [{ data: modelLinks }, { data: assignments }, { data: offRows }] = await Promise.all([
    // Qui est lie a ce modele aujourd'hui (assignation historisee).
    supabase
      .from("chatter_model_assignments")
      .select("chatter_id")
      .eq("model_id", selected.id)
      .lte("assigned_from", todayIso)
      .or(`assigned_to.is.null,assigned_to.gte.${todayIso}`),
    supabase
      .from("chatter_shift_assignments")
      .select("chatter_id, shift_slot, model_id")
      .is("assigned_to", null),
    supabase
      .from("chatter_days_off")
      .select("chatter_id, day_off")
      .gte("day_off", toDateString(monday))
      .lte("day_off", toDateString(sunday)),
  ]);

  const chatterIds = [...new Set((modelLinks ?? []).map((l) => l.chatter_id as string))];

  const [{ data: chatters }, { data: checkIns }] = await Promise.all([
    chatterIds.length > 0
      ? supabase.from("profiles").select("id, full_name").in("id", chatterIds).order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    chatterIds.length > 0
      ? supabase
          .from("shift_check_ins")
          .select("id, chatter_id, shift_date, shift_slot, checked_in_at, checked_out_at, checkout_note")
          .in("chatter_id", chatterIds)
          .gte("shift_date", toDateString(addDays(today, -14)))
          .order("checked_in_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as CheckInRow[] }),
  ]);

  const nameById = new Map((chatters ?? []).map((c) => [c.id, c.full_name]));
  const lateCheckIns = ((checkIns ?? []) as CheckInRow[])
    .filter((c) => isLateCheckIn(c.shift_slot, c.checked_in_at))
    .slice(0, 15);
  const shiftNotes = ((checkIns ?? []) as CheckInRow[])
    .filter((c) => c.checkout_note)
    .sort((a, b) => (b.checked_out_at ?? "").localeCompare(a.checked_out_at ?? ""))
    .slice(0, 15);

  const rowsRaw = (assignments ?? []) as AssignmentRow[];
  const offSet = new Set((offRows ?? []).map((r) => `${r.chatter_id}|${r.day_off}`));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  // Un creneau "tous modeles" (model_id null) couvre aussi ce modele : la
  // RLS le laisse passer car le TL a acces a toutes les lignes du chatter,
  // pas seulement celles scopees sur son modele.
  const rows = (chatters ?? []).map((c) => {
    const mine = rowsRaw.filter((a) => a.chatter_id === c.id && (a.model_id === selected.id || a.model_id === null));
    const covering = sortSlots([...new Set(mine.map((a) => a.shift_slot))]);
    return { ...c, covering };
  });

  const unassigned = rows.filter((r) => r.covering.length === 0).length;
  const coverage = SHIFT_SLOTS.map((slot) => ({
    slot,
    count: rows.filter((r) => r.covering.includes(slot) && !offSet.has(`${r.id}|${todayIso}`)).length,
  }));

  const prev = toDateString(addDays(monday, -7));
  const next = toDateString(addDays(monday, 7));
  const q = (week?: string, modelId?: string) => {
    const p = new URLSearchParams();
    if (week) p.set("w", week);
    p.set("m", modelId ?? selected.id);
    return `/team-leader/planning?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-5">
      <PageHeader
        title="Team planning"
        subtitle={`Who's covering ${selected.name}, slot by slot — read-only.`}
      />

      {ledModels.length > 1 && (
        <Card className="space-y-2">
          <SectionTitle>Model</SectionTitle>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            {ledModels.map((mod) => (
              <Link
                key={mod.id}
                href={q(w, mod.id)}
                className={cn(
                  "flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
                  selected.id === mod.id
                    ? "bg-gradient-to-r from-info/25 to-accent/25 text-foreground shadow-[inset_0_0_0_1px_rgb(56_189_248/0.45)]"
                    : "bg-surface-2 text-muted hover:text-foreground"
                )}
              >
                {mod.name}
                <span className="text-[10px] uppercase opacity-60">{mod.platform}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {coverage.map((c) => {
          return (
            <Card key={c.slot} className="relative overflow-hidden">
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 top-0 h-px bg-gradient-to-r",
                  c.count === 0 ? "from-danger/70 to-danger/0" : "from-info/70 to-info/0"
                )}
              />
              <div className="text-xs font-medium uppercase tracking-wide text-muted">{SLOT_LABEL_EN[c.slot]}</div>
              <p className={cn("tnum mt-1.5 text-2xl font-bold", c.count === 0 ? "text-danger" : "text-foreground")}>
                {c.count}
              </p>
              <p className="text-xs text-muted">
                {c.count === 0 ? "no one today" : c.count > 1 ? "chatters today" : "chatter today"}
              </p>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={q(prev)}
          className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronLeft size={15} /> <span className="hidden sm:inline">Prev. week</span>
        </Link>
        <span className="text-sm font-semibold text-foreground">{weekLabelEn(monday)}</span>
        <Link
          href={q(next)}
          className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <span className="hidden sm:inline">Next</span> <ChevronRight size={15} />
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No chatter is assigned to {selected.name}.</EmptyState>
      ) : (
        <Card className="space-y-4 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>
              Week of {weekLabelEn(monday)} <span className="font-normal text-muted">· {selected.name}</span>
            </SectionTitle>
            {unassigned > 0 && <p className="text-xs text-warning">{unassigned} without a slot</p>}
          </div>

          <div className="min-w-[36rem]">
            <div className="grid grid-cols-[minmax(9rem,1.4fr)_repeat(7,1fr)] gap-1.5 border-b border-border pb-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted">Chatter</span>
              {week.map((d) => {
                const iso = toDateString(d);
                return (
                  <span
                    key={iso}
                    className={cn(
                      "text-center text-[11px] font-medium",
                      iso === todayIso ? "text-accent" : "text-muted"
                    )}
                  >
                    {dayNameEn(d).slice(0, 3)}
                    <span className="block text-[10px] font-normal opacity-70">{dayDateEn(d)}</span>
                  </span>
                );
              })}
            </div>

            <div className="mt-2 space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="grid grid-cols-[minmax(9rem,1.4fr)_repeat(7,1fr)] items-center gap-1.5">
                  <div className="min-w-0 pr-2">
                    <Link
                      href={`/team-leader/chatters/${r.id}`}
                      className="block truncate text-sm font-medium text-foreground hover:text-accent"
                    >
                      {r.full_name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">
                      {r.covering.length > 0 ? sortSlots(r.covering).map((s) => SLOT_LABEL_EN[s]).join(", ") : "—"}
                    </p>
                  </div>

                  {week.map((d) => {
                    const iso = toDateString(d);
                    const isOff = offSet.has(`${r.id}|${iso}`);
                    const label =
                      r.covering.length === 0
                        ? "—"
                        : r.covering.length === 1
                          ? SLOT_LABEL_EN[r.covering[0]!]
                          : `${r.covering.length} shifts`;
                    return (
                      <div
                        key={iso}
                        className={cn(
                          "flex min-h-10 items-center justify-center rounded-lg text-[11px] font-medium",
                          isOff ? "bg-warning/10 text-warning" : "bg-surface-2 text-muted"
                        )}
                      >
                        {isOff ? <CalendarOff size={13} /> : label}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/10 text-warning">
            <AlertCircle size={14} />
          </span>
          <SectionTitle>Recent late check-ins</SectionTitle>
        </div>
        {lateCheckIns.length === 0 ? (
          <p className="text-sm text-muted">No late check-in in the last 14 days.</p>
        ) : (
          <div className="space-y-2">
            {lateCheckIns.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3.5 py-2.5">
                <div className="min-w-0">
                  <Link
                    href={`/team-leader/chatters/${c.chatter_id}`}
                    className="text-sm font-medium text-foreground hover:text-accent"
                  >
                    {nameById.get(c.chatter_id) ?? "—"}
                  </Link>
                  <p className="mt-0.5 text-xs text-muted">
                    {SHIFT_DAY_FMT.format(new Date(`${c.shift_date}T12:00:00`))} · {SLOT_LABEL_EN[c.shift_slot]} ·
                    checked in at {CHECKIN_TIME_FMT.format(new Date(c.checked_in_at))}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-warning">
                  +{lateCheckInMinutes(c.shift_slot, c.checked_in_at)} min
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <MessageSquareQuote size={14} />
          </span>
          <SectionTitle>Team feedback</SectionTitle>
        </div>
        {shiftNotes.length === 0 ? (
          <p className="text-sm text-muted">No feedback yet.</p>
        ) : (
          <div className="space-y-2">
            {shiftNotes.map((c) => (
              <div key={c.id} className="rounded-xl border border-border px-3.5 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/team-leader/chatters/${c.chatter_id}`}
                    className="text-sm font-medium text-foreground hover:text-accent"
                  >
                    {nameById.get(c.chatter_id) ?? "—"}
                  </Link>
                  <span className="text-xs text-muted">
                    {SHIFT_DAY_FMT.format(new Date(`${c.shift_date}T12:00:00`))} · {SLOT_LABEL_EN[c.shift_slot]}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-line border-l-2 border-accent/40 pl-3 text-sm leading-relaxed text-foreground">
                  {c.checkout_note}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="flex items-start gap-3 border-dashed bg-surface-2/40">
        <Crown size={16} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-xs leading-relaxed text-muted">
          Read-only planning — to change a slot or a day OFF, go through your agency. Click a
          chatter's name to add a warning or a penalty.
        </p>
      </Card>
    </div>
  );
}
