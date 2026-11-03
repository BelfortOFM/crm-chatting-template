import { toDateString } from "./period";

/**
 * Creneaux de travail de l'agence. Les valeurs correspondent a la contrainte
 * CHECK de chatter_shift_assignments : toute modification ici doit etre
 * accompagnee d'une migration.
 *
 * `21-03` et `03-09` traversent minuit : le creneau du soir se termine le
 * lendemain matin. C'est pris en compte a l'affichage (mention "le lendemain")
 * et dans le calcul des heures cote base (fn_shift_hours).
 */
export const SHIFT_SLOTS = ["09-15", "15-21", "21-03", "03-09", "depannage"] as const;
export type ShiftSlot = (typeof SHIFT_SLOTS)[number];

export interface SlotInfo {
  slot: ShiftSlot;
  label: string;
  short: string;
  start: string;
  end: string;
  /** Le creneau se termine le jour suivant. */
  overnight: boolean;
}

export const SLOT_INFO: Record<ShiftSlot, SlotInfo> = {
  "09-15": { slot: "09-15", label: "9h → 15h", short: "Matin", start: "09:00", end: "15:00", overnight: false },
  "15-21": { slot: "15-21", label: "15h → 21h", short: "Après-midi", start: "15:00", end: "21:00", overnight: false },
  "21-03": { slot: "21-03", label: "21h → 3h", short: "Soirée", start: "21:00", end: "03:00", overnight: true },
  "03-09": { slot: "03-09", label: "3h → 9h", short: "Nuit", start: "03:00", end: "09:00", overnight: true },
  // Pas un horaire fixe : le chatter est disponible toute la journee pour
  // couvrir un shift au besoin. Traite comme un creneau a part entiere
  // (pointage, heures, rappels, couverture) sur une plage 00h-23h59.
  depannage: {
    slot: "depannage",
    label: "Dépannage",
    short: "Dépannage",
    start: "00:00",
    end: "23:59",
    overnight: false,
  },
};

/**
 * English display labels for SLOT_INFO, used by chatter-facing screens and
 * push notifications (the admin side stays in French, same slot keys).
 */
export const SLOT_LABEL_EN: Record<ShiftSlot, string> = {
  "09-15": "9am → 3pm",
  "15-21": "3pm → 9pm",
  "21-03": "9pm → 3am",
  "03-09": "3am → 9am",
  depannage: "Cover",
};

/**
 * Longueur minimale du ressenti de fin de shift.
 *
 * "Deux ou trois lignes" ne se verifie pas — les retours a la ligne sont
 * optionnels quand on ecrit au telephone. Ce seuil ecarte le "ok" ou le "rien a
 * signaler" sans exiger une redaction. Doit rester aligne avec la contrainte
 * shift_check_ins_note_required en base, qui fait foi.
 */
export const SHIFT_NOTE_MIN_CHARS = 80;

/** Au-dela, c'est un roman ou un copier-coller accidentel. */
export const SHIFT_NOTE_MAX_CHARS = 2000;

export function isShiftSlot(value: string): value is ShiftSlot {
  return (SHIFT_SLOTS as readonly string[]).includes(value);
}

/**
 * "Maintenant", mais avec les getters locaux (getHours, getFullYear...) qui
 * renvoient l'heure de Paris plutot que celle du serveur (UTC en prod).
 *
 * Les horaires de SLOT_INFO ("21h", "3h"...) sont en heure de Paris : comparer
 * now.getHours() a startHour sans cette conversion desynchronise l'app du
 * fuseau du serveur — notamment pour les creneaux de nuit, ou le calcul de
 * `currentShiftDate` se trompait de jour pendant les 2h qui suivent le debut
 * reel du creneau (hiver : 1h).
 */
export function parisNow(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
}

/** Lundi de la semaine contenant `date` (semaine ISO : lundi → dimanche). */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay() : 0 = dimanche. On ramene au lundi precedent.
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export interface PlanningDay {
  date: Date;
  iso: string;
  isToday: boolean;
  isPast: boolean;
  isOff: boolean;
  /** Un chatter peut cumuler plusieurs creneaux (double shift). */
  slots: ShiftSlot[];
}

