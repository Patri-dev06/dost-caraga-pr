import { addDays, addMonths, format, parse } from "date-fns";

// The Monitoring Sheet's period filter: a day, a month or a year of a PR's date, or all time.

export type Period = "all" | "day" | "month" | "year";

/** One period at a time: a day (yyyy-MM-dd), a month (yyyy-MM) or a year (yyyy), or all time. */
export type PeriodValue = { period: Period; date: string; month: string; year: string };

export const FIRST_YEAR = 2020;

export const toDay = (d: Date) => format(d, "yyyy-MM-dd");
export const toMonth = (d: Date) => format(d, "yyyy-MM");
export const parseDay = (s: string) => parse(s, "yyyy-MM-dd", new Date());
export const parseMonth = (s: string) => parse(s, "yyyy-MM", new Date());

export function currentPeriodValue(period: Period = "all"): PeriodValue {
  const now = new Date();
  return { period, date: toDay(now), month: toMonth(now), year: String(now.getFullYear()) };
}

/** "Sep 25, 2026" / "September 2026" / "2026" / "All time". */
export function periodText(value: PeriodValue): string {
  if (value.period === "day") return format(parseDay(value.date), "MMM d, yyyy");
  if (value.period === "month") return format(parseMonth(value.month), "MMMM yyyy");
  if (value.period === "year") return value.year;
  return "All time";
}

/** Moves the chosen day/month/year one step back (-1) or forward (+1). */
export function stepPeriod(value: PeriodValue, dir: -1 | 1): PeriodValue {
  if (value.period === "day") return { ...value, date: toDay(addDays(parseDay(value.date), dir)) };
  if (value.period === "month") return { ...value, month: toMonth(addMonths(parseMonth(value.month), dir)) };
  if (value.period === "year") return { ...value, year: String(Number(value.year) + dir) };
  return value;
}

/** True when stepping forward would land in the future — no PR can be dated there yet. */
export function atLatest(value: PeriodValue): boolean {
  const now = new Date();
  if (value.period === "day") return value.date >= toDay(now);
  if (value.period === "month") return value.month >= toMonth(now);
  if (value.period === "year") return Number(value.year) >= now.getFullYear();
  return true;
}

export function atEarliest(value: PeriodValue): boolean {
  if (value.period === "day") return value.date <= `${FIRST_YEAR}-01-01`;
  if (value.period === "month") return value.month <= `${FIRST_YEAR}-01`;
  if (value.period === "year") return Number(value.year) <= FIRST_YEAR;
  return true;
}
