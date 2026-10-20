/**
 * The dashboard's monthly cycles, in Philippine time (UTC+8, no daylight
 * saving). A cycle is one calendar month: it starts at Philippine midnight on
 * the 1st (the very first cycle starts on the day of the first order instead)
 * and ends at 23:59:59 on the month's last day; the next one starts the
 * moment it ends. Dates are handled as plain UTC instants shifted by the
 * fixed +8 offset, so no time zone database is needed.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

/** Philippine midnight at or before `instant`. */
export const manilaMidnight = (instant: Date): Date =>
  new Date(Math.floor((instant.getTime() + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS - MANILA_OFFSET_MS);

/** Philippine midnight at the start of the calendar date "2026-09-19". */
export const manilaDayStart = (dateKey: string): Date => {
  const [year, month, day] = dateKey.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day) - MANILA_OFFSET_MS);
};

/** Philippine midnight right after the calendar date "2026-09-22" (the exclusive end of that day). */
export const manilaDayEndExclusive = (dateKey: string): Date => new Date(manilaDayStart(dateKey).getTime() + DAY_MS);

/** Whether "YYYY-MM-DD" names a real calendar date (not 2026-02-31). */
export const isCalendarDate = (dateKey: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(dateKey) && manilaDateKey(manilaDayStart(dateKey)) === dateKey;

/** Exclusive end of the cycle starting at `start`: Philippine midnight on the 1st of the next month (= the next cycle's start). */
export const cycleEndExclusive = (start: Date): Date => {
  const manila = new Date(start.getTime() + MANILA_OFFSET_MS);
  return new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth() + 1, 1) - MANILA_OFFSET_MS);
};

/** The cycle's last second, shown as its end ("... 23:59:59"). */
export const cycleLastSecond = (start: Date): Date => new Date(cycleEndExclusive(start).getTime() - 1000);

/** "2026-09-19" - the Philippine calendar date of `instant`. */
export const manilaDateKey = (instant: Date): string => new Date(instant.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);

/** "2026-09-19T00:00:00+08:00" - an instant written in Philippine time. */
export const toManilaIso = (instant: Date): string =>
  `${new Date(instant.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 19)}+08:00`;

/** Every Philippine calendar date from `start` up to (not including) `endExclusive`. */
export const manilaDaysBetween = (start: Date, endExclusive: Date): string[] => {
  const days: string[] = [];
  for (let time = manilaMidnight(start).getTime(); time < endExclusive.getTime(); time += DAY_MS) {
    days.push(manilaDateKey(new Date(time)));
  }
  return days;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 01, 2026 00:00" in Philippine time (24-hour). */
export const formatManilaDateTime = (instant: Date): string => {
  const iso = toManilaIso(instant);
  const [year, month, day] = iso.slice(0, 10).split('-') as [string, string, string];
  return `${MONTHS[Number(month) - 1]} ${day}, ${year} ${iso.slice(11, 16)}`;
};

/** "Cycle #1: Sep 19, 2026 00:00 – Sep 30, 2026 23:59" */
export const cycleTitle = (cycleNumber: number, start: Date): string =>
  `Cycle #${cycleNumber}: ${formatManilaDateTime(start)} – ${formatManilaDateTime(cycleLastSecond(start))}`;
