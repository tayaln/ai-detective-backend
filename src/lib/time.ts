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

/** "2026-10-13 18:17:39 IST". The one place a local timezone appears. */
export function formatIst(date: Date): string {
  const part = Object.fromEntries(istParts.formatToParts(date).map((p) => [p.type, p.value]));
  return `${part.year}-${part.month}-${part.day} ${part.hour}:${part.minute}:${part.second} IST`;
}
