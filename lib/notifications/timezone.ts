import { DAILY_DIGEST_TIME_ZONE } from "@/lib/notifications/types";

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

type LocalDateParts = Pick<ZonedParts, "year" | "month" | "day">;

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  partsFormatterCache.set(timeZone, formatter);
  return formatter;
}

export function getZonedParts(date: Date, timeZone = DAILY_DIGEST_TIME_ZONE): ZonedParts {
  const pieces = getFormatter(timeZone).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(pieces.find((piece) => piece.type === type)?.value ?? "0");

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function getOffsetMs(date: Date, timeZone: string): number {
  const zoned = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    zoned.year,
    zoned.month - 1,
    zoned.day,
    zoned.hour,
    zoned.minute,
    zoned.second,
  );
  return asUtc - date.getTime();
}

export function zonedTimeToUtc(
  parts: ZonedParts,
  timeZone = DAILY_DIGEST_TIME_ZONE,
): Date {
  let utcTime = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  for (let i = 0; i < 2; i += 1) {
    const candidate = new Date(utcTime);
    utcTime =
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      ) - getOffsetMs(candidate, timeZone);
  }

  return new Date(utcTime);
}

export function shiftLocalDate(
  date: LocalDateParts,
  days: number,
): LocalDateParts {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day));
  value.setUTCDate(value.getUTCDate() + days);
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

export function formatLocalDateKey(date: LocalDateParts): string {
  return [
    String(date.year).padStart(4, "0"),
    String(date.month).padStart(2, "0"),
    String(date.day).padStart(2, "0"),
  ].join("-");
}

export function resolveDigestDate(
  now: Date,
  timeZone = DAILY_DIGEST_TIME_ZONE,
): LocalDateParts {
  const parts = getZonedParts(now, timeZone);
  return { year: parts.year, month: parts.month, day: parts.day };
}

export function getDailyDigestWindow(
  now: Date,
  timeZone = DAILY_DIGEST_TIME_ZONE,
): {
  digestDate: string;
  windowStart: Date;
  windowEnd: Date;
} {
  const digestDay = resolveDigestDate(now, timeZone);
  const previousDay = shiftLocalDate(digestDay, -1);

  const windowStart = zonedTimeToUtc(
    { ...previousDay, hour: 17, minute: 0, second: 0 },
    timeZone,
  );
  const windowEnd = zonedTimeToUtc(
    { ...digestDay, hour: 9, minute: 0, second: 0 },
    timeZone,
  );

  return {
    digestDate: formatLocalDateKey(digestDay),
    windowStart,
    windowEnd,
  };
}

export function isDigestHour(
  now: Date,
  timeZone = DAILY_DIGEST_TIME_ZONE,
): boolean {
  return getZonedParts(now, timeZone).hour === 9;
}

export function formatEtWindowLabel(startIso: string, endIso: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: DAILY_DIGEST_TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return `${formatter.format(new Date(startIso))} to ${formatter.format(new Date(endIso))}`;
}
