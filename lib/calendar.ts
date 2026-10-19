// Dates are calendar days in Europe/Berlin; timed records are ISO instants.
export function today() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(),
  );
}
export function addDays(day: string, n: number) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monday(day: string) {
  return addDays(day, -((new Date(day + "T12:00Z").getUTCDay() + 6) % 7));
}
export function daysBetween(start: string, end: string) {
  const result: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    result.push(d);
    if (result.length > 370)
      throw new Error("Zeitraum darf höchstens ein Jahr umfassen.");
  }
  return result;
}
export function holidays(year: number): Set<string> {
  // Gregorian computus. Hessian public holidays.
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100,
    d = Math.floor(b / 4),
    e = b % 4,
    f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3),
    h = (19 * a + b - d - g + 15) % 30,
    i = Math.floor(c / 4),
    k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7,
    m = Math.floor((a + 11 * h + 22 * l) / 451),
    month = Math.floor((h + l - 7 * m + 114) / 31),
    day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return new Set([
    `${year}-01-01`,
    `${year}-05-01`,
    `${year}-10-03`,
    `${year}-12-25`,
    `${year}-12-26`,
    ...[-2, 1, 39, 50, 60].map((x) => addDays(easter, x)),
  ]);
}
export function workDays(
  start: string,
  end: string,
  workDaysJson: string,
  half = false,
) {
  const wd = JSON.parse(workDaysJson) as number[];
  return (
    daysBetween(start, end).filter(
      (d) =>
        wd.includes(new Date(d + "T12:00Z").getUTCDay()) &&
        !holidays(Number(d.slice(0, 4))).has(d),
    ).length * (half ? 0.5 : 1)
  );
}
export function minute(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
export function hours(shift: {
  start: string;
  end: string;
  break_minutes: number;
}) {
  return (minute(shift.end) - minute(shift.start) - shift.break_minutes) / 60;
}
export function instant(day: string, time: string) {
  const utc = Date.parse(`${day}T${time}:00Z`);
  let result = utc;
  for (let n = 0; n < 3; n++) {
    const parts = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(result));
    const represented = Date.parse(parts.replace(" ", "T") + ":00Z");
    result += utc - represented;
  }
  const formatted = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    dateStyle: "short",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(result));
  if (!formatted.endsWith(time))
    throw new Error("Diese Uhrzeit existiert wegen der Zeitumstellung nicht.");
  return result;
}
export function actualHours(entry: {
  start: string;
  end: string | null;
  break_seconds: number;
}) {
  return entry.end
    ? Math.max(
        0,
        (Date.parse(entry.end) - Date.parse(entry.start)) / 3600000 -
          entry.break_seconds / 3600,
      )
    : 0;
}
export function berlinDay(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(iso),
  );
}