/**
 * Sept jours a partir de `monday`, en croisant le creneau affecte au chatter
 * et ses jours OFF. Un jour OFF masque le creneau : c'est ce que le chatter
 * doit lire d'un coup d'oeil.
 */
export function buildWeek(
  monday: Date,
  slots: ShiftSlot[],
  daysOff: Set<string>,
  today: Date
): PlanningDay[] {
  const todayIso = toDateString(today);
  const ordered = sortSlots(slots);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const iso = toDateString(date);
    const off = daysOff.has(iso);
    return {
      date,
      iso,
      isToday: iso === todayIso,
      isPast: iso < todayIso,
      isOff: off,
      slots: off ? [] : ordered,
    };
  });
}

/** Creneaux dans l'ordre de la journee, pour une lecture chronologique. */
export function sortSlots(slots: ShiftSlot[]): ShiftSlot[] {
  const order = SHIFT_SLOTS.indexOf.bind(SHIFT_SLOTS);
  return [...slots].sort((a, b) => order(a) - order(b));
}

/** Duree d'un creneau, en heures, deduite de ses horaires (gere le passage de minuit). */
function slotHours(slot: ShiftSlot): number {
  const info = SLOT_INFO[slot];
  const [startH, startM] = info.start.split(":").map(Number);
  const [endH, endM] = info.end.split(":").map(Number);
  let minutes = endH! * 60 + endM! - (startH! * 60 + startM!);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes / 60;
}

/** Duree cumulee des creneaux, en heures (arrondie : l'affichage reste un entier lisible). */
export function totalHours(slots: ShiftSlot[]): number {
  return Math.round(slots.reduce((sum, slot) => sum + slotHours(slot), 0));
}

// Fuseau fixe explicite : dayName/dayDate sont aussi appelees depuis un
// composant client (WeekView, cote chatter). Sans timeZone, Intl formate dans
// le fuseau de l'appareil qui affiche — sur une flotte de telephones dont le
// fuseau systeme n'est pas garanti regle sur la France, le libelle affiche
// (« Samedi 26 ») peut alors ne plus correspondre a la date reellement
// posee, sans que rien ne le signale a l'ecran.
const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", timeZone: "Europe/Paris" });
const DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

export function dayName(date: Date): string {
  const s = DAY_FMT.format(date);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dayDate(date: Date): string {
  return DATE_FMT.format(date);
}

export function weekLabel(monday: Date): string {
  return `${DATE_FMT.format(monday)} → ${DATE_FMT.format(addDays(monday, 6))}`;
}

// English counterparts, for chatter-facing screens (admin keeps the French ones above).
const DAY_FMT_EN = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Europe/Paris" });
const DATE_FMT_EN = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

export function dayNameEn(date: Date): string {
  return DAY_FMT_EN.format(date);
}

export function dayDateEn(date: Date): string {
  return DATE_FMT_EN.format(date);
}

export function weekLabelEn(monday: Date): string {
  return `${DATE_FMT_EN.format(monday)} → ${DATE_FMT_EN.format(addDays(monday, 6))}`;
}

/** Tolerance avant qu'un pointage soit considere en retard — aligne sur le seuil "shift.late" du cron de notifications (route.ts, `after10`). */
export const LATE_CHECKIN_TOLERANCE_MIN = 10;

/**
 * Minutes entre l'heure prevue du creneau et l'heure reelle de pointage
 * (positif = en retard), en heure de Paris. Meme logique de passage de
 * minuit que le cron : un creneau de nuit vu juste apres 0h reste proche de
 * son debut plutot que de paraitre en retard de 20 heures.
 */
export function lateCheckInMinutes(slot: ShiftSlot, checkedInAtIso: string): number {
  const checkedIn = new Date(checkedInAtIso);
  const paris = new Date(checkedIn.toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const checkinMin = paris.getHours() * 60 + paris.getMinutes();

  const info = SLOT_INFO[slot];
  const [startH, startM] = info.start.split(":").map(Number);
  let delta = checkinMin - (startH! * 60 + startM!);
  if (delta < -720) delta += 1440;
  if (delta > 720) delta -= 1440;
  return delta;
}

export function isLateCheckIn(slot: ShiftSlot, checkedInAtIso: string): boolean {
  return lateCheckInMinutes(slot, checkedInAtIso) > LATE_CHECKIN_TOLERANCE_MIN;
}
