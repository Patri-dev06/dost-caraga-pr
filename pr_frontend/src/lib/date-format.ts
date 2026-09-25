import { format, isValid, parse } from "date-fns";

// Dates picked on a calendar are stored as "yyyy-MM-dd" and shown the way official documents write
// them ("September 30, 2026"). Older values typed as free text are shown exactly as typed.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The calendar date in a "yyyy-MM-dd" value, or undefined for free text / empty. */
export function parseIsoDate(value: string | null | undefined): Date | undefined {
  if (!value || !ISO_DATE.test(value)) return undefined;
  const date = parse(value, "yyyy-MM-dd", new Date());
  return isValid(date) ? date : undefined;
}

export const toIsoDate = (date: Date) => format(date, "yyyy-MM-dd");

/** "2026-09-30" → "September 30, 2026"; anything else (older free text) is returned unchanged. */
export function formatLongDate(value: string | null | undefined): string {
  const date = parseIsoDate(value);
  return date ? format(date, "MMMM d, yyyy") : (value ?? "");
}
