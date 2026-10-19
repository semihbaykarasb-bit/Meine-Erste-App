import { beforeEach, afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { all, one, run, resetConnection } from "../lib/db";
import { seed } from "../scripts/seed";
import { execute } from "../lib/actions";
import { employee, getUser, login } from "../lib/auth";
import { snapshot } from "../lib/snapshot";
import { conflicts, balance } from "../lib/scheduling";
import {
  addDays,
  holidays,
  instant,
  monday,
  today,
  workDays,
} from "../lib/calendar";
import { GET, POST } from "../app/api/[...path]/route";
import type { Entry, Leave, Shift } from "../lib/types";
let folder: string, password: string;
const doAction = (uid: number, action: string, data: unknown = {}) =>
  execute(employee(uid), { action, data });
const future = () => addDays(monday(today()), 42);
const shift = (uid = 7, day = future()) => ({
  user_id: uid,
  day,
  start: "09:00",
  end: "17:30",
  break_minutes: 30,
  note: "",
  required_skill: "",
});
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), "amor-test-"));
  process.env.DATABASE_PATH = join(folder, "test.sqlite");
  process.env.APP_ORIGIN = "http://localhost:3000";
  password = randomBytes(16).toString("hex");
  seed(password);
});
afterEach(() => {
  resetConnection();
  rmSync(folder, { recursive: true, force: true });
});
test("seed contains 20 fictional people, four teams, actual bookings and isolated data", () => {
  assert.equal(all("SELECT * FROM users").length, 20);
  assert.equal(all("SELECT * FROM teams").length, 4);
  assert.ok(all("SELECT * FROM entries").length > 0);
  assert.ok(
    all<{ email: string }>("SELECT email FROM users").every((u) =>
      u.email.endsWith("@example.invalid"),
    ),
  );
});
test("session tokens are hashed, expire, and inactive users lose access", () => {
  const token = login("DEMO7@example.invalid", password);
  resetConnection();
  assert.equal(getUser(token)?.id, 7);
  assert.notEqual(
    one<{ token_hash: string }>("SELECT token_hash FROM sessions")?.token_hash,
    token,
  );
  run("UPDATE users SET active=0 WHERE id=7");
  assert.equal(getUser(token), undefined);
  run("UPDATE users SET active=1 WHERE id=7");
  run("UPDATE sessions SET expires=0");
  assert.equal(getUser(token), undefined);
});
test("login is throttled after five failures", () => {
  for (let i = 0; i < 5; i++)
    assert.throws(() => login("demo7@example.invalid", "wrong"));
  assert.throws(() => login("demo7@example.invalid", password), /Zu viele/);
});
test("employees cannot create shifts; team leads cannot act on other teams", () => {
  assert.throws(() => doAction(7, "shift.save", shift()), /Teamleitung/);
  assert.throws(() => doAction(6, "shift.save", shift(12)), /Berechtigung/);
  assert.equal(all("SELECT id FROM shifts WHERE day=?", future()).length, 0);
});
test("staff cannot retrieve draft shifts or other employee balances and bookings", () => {
  const s = snapshot(employee(7));
  assert.ok(s.shifts.every((s) => ["published", "changed"].includes(s.status)));
  assert.ok(s.entries.every((e) => e.user_id === 7));
  assert.ok(s.leaves.every((e) => e.user_id === 7));
  assert.equal(s.people.find((p) => p.id === 6)?.allowance, 0);
  assert.equal(s.people.find((p) => p.id === 6)?.personnel_no, "");
  assert.deepEqual(Object.keys(s.balances), ["7"]);
  assert.ok(s.people.every((p) => p.team_id === 2));
});
test("saving drafts, conflict validation and explicit publishing work", () => {
  doAction(6, "shift.save", shift());
  assert.equal(
    snapshot(employee(7)).shifts.filter((s) => s.day === future()).length,
    0,
  );
  assert.throws(() => doAction(6, "shift.save", shift()), /Überschneidung/);
  doAction(6, "plan.publish", { team_id: 2, start: future(), end: future() });
  assert.equal(
    snapshot(employee(7)).shifts.find((s) => s.day === future())?.status,
    "published",
  );
  assert.ok(all("SELECT * FROM notices WHERE user_id=7").length > 1);
});
test("optimistic versions prevent lost shift edits", () => {
  doAction(6, "shift.save", shift());
  const s = one<Shift>("SELECT * FROM shifts WHERE day=?", future())!;
  doAction(6, "shift.save", { ...s, end: "16:30" });
  assert.throws(
    () => doAction(6, "shift.save", { ...s, end: "15:30" }),
    /inzwischen geändert/,
  );
});
test("changing a published shift notifies the worker and preserves visible changed status", () => {
  doAction(6, "shift.save", shift());
  doAction(6, "plan.publish", { team_id: 2, start: future(), end: future() });
  const s = one<Shift>("SELECT * FROM shifts WHERE day=?", future())!;
  doAction(6, "shift.save", { ...s, end: "16:30" });
  assert.equal(
    snapshot(employee(7)).shifts.find((x) => x.id === s.id)?.status,
    "changed",
  );
});
test("breaks, qualifications, rest and weekly time are checked", () => {
  assert.ok(
    conflicts({ ...shift(), end: "19:30", status: "draft" }, employee(7))
      .length,
  );
  assert.ok(
    conflicts(
      { ...shift(), break_minutes: 0, status: "draft" },
      employee(7),
    ).some((e) => e.includes("Pause")),
  );
  assert.ok(
    conflicts(
      { ...shift(), required_skill: "Versand", status: "draft" },
      employee(7),
    ).some((e) => e.includes("Qualifikation")),
  );
  doAction(6, "shift.save", {
    ...shift(),
    start: "13:00",
    end: "22:00",
    break_minutes: 45,
  });
  assert.throws(
    () =>
      doAction(6, "shift.save", {
        ...shift(7, addDays(future(), 1)),
        start: "07:00",
        end: "15:30",
      }),
    /Ruhezeit/,
  );
});
test("publication is atomic when a later availability change introduces conflicts", () => {
  doAction(6, "shift.save", shift());
  doAction(6, "shift.save", shift(8));
  run(
    "INSERT INTO availability(user_id,day,available,note) VALUES (8,?,0,?)",
    future(),
    "blocked",
  );
  assert.throws(
    () =>
      doAction(6, "plan.publish", {
        team_id: 2,
        start: future(),
        end: future(),
      }),
    /nicht verfügbar/,
  );
  assert.ok(
    all<Shift>("SELECT * FROM shifts WHERE day=?", future()).every(
      (s) => s.status === "draft",
    ),
  );
});
test("Hessian holidays and individual weekdays determine vacation duration", () => {
  assert.ok(holidays(2026).has("2026-06-04"));
  assert.ok(holidays(2026).has("2026-04-03"));
  assert.equal(workDays("2026-12-24", "2026-12-28", "[1,2,3,4,5]"), 2);
  assert.equal(workDays("2026-12-24", "2026-12-24", "[1,2,3,4,5]", true), 0.5);
  assert.equal(workDays("2026-12-24", "2026-12-24", "[1,2,3]"), 0);
});
test("Berlin conversion respects summer time and rejects nonexistent DST times", () => {
  assert.equal(
    new Date(instant("2026-07-01", "09:00")).toISOString(),
    "2026-07-01T07:00:00.000Z",
  );
  assert.equal(
    new Date(instant("2026-01-01", "09:00")).toISOString(),
    "2026-01-01T08:00:00.000Z",
  );
  assert.throws(() => instant("2026-03-29", "02:30"), /Zeitumstellung/);
});
test("vacation requests reserve, approve and withdraw days correctly", () => {
  const start = future(),
    before = balance(employee(7), Number(start.slice(0, 4))).remaining;
  doAction(7, "leave.create", {
    start,
    end: addDays(start, 1),
    kind: "vacation",
  });
  const l = one<Leave>(
    "SELECT * FROM leaves WHERE user_id=7 ORDER BY id DESC",
  )!;
  assert.equal(
    balance(employee(7), Number(start.slice(0, 4))).remaining,
    before - l.days,
  );
  doAction(6, "leave.review", { id: l.id, approve: true });
  assert.equal(
    one<Leave>("SELECT * FROM leaves WHERE id=?", l.id)?.status,
    "approved",
  );
  assert.throws(() => doAction(6, "shift.save", shift()), /Abwesenheit/);
  const start2 = addDays(start, 7);
  doAction(7, "leave.create", { start: start2, end: start2, kind: "vacation" });
  const l2 = one<Leave>(
    "SELECT * FROM leaves WHERE user_id=7 ORDER BY id DESC",
  )!;
  doAction(7, "leave.withdraw", { id: l2.id });
  assert.equal(
    one<Leave>("SELECT * FROM leaves WHERE id=?", l2.id)?.status,
    "withdrawn",
  );
});
test("vacation double requests and self approvals are rejected", () => {
  const start = future();
  doAction(6, "leave.create", { start, end: start, kind: "vacation" });
  const l = one<Leave>(
    "SELECT * FROM leaves WHERE user_id=6 ORDER BY id DESC",
  )!;
  assert.throws(
    () => doAction(6, "leave.review", { id: l.id, approve: true }),
    /Eigene/,
  );
  assert.throws(
    () => doAction(6, "leave.create", { start, end: start, kind: "vacation" }),
    /bereits/,
  );
  assert.throws(
    () => doAction(11, "leave.review", { id: l.id, approve: true }),
    /Berechtigung/,
  );
});
test("approved leave cannot silently conflict with planned work", () => {
  const start = future();
  doAction(6, "shift.save", shift());
  doAction(7, "leave.create", { start, end: start, kind: "vacation" });
  const l = one<Leave>(
    "SELECT * FROM leaves WHERE user_id=7 ORDER BY id DESC",
  )!;
  assert.throws(
    () => doAction(6, "leave.review", { id: l.id, approve: true }),
    /Schichten geplant/,
  );
  assert.equal(
    one<Leave>("SELECT * FROM leaves WHERE id=?", l.id)?.status,
    "pending",
  );
});
test("leave denial requires a reason and insufficient balances cannot be booked", () => {
  run("UPDATE users SET allowance=0 WHERE id=7");
  assert.throws(
    () =>
      doAction(7, "leave.create", {
        start: future(),
        end: future(),
        kind: "vacation",
      }),
    /reicht nicht/,
  );
  assert.throws(
    () => doAction(6, "leave.review", { id: 2, approve: false }),
    /Begründung/,
  );
});
test("clocking enforces one running record and pause lifecycle", () => {
  doAction(7, "clock.start");
  assert.throws(() => doAction(7, "clock.start"), /bereits/);
  doAction(7, "clock.pause");
  assert.ok(
    one<Entry>("SELECT * FROM entries WHERE user_id=7 AND end IS NULL")
      ?.break_started,
  );
  doAction(7, "clock.resume");
  doAction(7, "clock.stop");
  assert.equal(
    one("SELECT id FROM entries WHERE user_id=7 AND end IS NULL"),
    undefined,
  );
  assert.ok(all("SELECT * FROM audit WHERE actor_id=7").length >= 4);
});
test("manual time overlap is blocked; corrections require independent approval and preserve audit", () => {
  const day = addDays(monday(today()), -21);
  doAction(7, "entry.manual", {
    day,
    start: "09:00",
    end: "13:00",
    break_minutes: 0,
    note: "Erfassung vergessen",
  });
  const e = one<Entry>(
    "SELECT * FROM entries WHERE user_id=7 ORDER BY id DESC",
  )!;
  assert.throws(
    () =>
      doAction(7, "entry.manual", {
        day,
        start: "10:00",
        end: "14:00",
        break_minutes: 0,
        note: "Noch eine Buchung",
      }),
    /überschneidet/,
  );
  doAction(7, "entry.correct", {
    id: e.id,
    day,
    start: "09:00",
    end: "14:00",
    break_minutes: 30,
    reason: "Endzeit korrigieren",
  });
  const c = one<{ id: number }>("SELECT id FROM corrections")!;
  assert.throws(
    () => doAction(7, "correction.review", { id: c.id, approve: true }),
    /Teamleitung/,
  );
  doAction(6, "correction.review", { id: c.id, approve: true });
  assert.equal(
    one<Entry>("SELECT * FROM entries WHERE id=?", e.id)?.break_seconds,
    1800,
  );
  assert.ok(one("SELECT id FROM audit WHERE action=?", "correction.review"));
});
test("shift handover requires colleague acceptance and independent approval", () => {
  doAction(6, "shift.save", shift());
  doAction(6, "plan.publish", { team_id: 2, start: future(), end: future() });
  const s = one<Shift>("SELECT * FROM shifts WHERE day=?", future())!;
  doAction(7, "swap.create", { shift_id: s.id, target_id: 8 });
  const sw = one<{ id: number }>("SELECT id FROM swaps ORDER BY id DESC")!;
  assert.throws(
    () => doAction(6, "swap.review", { id: sw.id, approve: true }),
    /nicht mehr aktuell/,
  );
  doAction(8, "swap.respond", { id: sw.id, accept: true });
  doAction(6, "swap.review", { id: sw.id, approve: true });
  assert.equal(one<Shift>("SELECT * FROM shifts WHERE id=?", s.id)?.user_id, 8);
});
test("handover rechecks conflicts at final approval", () => {
  doAction(6, "shift.save", shift());
  doAction(6, "plan.publish", { team_id: 2, start: future(), end: future() });
  const s = one<Shift>("SELECT * FROM shifts WHERE day=?", future())!;
  doAction(7, "swap.create", { shift_id: s.id, target_id: 8 });
  const sw = one<{ id: number }>("SELECT id FROM swaps ORDER BY id DESC")!;
  doAction(8, "swap.respond", { id: sw.id, accept: true });
  doAction(6, "shift.save", shift(8));
  assert.throws(
    () => doAction(6, "swap.review", { id: sw.id, approve: true }),
    /Überschneidung/,
  );
  assert.equal(one<Shift>("SELECT * FROM shifts WHERE id=?", s.id)?.user_id, 7);
});
test("assistant creates only drafts, respects availability, and does not exceed contracts", () => {
  doAction(7, "availability.save", { day: future(), available: false });
  doAction(6, "plan.assist", {
    team_id: 2,
    start: future(),
    headcount: 3,
    start_time: "09:00",
    end_time: "17:30",
    break_minutes: 30,
  });
  const s = all<Shift>(
    "SELECT * FROM shifts WHERE day BETWEEN ? AND ?",
    future(),
    addDays(future(), 4),
  );
  assert.ok(s.length > 0);
  assert.ok(s.every((x) => x.status === "draft"));
  assert.ok(!s.some((x) => x.user_id === 7 && x.day === future()));
  assert.ok(s.filter((x) => x.user_id === 10).length <= 2);
  assert.equal(
    snapshot(employee(7)).shifts.filter((s) => s.day === future()).length,
    0,
  );
});
test("HR cannot escalate privileges and admin cannot drop their own role", () => {
  const u = employee(7),
    d = { ...u, qualifications: ["Beratung"], work_days: [1, 2, 3, 4, 5] };
  assert.throws(
    () => doAction(2, "employee.save", { ...d, role: "admin" }),
    /privilegierten/,
  );
  assert.throws(() => doAction(7, "employee.save", d), /Mitarbeiterverwaltung/);
  const a = employee(1);
  assert.throws(
    () =>
      doAction(1, "employee.save", {
        ...a,
        role: "employee",
        qualifications: [],
        work_days: [1, 2, 3, 4, 5],
      }),
    /eigene Rolle/,
  );
});
test("audit entries are append only", () => {
  doAction(7, "clock.start");
  assert.throws(() => run("DELETE FROM audit"), /append-only/);
  assert.throws(() => run("UPDATE audit SET action='changed'"), /append-only/);
});
test("API requires sessions and blocks cross-origin mutations", async () => {
  const res = await GET(new NextRequest("http://localhost:3000/api/snapshot"));
  assert.equal(res.status, 401);
  const blocked = await POST(
    new NextRequest("http://localhost:3000/api/login", {
      method: "POST",
      headers: { origin: "https://evil.invalid" },
      body: JSON.stringify({ email: "demo7@example.invalid", password }),
    }),
  );
  assert.equal(blocked.status, 403);
  assert.equal(all("SELECT * FROM sessions").length, 0);
});
test("API login cookie is HttpOnly, logout revokes sessions, CSV scope is server enforced", async () => {
  const res = await POST(
    new NextRequest("http://localhost:3000/api/login", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
      body: JSON.stringify({ email: "demo7@example.invalid", password }),
    }),
  );
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("set-cookie")?.includes("HttpOnly"));
  const token = res.cookies.get("amor_session")!.value;
  const cookies = { cookie: `amor_session=${token}` };
  const snap = await GET(
    new NextRequest("http://localhost:3000/api/snapshot", { headers: cookies }),
  );
  assert.equal(snap.status, 200);
  assert.equal(snap.headers.get("cache-control"), "no-store");
  const exported = await GET(
    new NextRequest(
      `http://localhost:3000/api/export?from=${addDays(today(), -30)}&to=${today()}`,
      { headers: cookies },
    ),
  );
  const csv = await exported.text();
  assert.ok(csv.includes("Lina") === false);
  assert.ok(!csv.includes("Mila Winter"));
  assert.ok(csv.includes("Ella Brandt"));
  await POST(
    new NextRequest("http://localhost:3000/api/logout", {
      method: "POST",
      headers: { ...cookies, origin: "http://localhost:3000" },
      body: "{}",
    }),
  );
  assert.equal(getUser(token), undefined);
});
