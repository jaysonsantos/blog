const DATE_LOCALE = "en-US";
const DATE_TIME_ZONE = "UTC";
const ISO_DATE_LENGTH = "YYYY-MM-DD".length;

const DATE_FORMAT = new Intl.DateTimeFormat(DATE_LOCALE, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: DATE_TIME_ZONE,
});

export function formatDate(date: Date): string {
  return DATE_FORMAT.format(date);
}

/** Compares the calendar days in UTC, the time zone that `formatDate` shows. */
export function isSameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, ISO_DATE_LENGTH) === b.toISOString().slice(0, ISO_DATE_LENGTH);
}
