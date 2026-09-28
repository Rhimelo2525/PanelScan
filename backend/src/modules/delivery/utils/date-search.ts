/**
 * Turns a free-text search like "Sep 19", "September 19, 2026",
 * "2026-09-19", "09/19/2026" or "19" into the calendar days it refers to,
 * as UTC instant ranges for Prisma `gte`/`lt` filters.
 *
 * Days are PanelScan business days in Asia/Manila (UTC+8, no daylight
 * saving) - the same timezone the admin tables display dates in - so an
 * order at 11:30 PM on Sep 19 Manila time is on Sep 19, never shifted to
 * Sep 20 by UTC.
 */

export interface DayRange {
  gte: Date;
  lt: Date;
}

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Without a year, "Sep 19" matches that day in each of these years around now - bounded so the query stays small. */
const YEARS_BACK = 5;
const YEARS_AHEAD = 1;

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** "sep", "sept.", "september" -> 9. At least three letters, and only a real month name's prefix. */
const monthFromName = (word: string): number | null => {
  const lower = word.toLowerCase().replace(/\.$/, '');
  if (lower.length < 3) return null;
  const index = MONTH_NAMES.findIndex((name) => name.startsWith(lower));
  return index >= 0 ? index + 1 : null;
};

const isValidDay = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/** One Manila calendar day as a UTC range: [00:00, next 00:00) Manila time. */
export const manilaDayRange = (year: number, month: number, day: number): DayRange => {
  const start = Date.UTC(year, month - 1, day) - MANILA_OFFSET_MS;
  return { gte: new Date(start), lt: new Date(start + DAY_MS) };
};

const currentManilaYear = (now: Date): number => new Date(now.getTime() + MANILA_OFFSET_MS).getUTCFullYear();

const yearsAround = (now: Date): number[] => {
  const current = currentManilaYear(now);
  const years: number[] = [];
  for (let year = current - YEARS_BACK; year <= current + YEARS_AHEAD; year++) years.push(year);
  return years;
};

const rangesFor = (month: number, day: number, year: number | null, now: Date): DayRange[] =>
  (year === null ? yearsAround(now) : [year]).filter((y) => isValidDay(y, month, day)).map((y) => manilaDayRange(y, month, day));

/**
 * The day ranges a search term refers to, or [] when it isn't a date.
 * A bare day number ("19") matches that day of every month in the bounded
 * year window; anything that isn't clearly a date returns [] so ordinary
 * text searches (names, order numbers, booking ids) are unaffected.
 */
export function parseDateSearch(input: string, now: Date = new Date()): DayRange[] {
  const term = input.trim().replace(/\s+/g, ' ');
  if (!term) return [];

  // 2026-09-19 / 2026/9/19
  let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(term);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return isValidDay(year, month, day) ? [manilaDayRange(year, month, day)] : [];
  }

  // 09/19/2026 / 9-19-2026 (month first, as the Philippines writes it) / 09/19
  match = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/.exec(term);
  if (match) {
    const [month, day] = [Number(match[1]), Number(match[2])];
    return rangesFor(month, day, match[3] ? Number(match[3]) : null, now);
  }

  // Sep 19 / Sept. 19, 2026 / September 19 2026
  match = /^([a-z]+\.?) (\d{1,2})(?:,? (\d{4}))?$/i.exec(term.replace(/,(?=\S)/g, ', '));
  if (match) {
    const month = monthFromName(match[1] ?? '');
    return month ? rangesFor(month, Number(match[2]), match[3] ? Number(match[3]) : null, now) : [];
  }

  // 19 Sep / 19 September 2026
  match = /^(\d{1,2}) ([a-z]+\.?)(?:,? (\d{4}))?$/i.exec(term);
  if (match) {
    const month = monthFromName(match[2] ?? '');
    return month ? rangesFor(month, Number(match[1]), match[3] ? Number(match[3]) : null, now) : [];
  }

  // 19 - that day of any month (bounded to the year window)
  match = /^(\d{1,2})$/.exec(term);
  if (match) {
    const day = Number(match[1]);
    if (day < 1 || day > 31) return [];
    return yearsAround(now).flatMap((year) => Array.from({ length: 12 }, (_, i) => i + 1).filter((month) => isValidDay(year, month, day)).map((month) => manilaDayRange(year, month, day)));
  }

  return [];
}
