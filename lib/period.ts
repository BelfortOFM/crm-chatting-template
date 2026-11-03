export type PeriodNumber = 1 | 2 | 3 | 4;

export interface Period {
  periodNumber: PeriodNumber;
  start: Date;
  end: Date;
}

function lastDayOfMonth(year: number, month: number): number {
  // month is 1-indexed here; day 0 of the next month is the last day of this month
  return new Date(year, month, 0).getDate();
}

function atStartOfDay(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function atEndOfDay(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

/**
 * Returns the fixed pay period boundaries for a given (year, month, periodNumber):
 * P1: 1-7, P2: 8-15, P3: 16-22, P4: 23-end of month (absorbs remaining days).
 */
export function getPeriodBounds(
  year: number,
  month: number,
  periodNumber: PeriodNumber
): Period {
  const lastDay = lastDayOfMonth(year, month);
  switch (periodNumber) {
    case 1:
      return { periodNumber, start: atStartOfDay(year, month, 1), end: atEndOfDay(year, month, 7) };
    case 2:
      return { periodNumber, start: atStartOfDay(year, month, 8), end: atEndOfDay(year, month, 15) };
    case 3:
      return { periodNumber, start: atStartOfDay(year, month, 16), end: atEndOfDay(year, month, 22) };
    case 4:
      return { periodNumber, start: atStartOfDay(year, month, 23), end: atEndOfDay(year, month, lastDay) };
  }
}

/** Returns which of the 4 fixed pay periods a given date falls into. */
export function getPeriodForDate(date: Date): Period {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  let periodNumber: PeriodNumber;
  if (day <= 7) periodNumber = 1;
  else if (day <= 15) periodNumber = 2;
  else if (day <= 22) periodNumber = 3;
  else periodNumber = 4;

  return getPeriodBounds(year, month, periodNumber);
}

/** Returns all 4 pay periods for a given month. */
export function getPeriodsForMonth(year: number, month: number): Period[] {
  return [1, 2, 3, 4].map((n) => getPeriodBounds(year, month, n as PeriodNumber));
}

/** La periode P1-P4 juste avant celle de `date` (P1 d'un mois renvoie P4 du mois precedent). */
export function getPreviousPeriod(date: Date): Period {
  const current = getPeriodForDate(date);
  if (current.periodNumber > 1) {
    return getPeriodBounds(date.getFullYear(), date.getMonth() + 1, (current.periodNumber - 1) as PeriodNumber);
  }
  const prevMonth = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return getPeriodBounds(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 4);
}

/**
 * Bornes d'une periode bi-hebdomadaire : H1 = 1-15, H2 = 16-fin de mois.
 * N'est plus appelee depuis le retrait de Reveal (seule plateforme payee a
 * cette cadence) ; conservee car le typage de lib/payroll.ts y fait encore
 * reference.
 */
export function getBiweeklyPeriodBounds(
  year: number,
  month: number,
  half: 1 | 2
): { start: Date; end: Date } {
  const lastDay = lastDayOfMonth(year, month);
  if (half === 1) {
    return { start: atStartOfDay(year, month, 1), end: atEndOfDay(year, month, 15) };
  }
  return { start: atStartOfDay(year, month, 16), end: atEndOfDay(year, month, lastDay) };
}

/** Les 2 periodes bi-hebdomadaires d'un mois. */
export function getBiweeklyPeriodsForMonth(
  year: number,
  month: number
): { start: Date; end: Date }[] {
  return [1, 2].map((n) => getBiweeklyPeriodBounds(year, month, n as 1 | 2));
}

/** 'YYYY-MM-DD' for N days before today, in the server's local timezone. */
/**
 * Un shift n'est plus modifiable ni supprimable par le chatter 3 jours pleins
 * apres la fin de sa periode de paie.
 *
 * Miroir exact de `fn_shift_date_locked` cote base (migration 0005), qui reste
 * l'autorite : cette version sert a griser les boutons plutot qu'a laisser le
 * chatter buter sur une erreur apres coup. L'agence, elle, n'est pas soumise a
 * ce verrou.
 */
export function isShiftDateLocked(shiftDate: string, today: Date = new Date()): boolean {
  // Midi : evite qu'un fuseau decale la date d'un jour en la reconstruisant.
  const end = getPeriodForDate(new Date(`${shiftDate}T12:00:00`)).end;
  const deadline = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 3, 23, 59, 59, 999);
  return today > deadline;
}

export function toDateStringDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return toDateString(date);
}

/** Formats a Date as a 'YYYY-MM-DD' string usable in SQL date comparisons. */
export function toDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
