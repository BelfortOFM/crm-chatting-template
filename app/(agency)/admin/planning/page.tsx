import Link from "next/link";
import { ChevronLeft, ChevronRight, Users, CalendarOff, Moon, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { toDateString } from "@/lib/period";
import { weekStart, addDays, weekLabel, dayName, dayDate, sortSlots, SHIFT_SLOTS, SLOT_INFO, type ShiftSlot } from "@/lib/shifts";
import { Card } from "@/components/ui/Card";
import { PageHeader, EmptyState, SectionTitle } from "@/components/ui/PageHeader";
import { SlotPicker, DayCell, type InheritedSlot } from "./SlotPicker";
import { cn } from "@/lib/utils";

interface ModelRow {
  id: string;
  name: string;
  platform: string;
}

interface AssignmentRow {
  chatter_id: string;
  shift_slot: ShiftSlot;
  model_id: string | null;
}

export default async function AdminPlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string; m?: string }>;
}) {
  const { w, m } = await searchParams;
  const supabase = await createClient();

  const today = new Date();
  const monday = w && /^\d{4}-\d{2}-\d{2}$/.test(w) ? weekStart(new Date(`${w}T12:00:00`)) : weekStart(today);
  const sunday = addDays(monday, 6);
  const todayIso = toDateString(today);

  const [{ data: models }, { data: chatters }, { data: assignments }, { data: offRows }, { data: modelLinks }] =
    await Promise.all([
      supabase.from("models").select("id, name, platform").eq("active", true).order("name"),
      supabase.from("profiles").select("id, full_name").eq("role", "chatter").eq("active", true).order("full_name"),
      supabase
        .from("chatter_shift_assignments")
        .select("chatter_id, shift_slot, model_id")
        .is("assigned_to", null),
      supabase
        .from("chatter_days_off")
        .select("chatter_id, day_off")
        .gte("day_off", toDateString(monday))
        .lte("day_off", toDateString(sunday)),
      // Qui travaille sur quel modele aujourd'hui. L'affectation est
      // historisee : on ne garde que celles en cours a la date du jour.
      supabase
        .from("chatter_model_assignments")
        .select("chatter_id, model_id")
        .lte("assigned_from", todayIso)
        .or(`assigned_to.is.null,assigned_to.gte.${todayIso}`),
    ]);

  const modelList = (models ?? []) as ModelRow[];
  // On valide `m` contre les modeles reels : un identifiant fantaisiste dans
  // l'URL retombe sur la vue globale plutot que d'afficher une page vide.
  const selected = modelList.find((x) => x.id === m) ?? null;
  const modelName = new Map(modelList.map((x) => [x.id, x.name]));

  const rowsRaw = (assignments ?? []) as AssignmentRow[];
  const offSet = new Set((offRows ?? []).map((r) => `${r.chatter_id}|${r.day_off}`));
  const week = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  // Chatters a afficher. En vue modele : ceux qui lui sont affectes, plus ceux
  // qui ont deja un creneau dessus — sinon une affectation retiree ferait
  // disparaitre un creneau encore actif, sans moyen de le corriger.
  const linkedToModel = new Set(
    ((modelLinks ?? []) as { chatter_id: string; model_id: string }[])
      .filter((l) => selected && l.model_id === selected.id)
      .map((l) => l.chatter_id)
  );
  if (selected) {
    for (const a of rowsRaw) if (a.model_id === selected.id) linkedToModel.add(a.chatter_id);
  }

  const visible = (chatters ?? []).filter((c) => !selected || linkedToModel.has(c.id));

  const rows = visible.map((c) => {
    const mine = rowsRaw.filter((a) => a.chatter_id === c.id);
    // Portee modifiable ici, et portee voisine affichee en lecture seule.
    const scoped = mine.filter((a) => (selected ? a.model_id === selected.id : a.model_id === null));
    const other = mine.filter((a) => (selected ? a.model_id === null : a.model_id !== null));

    const slots = sortSlots(scoped.map((a) => a.shift_slot));
    const inherited: InheritedSlot[] = other.map((a) => ({
      slot: a.shift_slot,
      label: selected ? "tous modèles" : (modelName.get(a.model_id!) ?? "modèle"),
    }));
    // Qui est reellement en poste sur cette plage, toutes portees confondues.
    const covering = sortSlots([...new Set([...slots, ...other.map((a) => a.shift_slot)])]);

    return { ...c, slots, inherited, covering };
  });

  const unassigned = rows.filter((r) => r.covering.length === 0).length;

  // Couverture : combien de personnes travaillent sur chaque créneau aujourd'hui.
  const coverage = SHIFT_SLOTS.map((slot) => ({
    slot,
    count: rows.filter((r) => r.covering.includes(slot) && !offSet.has(`${r.id}|${todayIso}`)).length,
  }));

  const prev = toDateString(addDays(monday, -7));
  const next = toDateString(addDays(monday, 7));
  const q = (week?: string, model?: string | null) => {
    const p = new URLSearchParams();
    if (week) p.set("w", week);
    if (model) p.set("m", model);
    const s = p.toString();
    return s ? `/admin/planning?${s}` : "/admin/planning";
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Planning"
        subtitle={
          selected
            ? `Qui couvre ${selected.name}, créneau par créneau.`
            : "Créneau de chaque chatter et jours OFF de la semaine."
        }
      />

      {/* Choix du modele. La vue globale reste le point de depart : c'est la
          qu'on lit la charge reelle de chaque personne, tous comptes confondus. */}
      {modelList.length > 0 && (
        <Card className="space-y-2">
          <SectionTitle>Modèle</SectionTitle>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
            <ModelPill href={q(w, null)} active={!selected} label="Tous les modèles" />
            {modelList.map((mod) => (
              <ModelPill
                key={mod.id}
                href={q(w, mod.id)}
                active={selected?.id === mod.id}
                label={mod.name}
                hint={mod.platform}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Couverture du jour : le trou de couverture est ce qu'un responsable
          doit voir en premier, avant le detail par personne. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {coverage.map((c) => {
          const info = SLOT_INFO[c.slot];
          return (
            <Card key={c.slot} className="relative overflow-hidden">
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 top-0 h-px bg-gradient-to-r",
                  c.count === 0 ? "from-danger/70 to-danger/0" : "from-info/70 to-info/0"
                )}
              />
              <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                {info.overnight && <Moon size={12} />}
                {info.label}
              </div>
              <p className={cn("tnum mt-1.5 text-2xl font-bold", c.count === 0 ? "text-danger" : "text-foreground")}>
                {c.count}
              </p>
              <p className="text-xs text-muted">
                {c.count === 0 ? "personne aujourd'hui" : c.count > 1 ? "chatters aujourd'hui" : "chatter aujourd'hui"}
              </p>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Link
          href={q(prev, selected?.id)}
          className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <ChevronLeft size={15} /> <span className="hidden sm:inline">Semaine préc.</span>
        </Link>
        <span className="text-sm font-semibold text-foreground">{weekLabel(monday)}</span>
        <Link
          href={q(next, selected?.id)}
          className="flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <span className="hidden sm:inline">Suiv.</span> <ChevronRight size={15} />
        </Link>
      </div>

      {rows.length === 0 ? (
        selected ? (
          <EmptyState>
            <span className="block">Aucun chatter n&apos;est affecté à {selected.name}.</span>
            <Link
              href="/admin/chatters"
              className="mt-2 inline-flex items-center gap-1.5 text-accent hover:underline"
            >
              <UserPlus size={14} /> Affecter un chatter à ce modèle
            </Link>
          </EmptyState>
        ) : (
          <EmptyState>Aucun chatter actif à planifier.</EmptyState>
        )
      ) : (
        <Card className="space-y-4 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>
              Semaine du {weekLabel(monday)}
              {selected && <span className="ml-1.5 font-normal text-muted">· {selected.name}</span>}
            </SectionTitle>
            <p className="text-xs text-muted">
              Clique une case pour poser ou lever un jour OFF · {unassigned > 0 && (
                <span className="text-warning">{unassigned} sans créneau</span>
              )}
            </p>
          </div>

          <div className="min-w-[42rem]">
            {/* En-tête des jours */}
            <div className="grid grid-cols-[minmax(11rem,1.4fr)_repeat(7,1fr)] gap-1.5 border-b border-border pb-2">
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
                    {dayName(d).slice(0, 3)}
                    <span className="block text-[10px] font-normal opacity-70">{dayDate(d)}</span>
                  </span>
                );
              })}
            </div>

            <div className="mt-2 space-y-2">
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="grid grid-cols-[minmax(11rem,1.4fr)_repeat(7,1fr)] items-center gap-1.5"
                >
                  <div className="min-w-0 pr-2">
                    <Link
                      href={`/admin/chatters/${r.id}`}
                      className="block truncate text-sm font-medium text-foreground hover:text-accent"
                    >
                      {r.full_name}
                    </Link>
                    <div className="mt-1">
                      <SlotPicker
                        chatterId={r.id}
                        current={r.slots}
                        inherited={r.inherited}
                        modelId={selected?.id ?? null}
                      />
                    </div>
                  </div>

                  {week.map((d) => {
                    const iso = toDateString(d);
                    return (
                      <DayCell
                        key={iso}
                        chatterId={r.id}
                        iso={iso}
                        isOff={offSet.has(`${r.id}|${iso}`)}
                        hasSlot={r.covering.length > 0}
                        isToday={iso === todayIso}
                        isPast={iso < todayIso}
                        label={
                          r.covering.length === 0
                            ? "—"
                            : r.covering.length === 1
                              ? SLOT_INFO[r.covering[0]!].label.replace(/h/g, "")
                              : `${r.covering.length} shifts`
                        }
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card className="flex items-start gap-3 border-dashed bg-surface-2/40">
        <Users size={16} className="mt-0.5 shrink-0 text-muted" />
        <div className="text-xs leading-relaxed text-muted">
          {selected ? (
            <>
              Tu assignes ici les créneaux <strong className="text-foreground">propres à {selected.name}</strong>.
              Les créneaux marqués « tous modèles » viennent de la vue globale : ils couvrent déjà ce
              modèle, et se modifient depuis <strong className="text-foreground">Tous les modèles</strong>.
            </>
          ) : (
            <>
              Ici tu poses des créneaux <strong className="text-foreground">valables sur tous les modèles</strong>{" "}
              du chatter. Choisis un modèle en haut pour planifier un créneau qui ne concerne que
              lui. Un chatter peut cumuler plusieurs créneaux (double shift) : clique-les pour les
              activer ou les retirer, ce qui conserve la trace du passé.
            </>
          )}{" "}
          Les chatters posent eux-mêmes{" "}
          <strong className="text-foreground">plusieurs jours OFF par semaine</strong>, sur des jours à
          venir. Toi aussi, tu peux poser ou lever un jour OFF en cliquant n&apos;importe quelle case{" "}
          <CalendarOff size={11} className="inline" />.
        </div>
      </Card>
    </div>
  );
}

function ModelPill({
  href,
  active,
  label,
  hint,
}: {
  href: string;
  active: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors",
        active
          ? "bg-gradient-to-r from-info/25 to-accent/25 text-foreground shadow-[inset_0_0_0_1px_rgb(56_189_248/0.45)]"
          : "bg-surface-2 text-muted hover:text-foreground"
      )}
    >
      {label}
      {hint && <span className="text-[10px] uppercase opacity-60">{hint}</span>}
    </Link>
  );
}
