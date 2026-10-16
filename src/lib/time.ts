// IST appears only where the client reads it directly: the sheet and the
// feedback email. Everything stored is UTC.
const istParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** "2026-10-13 18:17:39 IST", for the sheet. */
export function formatIst(date: Date): string {
  const part = Object.fromEntries(istParts.formatToParts(date).map((p) => [p.type, p.value]));
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}:${part.second} IST`;
}

const istShortParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "14 Oct 2026, 18:39 IST": the readable form, for the feedback email. */
export function formatIstShort(date: Date): string {
  const part = Object.fromEntries(istShortParts.formatToParts(date).map((p) => [p.type, p.value]));
  return `${part.day} ${part.month} ${part.year}, ${part.hour}:${part.minute} IST`;
}
