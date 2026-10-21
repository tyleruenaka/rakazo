/**
 * The browser's IANA timezone (e.g. "Australia/Sydney"), for timestamp inputs
 * that would otherwise default to UTC. Falls back to UTC when unavailable.
 */
export function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Timezones to offer in pickers: the runtime's IANA list, always including `current`. */
export function timezoneOptions(current?: string | null): string[] {
  const zones = new Set<string>(
    typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [],
  );
  zones.add("UTC");
  if (current) zones.add(current);
  return [...zones].sort((a, b) => a.localeCompare(b));
}

/** The runtime's own spelling of a zone, so aliases such as Asia/Kolkata and Asia/Calcutta match. */
function canonicalTimeZone(zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return zone;
  }
}

export function sameTimeZone(a: string, b: string): boolean {
  return a === b || canonicalTimeZone(a) === canonicalTimeZone(b);
}

const zoneTimeFormats = new Map<string, Intl.DateTimeFormat>();

/** The current time in a zone, such as "7:55 AM", for timezone pickers. */
export function zoneTime(zone: string, locale: string, now = new Date()): string {
  const key = `${locale}|${zone}`;
  let format = zoneTimeFormats.get(key);
  if (!format) {
    try {
      format = new Intl.DateTimeFormat(locale, {
        timeZone: zone,
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
    zoneTimeFormats.set(key, format);
  }
  return format.format(now);
}
