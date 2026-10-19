import { all, one } from "./db";
import {
  addDays,
  daysBetween,
  hours,
  instant,
  minute,
  monday,
} from "./calendar";
import type { Availability, Leave, Rules, Shift, User } from "./types";
export function rules() {
  return JSON.parse(
    one<{ value: string }>("SELECT value FROM meta WHERE key=?", "rules")!
      .value,
  ) as Rules;
}
export function conflicts(
  shift: Omit<Shift, "id" | "version"> & { id?: number },
  user: User,
  ignoreIds: number[] = [],
): string[] {
  const errors: string[] = [];
  const r = rules();
  const duration = hours(shift);
  if (duration <= 0 || minute(shift.end) <= minute(shift.start)) {
    return ["Schichtende muss am selben Tag nach dem Beginn liegen."];
  }
  if (duration > r.max_daily)
    errors.push(`Mehr als ${r.max_daily} Arbeitsstunden pro Tag.`);
  if (duration > 6 && shift.break_minutes < r.minimum_break)
    errors.push(
      `Ab 6 Stunden sind mindestens ${r.minimum_break} Minuten Pause nötig.`,
    );
  if (duration > 9 && shift.break_minutes < 45)
    errors.push("Ab 9 Stunden sind mindestens 45 Minuten Pause nötig.");
  if (
    shift.required_skill &&
    !JSON.parse(user.qualifications).includes(shift.required_skill)
  )
    errors.push(`Qualifikation „${shift.required_skill}“ fehlt.`);
  if (
    all<Leave>(
      "SELECT * FROM leaves WHERE user_id=? AND status='approved' AND start<=? AND end>=?",
      user.id,
      shift.day,
      shift.day,
    ).length
  )
    errors.push("Genehmigte Abwesenheit an diesem Tag.");
  if (
    one<Availability>(
      "SELECT * FROM availability WHERE user_id=? AND day=? AND available=0",
      user.id,
      shift.day,
    )
  )
    errors.push("Mitarbeiter ist an diesem Tag nicht verfügbar.");
  const existing = all<Shift>(
    "SELECT * FROM shifts WHERE user_id=? AND status!='cancelled' AND day>=? AND day<=?",
    user.id,
    addDays(monday(shift.day), -1),
    addDays(monday(shift.day), 7),
  ).filter((s) => s.id !== shift.id && !ignoreIds.includes(s.id));
  const start = instant(shift.day, shift.start),
    end = instant(shift.day, shift.end);
  let daily = duration,
    weekly = duration;
  for (const s of existing) {
    const a = instant(s.day, s.start),
      b = instant(s.day, s.end);
    if (s.day >= monday(shift.day) && s.day <= addDays(monday(shift.day), 6))
      weekly += hours(s);
    if (s.day === shift.day) daily += hours(s);
    if (start < b && end > a)
      errors.push("Überschneidung mit einer bestehenden Schicht.");
    else if (
      (start >= b && (start - b) / 3600000 < r.rest_hours) ||
      (a >= end && (a - end) / 3600000 < r.rest_hours)
    )
      errors.push(
        `Weniger als ${r.rest_hours} Stunden Ruhezeit zwischen zwei Schichten.`,
      );
  }
  if (
    daily > r.max_daily &&
    !errors.some((e) => e.includes("Arbeitsstunden pro Tag"))
  )
    errors.push("Die tägliche Arbeitszeitgrenze wird insgesamt überschritten.");
  if (weekly > r.max_weekly)
    errors.push(`Mehr als ${r.max_weekly} Arbeitsstunden in dieser Woche.`);
  return [...new Set(errors)];
}
export function balance(user: User, year: number) {
  const total = user.allowance + user.carry;
  const leaves = all<Leave>(
    "SELECT * FROM leaves WHERE user_id=? AND kind='vacation' AND status IN ('approved','pending') AND start>=? AND end<=?",
    user.id,
    `${year}-01-01`,
    `${year}-12-31`,
  );
  const used = leaves
      .filter((l) => l.status === "approved")
      .reduce((s, l) => s + l.days, 0),
    reserved = leaves
      .filter((l) => l.status === "pending")
      .reduce((s, l) => s + l.days, 0);
  return {
    allowance: total,
    used,
    reserved,
    remaining: total - used - reserved,
  };
}
export function overlapLeave(
  userId: number,
  start: string,
  end: string,
  exclude = 0,
) {
  return one<Leave>(
    "SELECT * FROM leaves WHERE user_id=? AND id!=? AND status IN ('pending','approved') AND start<=? AND end>=?",
    userId,
    exclude,
    end,
    start,
  );
}
export function coverage(
  shifts: Shift[],
  people: User[],
  team: number,
  from: string,
  to: string,
  minimum: number,
) {
  return daysBetween(from, to)
    .filter((d) => new Date(d + "T12:00Z").getUTCDay() % 6 !== 0)
    .map((day) => ({
      day,
      count: new Set(
        shifts
          .filter(
            (s) =>
              s.day === day &&
              s.status !== "cancelled" &&
              people.some((p) => p.id === s.user_id && p.team_id === team),
          )
          .map((s) => s.user_id),
      ).size,
      minimum,
    }));
}
