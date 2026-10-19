import { all, one } from "./db";
import { visiblePeople } from "./auth";
import { balance, rules } from "./scheduling";
import { today } from "./calendar";
import type {
  Availability,
  Entry,
  Leave,
  Notice,
  Shift,
  Snapshot,
  Swap,
  Team,
  User,
} from "./types";
export function snapshot(
  actor: User,
): Snapshot & { corrections: Record<string, unknown>[] } {
  const people = visiblePeople(actor),
    ids = new Set(people.map((p) => p.id)),
    staff = actor.role === "employee";
  const shifts = all<Shift>("SELECT * FROM shifts ORDER BY day,start").filter(
    (s) =>
      ids.has(s.user_id) &&
      (!staff || ["published", "changed"].includes(s.status)),
  );
  const leaves = all<Leave>(
    "SELECT * FROM leaves ORDER BY created_at DESC",
  ).filter((l) => ids.has(l.user_id) && (!staff || l.user_id === actor.id));
  const entries = all<Entry>(
    "SELECT * FROM entries ORDER BY start DESC",
  ).filter((e) => ids.has(e.user_id) && (!staff || e.user_id === actor.id));
  const balances = Object.fromEntries(
    people
      .filter((p) => !staff || p.id === actor.id)
      .map((p) => [p.id, balance(p, Number(today().slice(0, 4)))]),
  );
  const safePeople = people.map((p) =>
    staff && p.id !== actor.id
      ? {
          ...p,
          email: "",
          weekly_hours: 0,
          allowance: 0,
          carry: 0,
          personnel_no: "",
          work_days: "[]",
          qualifications: "[]",
          joined: "",
        }
      : p,
  );
  return {
    user: actor,
    people: safePeople,
    teams: all<Team>("SELECT * FROM teams"),
    shifts,
    leaves,
    entries,
    availability: all<Availability>("SELECT * FROM availability").filter(
      (a) => ids.has(a.user_id) && (!staff || a.user_id === actor.id),
    ),
    swaps: all<Swap>("SELECT * FROM swaps ORDER BY id DESC").filter((s) =>
      staff
        ? s.source_id === actor.id || s.target_id === actor.id
        : ids.has(s.source_id) && ids.has(s.target_id),
    ),
    notices: all<Notice>(
      "SELECT * FROM notices WHERE user_id=? ORDER BY id DESC LIMIT 100",
      actor.id,
    ),
    rules: rules(),
    demo:
      one<{ value: string }>("SELECT value FROM meta WHERE key=?", "demo")
        ?.value === "true",
    today: today(),
    balances,
    corrections: all<{ user_id: number } & Record<string, unknown>>(
      "SELECT * FROM corrections ORDER BY id DESC",
    ).filter((c) => ids.has(c.user_id) && (!staff || c.user_id === actor.id)),
  };
}
