import Link from "next/link";
import { MessageSquareQuote, Clock, Moon } from "lucide-react";
import { getSupabase, getSessionProfile } from "@/lib/session";
import { SLOT_INFO, type ShiftSlot } from "@/lib/shifts";
import { Card } from "@/components/ui/Card";
import { PageHeader, EmptyState, SectionTitle } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";

/**
 * Ressentis de fin de shift, du plus recent au plus ancien.
 *
 * Ecrits par le chatter au moment de depointer, quand il a encore son shift en
 * tete. On les presente groupes par journee : un probleme de modele ou de fan
 * ressort mieux en lisant les trois chatters d'une meme date a la suite qu'en
 * parcourant une liste plate.
 */

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Europe/Paris",
});
const TIME_FMT = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

function formatDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const label = DAY_FMT.format(new Date(y!, m! - 1, d!));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Duree effective du poste, telle que pointee. */
function duration(inAt: string, outAt: string): string {
  const minutes = Math.round((new Date(outAt).getTime() - new Date(inAt).getTime()) / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

interface Row {
  id: string;
  chatter_id: string;
  shift_date: string;
  shift_slot: ShiftSlot;
  checked_in_at: string;
  checked_out_at: string;
  checkout_note: string;
  chatter: { full_name: string } | { full_name: string }[] | null;
}

export default async function RessentisPage() {
  const [supabase, session] = await Promise.all([getSupabase(), getSessionProfile()]);

  const { data } = await supabase
    .from("shift_check_ins")
    .select(
      "id, chatter_id, shift_date, shift_slot, checked_in_at, checked_out_at, checkout_note, chatter:profiles!shift_check_ins_chatter_id_fkey(full_name)"
    )
    .eq("agency_id", session!.agencyId)
    .not("checkout_note", "is", null)
    .order("checked_out_at", { ascending: false })
    .limit(120);

  const rows = ((data ?? []) as Row[]).map((r) => ({
    ...r,
    name: (Array.isArray(r.chatter) ? r.chatter[0] : r.chatter)?.full_name ?? "—",
  }));

  // Groupement par journee de shift, en conservant l'ordre d'arrivee (le plus
  // recent d'abord) plutot qu'un tri alphabetique qui casserait la chronologie.
  const days = new Map<string, typeof rows>();
  for (const r of rows) {
    days.set(r.shift_date, [...(days.get(r.shift_date) ?? []), r]);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ressentis de shift"
        subtitle="Ce que les chatters écrivent en terminant leur poste."
      />

      {rows.length === 0 ? (
        <EmptyState>
          Aucun ressenti pour l&apos;instant. Ils apparaîtront ici dès qu&apos;un chatter terminera
          un shift — le retour est demandé au moment du dépointage.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {[...days.entries()].map(([date, items]) => (
            <div key={date} className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <SectionTitle>{formatDay(date)}</SectionTitle>
                <span className="text-xs text-muted">
                  {items.length} retour{items.length > 1 ? "s" : ""}
                </span>
              </div>

              {items.map((r) => {
                const info = SLOT_INFO[r.shift_slot];
                return (
                  <Card key={r.id} className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/admin/chatters/${r.chatter_id}`}
                        className="text-sm font-semibold text-foreground hover:text-accent"
                      >
                        {r.name}
                      </Link>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          {info?.overnight && <Moon size={11} />}
                          {info?.label ?? r.shift_slot}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} />
                          {TIME_FMT.format(new Date(r.checked_in_at))} →{" "}
                          {TIME_FMT.format(new Date(r.checked_out_at))}
                          <span className="text-muted/70">
                            ({duration(r.checked_in_at, r.checked_out_at)})
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* whitespace-pre-line : le chatter ecrit au telephone, ses
                        retours a la ligne portent du sens. */}
                    <p
                      className={cn(
                        "whitespace-pre-line border-l-2 border-accent/40 pl-3 text-sm leading-relaxed text-foreground"
                      )}
                    >
                      {r.checkout_note}
                    </p>
                  </Card>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <Card className="flex items-start gap-3 border-dashed bg-surface-2/40">
        <MessageSquareQuote size={16} className="mt-0.5 shrink-0 text-muted" />
        <div className="text-xs leading-relaxed text-muted">
          Le retour est obligatoire pour dépointer, avec un minimum de deux lignes — assez pour
          écarter un « rien à signaler », pas assez pour décourager. Les 120 derniers sont affichés.
        </div>
      </Card>
    </div>
  );
}
