/**
 * A calendar event as a standard .ics file, built in the browser (no service, no key). Times are "floating":
 * they show at that clock time in whatever calendar opens the file, which is right when you are where the place is.
 */
export interface CalendarEvent {
  title: string;
  /** Local clock time the event starts (its local date and time fields are used as given). */
  start: Date;
  durationMinutes: number;
  location?: string;
  description?: string;
  lat?: number;
  lon?: number;
  url?: string;
  uid?: string;
  /** When the file was made (defaults to now). */
  stamp?: Date;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** 20261007T190000 from a Date's local fields. */
function floating(d: Date): string {
  return `${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** 20261007T120000Z from an instant. */
function utc(d: Date): string {
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** RFC 5545 text escaping: backslash, semicolon, comma, newline. */
export function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Fold a content line at 75 bytes (RFC 5545): continuation lines start with one space. Never splits a character. */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // the leading space of a continuation line counts too
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(ev: CalendarEvent): string {
  const end = new Date(ev.start.getTime() + ev.durationMinutes * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//where-should-we-go//decision spinner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${ev.uid ?? `${floating(ev.start)}-${Math.abs(hash(ev.title))}@where-should-we-go`}`,
    `DTSTAMP:${utc(ev.stamp ?? new Date())}`,
    `DTSTART:${floating(ev.start)}`,
    `DTEND:${floating(end)}`,
    `SUMMARY:${escapeText(ev.title)}`,
  ];
  if (ev.location) lines.push(`LOCATION:${escapeText(ev.location)}`);
  if (ev.description) lines.push(`DESCRIPTION:${escapeText(ev.description)}`);
  if (ev.lat !== undefined && ev.lon !== undefined) lines.push(`GEO:${ev.lat.toFixed(6)};${ev.lon.toFixed(6)}`);
  if (ev.url) lines.push(`URL:${ev.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** A safe file name such as where-should-we-go-hoxton-grill.ics */
export function icsFileName(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "") // drop the accents that NFKD split off
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `where-should-we-go-${slug || "plan"}.ics`;
}

/** Offer the file for download (the browser's own save or open-in-calendar flow). */
export function downloadIcs(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
