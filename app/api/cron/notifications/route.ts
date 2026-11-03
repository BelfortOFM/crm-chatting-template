import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser, hasVapidKeys } from "@/lib/push";
import { SHIFT_SLOTS, SLOT_INFO, SLOT_LABEL_EN, type ShiftSlot } from "@/lib/shifts";

/**
 * Declencheur des notifications liees au planning.
 *
 * Appele toutes les 5 minutes par une tache launchd sur le Mac Mini. Protege
 * par un secret partage : l'endpoint agit au nom de tout le monde, il ne doit
 * pas etre declenchable depuis Internet.
 *
 * Toutes les heures sont raisonnees en Europe/Paris — le serveur y est deja
 * regle (TZ dans le plist), mais on ne s'en remet pas a cette configuration.
 */

export const dynamic = "force-dynamic";

/** Fenetre de tolerance : la tache tourne toutes les 5 min, on couvre 6. */
const WINDOW_MIN = 6;

interface Expected {
  chatter_id: string;
  full_name: string;
  checked_in: boolean;
}

function parisNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
}

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Debut du creneau, exprime en minutes depuis minuit, et le jour auquel il se
 * rattache. Un creneau de nuit (21h-3h) demarre le jour meme ; celui de 3h-9h
 * aussi, mais un rappel envoye a 2h40 concerne bien le jour qui commence.
 */
function slotStartMinutes(slot: ShiftSlot): number {
  return Number(SLOT_INFO[slot].start.slice(0, 2)) * 60;
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!hasVapidKeys()) {
    return NextResponse.json({ error: "Clés VAPID absentes." }, { status: 500 });
  }

  const admin = createAdminClient();

  // `?at=HH:MM` rejoue le declencheur a une heure donnee. Reserve au porteur
  // du secret : sans cela, une logique entierement dependante de l'heure ne
  // serait verifiable qu'en attendant le bon moment de la journee.
  const at = request.nextUrl.searchParams.get("at");
  const now = parisNow();
  if (at && /^\d{2}:\d{2}$/.test(at)) {
    const [h, m] = at.split(":").map(Number);
    now.setHours(h!, m!, 0, 0);
  }
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = iso(now);

  const { data: agencies } = await admin.from("agencies").select("id");
  const actions: string[] = [];

  /** N'envoie qu'une fois : la cle porte le destinataire, le type et le jour. */
  async function sendOnce(
    agencyId: string,
    userId: string,
    kind: string,
    key: string,
    payload: { title: string; body: string; url?: string; tag?: string }
  ) {
    const { error } = await admin
      .from("notification_log")
      .insert({ agency_id: agencyId, user_id: userId, kind, dedupe_key: key });
    // Conflit d'unicite = deja envoyee lors d'un passage precedent.
    if (error) return;

    const res = await sendPushToUser(admin, userId, payload);
    actions.push(`${kind} -> ${userId.slice(0, 8)} (${res.sent} envoi${res.sent > 1 ? "s" : ""})`);
  }

  for (const agency of agencies ?? []) {
    const agencyId = agency.id as string;

    const { data: admins } = await admin
      .from("profiles")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("role", "agency_admin")
      .eq("active", true);

    for (const slot of SHIFT_SLOTS) {
      const start = slotStartMinutes(slot);
      // Ecart signe entre maintenant et le debut du creneau, en tenant compte
      // du passage de minuit (un creneau a 3h vu depuis 23h50 est a +3h10).
      let delta = start - nowMin;
      if (delta < -720) delta += 1440;
      if (delta > 720) delta -= 1440;

      const inWindow = (target: number) => delta <= target && delta > target - WINDOW_MIN;

      const before20 = inWindow(20); // rappel avant la prise de poste
      const after10 = inWindow(-10); // relance du chatter
      const after15 = inWindow(-15); // escalade vers l'admin
      const coverage = inWindow(60); // alerte de couverture, 1 h avant

      if (!before20 && !after10 && !after15 && !coverage) continue;

      // Le jour concerne : pour un creneau de nuit vu apres minuit, c'est la veille.
      const shiftDay = delta > 0 && start < 360 && now.getHours() >= 12 ? iso(new Date(now.getTime() + 86400000)) : today;

      const { data } = await admin.rpc("fn_expected_chatters", {
        p_agency_id: agencyId,
        p_shift_date: shiftDay,
        p_slot: slot,
      });
      const expected = (data ?? []) as Expected[];
      if (expected.length === 0 && !coverage) continue;

      if (coverage && expected.length === 0) {
        for (const a of admins ?? []) {
          await sendOnce(agencyId, a.id as string, "coverage.gap", `coverage|${agencyId}|${shiftDay}|${slot}`, {
            title: "Créneau non couvert",
            body: `Personne n'est prévu de ${SLOT_INFO[slot].label} (${shiftDay}).`,
            url: "/admin/planning",
            tag: "coverage",
          });
        }
      }

      for (const c of expected) {
        if (before20) {
          await sendOnce(agencyId, c.chatter_id, "shift.reminder", `reminder|${c.chatter_id}|${shiftDay}|${slot}`, {
            title: "Your shift starts soon",
            body: `Check-in at ${SLOT_INFO[slot].start} — don't forget to check in.`,
            url: "/planning",
            tag: "shift",
          });
        }

        if (after10 && !c.checked_in) {
          await sendOnce(agencyId, c.chatter_id, "shift.late", `late|${c.chatter_id}|${shiftDay}|${slot}`, {
            title: "You haven't checked in yet",
            body: `Your ${SLOT_LABEL_EN[slot]} shift has started. Check in from your planning.`,
            url: "/planning",
            tag: "shift",
          });
        }

        if (after15 && !c.checked_in) {
          for (const a of admins ?? []) {
            await sendOnce(
              agencyId,
              a.id as string,
              "shift.late.admin",
              `late-admin|${c.chatter_id}|${shiftDay}|${slot}`,
              {
                title: "Retard de prise de poste",
                body: `${c.full_name} n'a pas pointé (${SLOT_INFO[slot].label}, depuis 15 min).`,
                url: "/admin/planning",
                tag: "late",
              }
            );
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, at: now.toISOString(), actions });
}
