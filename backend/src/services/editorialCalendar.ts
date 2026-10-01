export function validAnniversary(value: string) {
  if (!/^\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`2000-${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(5, 10) === value;
}

export function validTimeZone(value: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
}

export function localDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekStart(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function anniversaryInWeek(monthDay: string | null, week: string) {
  if (!monthDay || !validAnniversary(monthDay)) return null;
  for (let i = 0; i < 7; i++) {
    const date = addDays(week, i);
    // Em anos não bissextos, a celebração de 29/02 fica em 28/02.
    const leapDay = monthDay === "02-29" && date.slice(5) === "02-28" && addDays(date, 1).slice(5) === "03-01";
    if (date.slice(5) === monthDay || leapDay) return date;
  }
  return null;
}
