import { z } from "zod";
import { all, one, run, transaction, audit, notify } from "./db";
import { AppError, employee, leadership, manage, visiblePeople } from "./auth";
import {
  addDays,
  daysBetween,
  hours,
  instant,
  monday,
  today,
  workDays,
} from "./calendar";
import { balance, conflicts, overlapLeave, rules } from "./scheduling";
import type { Entry, Leave, Shift, Swap, Team, User } from "./types";
const id = z.coerce.number().int().positive();
const day = z.iso.date();
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Bitte gib eine gültige Uhrzeit an.");
const note = z.string().trim().max(500).default("");
const shiftInput = z.object({
  id: id.optional(),
  version: id.optional(),
  user_id: id,
  day,
  start: time,
  end: time,
  break_minutes: z.coerce.number().int().min(0).max(120),
  note,
  required_skill: z.string().max(80).default(""),
});
function found<T>(value: T | undefined): T {
  if (!value) throw new AppError("Eintrag wurde nicht gefunden.", 404);
  return value;
}
function ensureNoConflict(
  shift: Omit<Shift, "id" | "version"> & { id?: number },
  u: User,
) {
  const errors = conflicts(shift, u);
  if (errors.length) throw new AppError(errors.join(" "), 409);
}
function requireVersion(version: number | undefined, actual: number) {
  if (version !== actual)
    throw new AppError(
      "Der Eintrag wurde inzwischen geändert. Bitte neu laden.",
      409,
    );
}
function review(actor: User, target: User) {
  manage(actor, target);
  if (actor.id === target.id)
    throw new AppError(
      "Eigene Anträge müssen von einer anderen berechtigten Person geprüft werden.",
      403,
    );
}
export function execute(actor: User, input: unknown) {
  const body = z
    .object({ action: z.string().max(40), data: z.unknown().default({}) })
    .parse(input);
  return transaction(() => {
    switch (body.action) {
      case "shift.save": {
        leadership(actor);
        const d = shiftInput.parse(body.data),
          u = employee(d.user_id);
        manage(actor, u);
        let previous: Shift | undefined;
        if (d.id) {
          previous = found(one<Shift>("SELECT * FROM shifts WHERE id=?", d.id));
          manage(actor, employee(previous.user_id));
          requireVersion(d.version, previous.version);
        }
        const status =
          previous &&
          (previous.status === "published" || previous.status === "changed")
            ? "changed"
            : "draft";
        ensureNoConflict({ ...d, status }, u);
        if (previous) {
          run(
            "UPDATE shifts SET user_id=?,day=?,start=?,end=?,break_minutes=?,note=?,required_skill=?,status=?,version=version+1 WHERE id=?",
            u.id,
            d.day,
            d.start,
            d.end,
            d.break_minutes,
            d.note,
            d.required_skill,
            status,
            previous.id,
          );
          if (status === "changed") {
            notify(
              previous.user_id,
              "Eine veröffentlichte Schicht wurde geändert.",
            );
            if (u.id !== previous.user_id)
              notify(
                u.id,
                "Dir wurde eine veröffentlichte Schicht zugeordnet.",
              );
          }
        } else
          run(
            "INSERT INTO shifts(user_id,day,start,end,break_minutes,note,required_skill,status) VALUES (?,?,?,?,?,?,?,?)",
            u.id,
            d.day,
            d.start,
            d.end,
            d.break_minutes,
            d.note,
            d.required_skill,
            status,
          );
        audit(actor.id, body.action, `shift:${d.id || "new"}`, previous, d);
        return {
          message: previous
            ? "Schicht aktualisiert."
            : "Schicht als Entwurf gespeichert.",
        };
      }
      case "shift.cancel": {
        leadership(actor);
        const d = z.object({ id, version: id }).parse(body.data),
          s = found(one<Shift>("SELECT * FROM shifts WHERE id=?", d.id));
        manage(actor, employee(s.user_id));
        requireVersion(d.version, s.version);
        run(
          "UPDATE shifts SET status='cancelled',version=version+1 WHERE id=?",
          s.id,
        );
        audit(actor.id, body.action, `shift:${s.id}`, s, {
          status: "cancelled",
        });
        notify(s.user_id, "Eine Schicht wurde abgesagt.");
        return { message: "Schicht abgesagt." };
      }
      case "plan.publish": {
        leadership(actor);
        const d = z
          .object({ team_id: id, start: day, end: day })
          .parse(body.data);
        const people = visiblePeople(actor).filter(
          (p) => p.team_id === d.team_id,
        );
        if (!people.length)
          throw new AppError("Kein Zugriff auf dieses Team.", 403);
        daysBetween(d.start, d.end);
        const shifts = all<Shift>(
          "SELECT s.* FROM shifts s JOIN users u ON u.id=s.user_id WHERE u.team_id=? AND s.day BETWEEN ? AND ? AND s.status='draft'",
          d.team_id,
          d.start,
          d.end,
        );
        if (!shifts.length)
          throw new AppError("In diesem Zeitraum gibt es keine Entwürfe.");
        for (const s of shifts) ensureNoConflict(s, employee(s.user_id));
        for (const s of shifts) {
          run(
            "UPDATE shifts SET status='published',version=version+1 WHERE id=?",
            s.id,
          );
          notify(
            s.user_id,
            `Dein Dienstplan für ${s.day} wurde veröffentlicht.`,
          );
        }
        audit(
          actor.id,
          body.action,
          `team:${d.team_id}`,
          null,
          shifts.map((s) => s.id),
        );
        return { message: `${shifts.length} Schichten veröffentlicht.` };
      }
      case "leave.create": {
        const d = z
          .object({
            start: day,
            end: day,
            half: z.boolean().default(false),
            kind: z.enum(["vacation", "absence"]),
            reason: note,
          })
          .parse(body.data);
        if (d.end < d.start || d.start < today())
          throw new AppError("Bitte wähle einen gültigen Zeitraum ab heute.");
        if (d.start.slice(0, 4) !== d.end.slice(0, 4))
          throw new AppError(
            "Bitte stelle pro Kalenderjahr einen eigenen Antrag.",
          );
        if (d.half && (!rules().allow_half || d.start !== d.end))
          throw new AppError(
            "Halbe Tage sind nur für einen einzelnen Tag möglich.",
          );
        const days = workDays(d.start, d.end, actor.work_days, d.half);
        if (days <= 0)
          throw new AppError(
            "Im Zeitraum liegen keine persönlichen Arbeitstage.",
          );
        if (overlapLeave(actor.id, d.start, d.end))
          throw new AppError(
            "Für diesen Zeitraum besteht bereits ein Antrag.",
            409,
          );
        if (
          d.kind === "vacation" &&
          days > balance(actor, Number(d.start.slice(0, 4))).remaining
        )
          throw new AppError(
            "Dein verbleibender Urlaubsanspruch reicht nicht aus.",
            409,
          );
        const result = run(
          "INSERT INTO leaves(user_id,start,end,half,kind,status,days,reason,created_at) VALUES (?,?,?,?,?,'pending',?,?,?)",
          actor.id,
          d.start,
          d.end,
          Number(d.half),
          d.kind,
          days,
          d.reason,
          new Date().toISOString(),
        );
        audit(
          actor.id,
          body.action,
          `leave:${result.lastInsertRowid}`,
          null,
          d,
        );
        for (const lead of all<User>(
          "SELECT * FROM users WHERE active=1 AND (role IN ('hr','admin') OR (role='lead' AND team_id=?))",
          actor.team_id,
        ))
          if (lead.id !== actor.id)
            notify(lead.id, `${actor.name} hat eine Abwesenheit beantragt.`);
        return { message: "Dein Antrag wurde eingereicht." };
      }
      case "leave.withdraw": {
        const d = z.object({ id }).parse(body.data),
          l = found(one<Leave>("SELECT * FROM leaves WHERE id=?", d.id));
        if (l.user_id !== actor.id || l.status !== "pending")
          throw new AppError(
            "Nur eigene offene Anträge können zurückgezogen werden.",
            403,
          );
        run("UPDATE leaves SET status='withdrawn' WHERE id=?", l.id);
        audit(actor.id, body.action, `leave:${l.id}`, l, {
          status: "withdrawn",
        });
        return { message: "Antrag zurückgezogen." };
      }
      case "leave.review": {
        leadership(actor);
        const d = z
            .object({ id, approve: z.boolean(), reason: note })
            .parse(body.data),
          l = found(one<Leave>("SELECT * FROM leaves WHERE id=?", d.id)),
          u = employee(l.user_id);
        review(actor, u);
        if (l.status !== "pending")
          throw new AppError("Dieser Antrag wurde bereits bearbeitet.", 409);
        if (!d.approve && !d.reason)
          throw new AppError("Bitte gib eine Begründung für die Ablehnung an.");
        if (d.approve) {
          if (
            l.kind === "vacation" &&
            balance(u, Number(l.start.slice(0, 4))).remaining < 0
          )
            throw new AppError("Der Urlaubsanspruch reicht nicht aus.", 409);
          const activeShifts = all<Shift>(
            "SELECT * FROM shifts WHERE user_id=? AND day BETWEEN ? AND ? AND status!='cancelled'",
            u.id,
            l.start,
            l.end,
          );
          if (activeShifts.length)
            throw new AppError(
              "Im Zeitraum sind Schichten geplant. Bitte zuerst umplanen oder absagen.",
              409,
            );
        }
        const status = d.approve ? "approved" : "rejected";
        run(
          "UPDATE leaves SET status=?,decision_reason=? WHERE id=?",
          status,
          d.reason,
          l.id,
        );
        audit(actor.id, body.action, `leave:${l.id}`, l, {
          status,
          reason: d.reason,
        });
        notify(
          u.id,
          `Dein Antrag wurde ${d.approve ? "genehmigt" : "abgelehnt"}.${d.reason ? " " + d.reason : ""}`,
        );
        return {
          message: d.approve ? "Antrag genehmigt." : "Antrag abgelehnt.",
        };
      }
      case "clock.start": {
        if (
          one(
            "SELECT id FROM entries WHERE user_id=? AND end IS NULL",
            actor.id,
          )
        )
          throw new AppError("Deine Zeiterfassung läuft bereits.", 409);
        const start = new Date().toISOString();
        run("INSERT INTO entries(user_id,start) VALUES (?,?)", actor.id, start);
        audit(actor.id, body.action, "entry:new", null, { start });
        return { message: "Arbeitszeit läuft." };
      }
      case "clock.pause":
      case "clock.resume":
      case "clock.stop": {
        const e = found(
          one<Entry>(
            "SELECT * FROM entries WHERE user_id=? AND end IS NULL",
            actor.id,
          ),
        );
        const now = new Date().toISOString();
        let seconds = e.break_seconds;
        if (body.action === "clock.pause") {
          if (e.break_started) throw new AppError("Du bist bereits in Pause.");
          run(
            "UPDATE entries SET break_started=?,version=version+1 WHERE id=?",
            now,
            e.id,
          );
        } else {
          if (e.break_started)
            seconds += Math.round(
              (Date.parse(now) - Date.parse(e.break_started)) / 1000,
            );
          if (body.action === "clock.resume" && !e.break_started)
            throw new AppError("Es läuft keine Pause.");
          run(
            "UPDATE entries SET end=?,break_started=NULL,break_seconds=?,version=version+1 WHERE id=?",
            body.action === "clock.stop" ? now : null,
            seconds,
            e.id,
          );
        }
        audit(
          actor.id,
          body.action,
          `entry:${e.id}`,
          e,
          one("SELECT * FROM entries WHERE id=?", e.id),
        );
        return {
          message:
            body.action === "clock.pause"
              ? "Pause gestartet."
              : body.action === "clock.resume"
                ? "Arbeit fortgesetzt."
                : "Arbeitszeit gespeichert.",
        };
      }
      case "entry.manual": {
        const d = z
          .object({
            day,
            start: time,
            end: time,
            break_minutes: z.coerce.number().int().min(0).max(120),
            note: z.string().trim().min(3).max(500),
          })
          .parse(body.data);
        const start = new Date(instant(d.day, d.start)).toISOString(),
          end = new Date(instant(d.day, d.end)).toISOString();
        validateEntry(actor.id, start, end, d.break_minutes);
        const result = run(
          "INSERT INTO entries(user_id,start,end,break_seconds,note) VALUES (?,?,?,?,?)",
          actor.id,
          start,
          end,
          d.break_minutes * 60,
          d.note,
        );
        audit(
          actor.id,
          body.action,
          `entry:${result.lastInsertRowid}`,
          null,
          d,
        );
        return { message: "Arbeitszeit mit Änderungsnachweis erfasst." };
      }
      case "entry.correct": {
        const d = z
            .object({
              id,
              day,
              start: time,
              end: time,
              break_minutes: z.coerce.number().int().min(0).max(120),
              reason: z.string().trim().min(3).max(500),
            })
            .parse(body.data),
          e = found(one<Entry>("SELECT * FROM entries WHERE id=?", d.id));
        if (e.user_id !== actor.id || !e.end)
          throw new AppError(
            "Du kannst nur eigene abgeschlossene Zeiten korrigieren.",
            403,
          );
        if (
          one(
            "SELECT id FROM corrections WHERE entry_id=? AND status='pending'",
            e.id,
          )
        )
          throw new AppError(
            "Für diese Zeit ist bereits eine Korrektur offen.",
            409,
          );
        const start = new Date(instant(d.day, d.start)).toISOString(),
          end = new Date(instant(d.day, d.end)).toISOString();
        validateEntry(actor.id, start, end, d.break_minutes, e.id);
        run(
          "INSERT INTO corrections(entry_id,user_id,start,end,break_minutes,reason,entry_version) VALUES (?,?,?,?,?,?,?)",
          e.id,
          actor.id,
          start,
          end,
          d.break_minutes,
          d.reason,
          e.version,
        );
        audit(actor.id, body.action, `entry:${e.id}`, e, d);
        return { message: "Korrektur zur Genehmigung eingereicht." };
      }
      case "correction.review": {
        leadership(actor);
        const d = z.object({ id, approve: z.boolean() }).parse(body.data),
          c = found(
            one<{
              id: number;
              entry_id: number;
              user_id: number;
              start: string;
              end: string;
              break_minutes: number;
              reason: string;
              entry_version: number;
              status: string;
            }>("SELECT * FROM corrections WHERE id=?", d.id),
          );
        review(actor, employee(c.user_id));
        if (c.status !== "pending")
          throw new AppError("Korrektur ist bereits bearbeitet.", 409);
        const e = found(
          one<Entry>("SELECT * FROM entries WHERE id=?", c.entry_id),
        );
        if (d.approve) {
          requireVersion(c.entry_version, e.version);
          validateEntry(c.user_id, c.start, c.end, c.break_minutes, e.id);
          run(
            "UPDATE entries SET start=?,end=?,break_seconds=?,note=?,version=version+1 WHERE id=?",
            c.start,
            c.end,
            c.break_minutes * 60,
            c.reason,
            e.id,
          );
        }
        run(
          "UPDATE corrections SET status=? WHERE id=?",
          d.approve ? "approved" : "rejected",
          c.id,
        );
        audit(
          actor.id,
          body.action,
          `entry:${e.id}`,
          e,
          one("SELECT * FROM entries WHERE id=?", e.id),
        );
        notify(
          c.user_id,
          `Deine Zeitkorrektur wurde ${d.approve ? "genehmigt" : "abgelehnt"}.`,
        );
        return { message: "Korrektur bearbeitet." };
      }
      case "availability.save": {
        const d = z
          .object({ day, available: z.boolean(), note })
          .parse(body.data);
        if (d.day < today())
          throw new AppError(
            "Verfügbarkeiten können nur ab heute hinterlegt werden.",
          );
        if (
          !d.available &&
          one(
            "SELECT id FROM shifts WHERE user_id=? AND day=? AND status!='cancelled'",
            actor.id,
            d.day,
          )
        )
          throw new AppError(
            "Es besteht eine Schicht. Bitte zuerst mit deiner Teamleitung umplanen.",
            409,
          );
        const previous = one(
          "SELECT * FROM availability WHERE user_id=? AND day=?",
          actor.id,
          d.day,
        );
        run(
          "INSERT INTO availability(user_id,day,available,note) VALUES (?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET available=excluded.available,note=excluded.note",
          actor.id,
          d.day,
          Number(d.available),
          d.note,
        );
        audit(actor.id, body.action, "availability", previous, d);
        return { message: "Verfügbarkeit gespeichert." };
      }
      case "swap.create": {
        const d = z
            .object({ shift_id: id, target_id: id, reason: note })
            .parse(body.data),
          s = found(one<Shift>("SELECT * FROM shifts WHERE id=?", d.shift_id)),
          target = employee(d.target_id);
        if (
          s.user_id !== actor.id ||
          !["published", "changed"].includes(s.status) ||
          s.day < today()
        )
          throw new AppError(
            "Nur eigene, zukünftige veröffentlichte Schichten können abgegeben werden.",
            403,
          );
        if (target.id === actor.id || target.team_id !== actor.team_id)
          throw new AppError("Bitte wähle einen Kollegen aus deinem Team.");
        if (
          one(
            "SELECT id FROM swaps WHERE shift_id=? AND status IN ('requested','accepted')",
            s.id,
          )
        )
          throw new AppError(
            "Für diese Schicht besteht bereits eine Anfrage.",
            409,
          );
        ensureNoConflict({ ...s, user_id: target.id }, target);
        run(
          "INSERT INTO swaps(shift_id,target_id,source_id,status,reason) VALUES (?,?,?,'requested',?)",
          s.id,
          target.id,
          actor.id,
          d.reason,
        );
        audit(actor.id, body.action, `shift:${s.id}`, null, d);
        notify(target.id, `${actor.name} möchte dir eine Schicht übergeben.`);
        return { message: "Schichtübernahme angefragt." };
      }
      case "swap.respond": {
        const d = z.object({ id, accept: z.boolean() }).parse(body.data),
          s = found(one<Swap>("SELECT * FROM swaps WHERE id=?", d.id));
        if (s.target_id !== actor.id || s.status !== "requested")
          throw new AppError("Diese Anfrage kannst du nicht bearbeiten.", 403);
        run(
          "UPDATE swaps SET status=?,version=version+1 WHERE id=?",
          d.accept ? "accepted" : "rejected",
          s.id,
        );
        audit(actor.id, body.action, `swap:${s.id}`, s, d);
        notify(
          s.source_id,
          d.accept
            ? "Die Schichtübernahme wartet jetzt auf die Teamleitung."
            : "Deine Anfrage wurde abgelehnt.",
        );
        return {
          message: d.accept
            ? "Angenommen. Die Teamleitung prüft die Übernahme."
            : "Anfrage abgelehnt.",
        };
      }
      case "swap.review": {
        leadership(actor);
        const d = z.object({ id, approve: z.boolean() }).parse(body.data),
          sw = found(one<Swap>("SELECT * FROM swaps WHERE id=?", d.id)),
          s = found(one<Shift>("SELECT * FROM shifts WHERE id=?", sw.shift_id)),
          target = employee(sw.target_id);
        manage(actor, target);
        manage(actor, employee(sw.source_id));
        if (actor.id === sw.source_id || actor.id === sw.target_id)
          throw new AppError(
            "Beteiligte dürfen eine Übernahme nicht selbst genehmigen.",
            403,
          );
        if (
          sw.status !== "accepted" ||
          s.user_id !== sw.source_id ||
          !["published", "changed"].includes(s.status) ||
          s.day < today()
        )
          throw new AppError("Die Anfrage ist nicht mehr aktuell.", 409);
        if (d.approve) {
          ensureNoConflict({ ...s, user_id: target.id }, target);
          run(
            "UPDATE shifts SET user_id=?,status='changed',version=version+1 WHERE id=?",
            target.id,
            s.id,
          );
        }
        run(
          "UPDATE swaps SET status=?,version=version+1 WHERE id=?",
          d.approve ? "approved" : "rejected",
          sw.id,
        );
        audit(
          actor.id,
          body.action,
          `swap:${sw.id}`,
          { swap: sw, shift: s },
          { ...d, target_id: target.id },
        );
        notify(
          sw.source_id,
          `Die Schichtübernahme wurde ${d.approve ? "genehmigt" : "abgelehnt"}.`,
        );
        notify(
          target.id,
          `Die Schichtübernahme wurde ${d.approve ? "genehmigt" : "abgelehnt"}.`,
        );
        return { message: "Anfrage bearbeitet." };
      }
      case "employee.save": {
        if (!["hr", "admin"].includes(actor.role))
          throw new AppError(
            "Die Mitarbeiterverwaltung ist für HR und Administration vorgesehen.",
            403,
          );
        const d = z
          .object({
            id,
            name: z.string().trim().min(2).max(100),
            position: z.string().trim().min(2).max(100),
            team_id: id,
            weekly_hours: z.coerce.number().min(1).max(48),
            allowance: z.coerce.number().min(0).max(60),
            carry: z.coerce.number().min(0).max(60),
            qualifications: z.array(z.string().trim().min(1).max(80)).max(20),
            work_days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
            role: z.enum(["employee", "lead", "hr", "admin"]),
          })
          .parse(body.data);
        const u = employee(d.id);
        if (
          actor.role !== "admin" &&
          (d.role !== u.role || ["hr", "admin"].includes(u.role))
        )
          throw new AppError(
            "HR kann keine privilegierten Konten oder Rollen ändern.",
            403,
          );
        found(one<Team>("SELECT * FROM teams WHERE id=?", d.team_id));
        if (actor.id === d.id && d.role !== actor.role)
          throw new AppError("Du kannst deine eigene Rolle nicht ändern.");
        if (
          d.team_id !== u.team_id &&
          one(
            "SELECT id FROM shifts WHERE user_id=? AND day>=? AND status!='cancelled'",
            u.id,
            today(),
          )
        )
          throw new AppError(
            "Bitte zukünftige Schichten vor dem Teamwechsel entfernen.",
            409,
          );
        if (
          d.allowance + d.carry <
          balance(u, Number(today().slice(0, 4))).used +
            balance(u, Number(today().slice(0, 4))).reserved
        )
          throw new AppError(
            "Kontingent ist kleiner als bereits gebuchter Urlaub.",
          );
        run(
          "UPDATE users SET name=?,position=?,team_id=?,weekly_hours=?,allowance=?,carry=?,qualifications=?,work_days=?,role=? WHERE id=?",
          d.name,
          d.position,
          d.team_id,
          d.weekly_hours,
          d.allowance,
          d.carry,
          JSON.stringify(d.qualifications),
          JSON.stringify([...new Set(d.work_days)]),
          d.role,
          u.id,
        );
        audit(actor.id, body.action, `user:${u.id}`, u, d);
        return { message: "Profil gespeichert." };
      }
      case "settings.save": {
        if (actor.role !== "admin")
          throw new AppError(
            "Nur Administratoren können Dienstplanregeln ändern.",
            403,
          );
        const d = z
          .object({
            company: z.string().trim().min(2).max(80),
            rest_hours: z.coerce.number().min(11).max(24),
            max_daily: z.coerce.number().min(1).max(10),
            max_weekly: z.coerce.number().min(1).max(48),
            allow_half: z.boolean(),
            minimum_break: z.coerce.number().min(30).max(120),
            state: z.literal("HE"),
          })
          .parse(body.data);
        const before = rules();
        run("UPDATE meta SET value=? WHERE key=?", JSON.stringify(d), "rules");
        audit(actor.id, body.action, "rules", before, d);
        return { message: "Regeln gespeichert." };
      }
      case "notices.read":
        run(
          "UPDATE notices SET read_at=? WHERE user_id=? AND read_at IS NULL",
          new Date().toISOString(),
          actor.id,
        );
        return { message: "Benachrichtigungen als gelesen markiert." };
      case "plan.assist": {
        leadership(actor);
        const d = z
          .object({
            team_id: id,
            start: day,
            headcount: z.coerce.number().int().min(1).max(20),
            start_time: time,
            end_time: time,
            break_minutes: z.coerce.number().int().min(0).max(120),
          })
          .parse(body.data);
        const people = visiblePeople(actor).filter(
          (p) => p.team_id === d.team_id,
        );
        const team = found(
          one<Team>("SELECT * FROM teams WHERE id=?", d.team_id),
        );
        if (!people.length)
          throw new AppError("Kein Zugriff auf dieses Team.", 403);
        if (d.start < today())
          throw new AppError("Bitte wähle eine zukünftige Woche.");
        let created = 0;
        const unfilled: string[] = [];
        for (let offset = 0; offset < 5; offset++) {
          const date = addDays(monday(d.start), offset);
          if (date < today()) continue;
          const existing = all<Shift>(
            "SELECT s.* FROM shifts s JOIN users u ON u.id=s.user_id WHERE u.team_id=? AND s.day=? AND s.status!='cancelled' AND s.start<=? AND s.end>=?",
            d.team_id,
            date,
            d.start_time,
            d.end_time,
          );
          let needed = Math.max(
            0,
            d.headcount - new Set(existing.map((s) => s.user_id)).size,
          );
          const candidates = [...people].sort((a, b) => {
            const load = (u: User) =>
              all<Shift>(
                "SELECT * FROM shifts WHERE user_id=? AND day BETWEEN ? AND ? AND status!='cancelled'",
                u.id,
                monday(d.start),
                addDays(monday(d.start), 6),
              ).reduce((v, s) => v + hours(s), 0) / u.weekly_hours;
            return load(a) - load(b) || a.id - b.id;
          });
          for (const u of candidates) {
            if (!needed) break;
            if (!workDays(date, date, u.work_days)) continue;
            const s = {
              user_id: u.id,
              day: date,
              start: d.start_time,
              end: d.end_time,
              break_minutes: d.break_minutes,
              status: "draft" as const,
              note: "Planungsassistent",
              required_skill: team.skill,
            };
            const load = all<Shift>(
              "SELECT * FROM shifts WHERE user_id=? AND day BETWEEN ? AND ? AND status!='cancelled'",
              u.id,
              monday(d.start),
              addDays(monday(d.start), 6),
            ).reduce((v, x) => v + hours(x), 0);
            if (conflicts(s, u).length || load + hours(s) > u.weekly_hours)
              continue;
            run(
              "INSERT INTO shifts(user_id,day,start,end,break_minutes,status,note,required_skill) VALUES (?,?,?,?,?,?,?,?)",
              u.id,
              date,
              d.start_time,
              d.end_time,
              d.break_minutes,
              "draft",
              "Planungsassistent",
              team.skill,
            );
            created++;
            needed--;
          }
          if (needed) unfilled.push(`${date}: ${needed} unbesetzte Positionen`);
        }
        audit(actor.id, body.action, `team:${d.team_id}`, null, {
          ...d,
          created,
          unfilled,
        });
        return {
          message: `${created} Entwürfe erstellt. ${unfilled.length ? unfilled.join("; ") : "Die gewünschte Tagesbesetzung ist eingeplant."} Bitte prüfen und anschließend veröffentlichen.`,
        };
      }
      default:
        throw new AppError("Unbekannte Aktion.", 404);
    }
  });
}
function validateEntry(
  userId: number,
  start: string,
  end: string,
  breakMinutes: number,
  exclude = 0,
) {
  if (
    end <= start ||
    Date.parse(end) > Date.now() ||
    Date.parse(end) - Date.parse(start) > 24 * 3600000
  )
    throw new AppError(
      "Bitte gib einen abgeschlossenen Zeitraum von höchstens 24 Stunden an.",
    );
  if ((Date.parse(end) - Date.parse(start)) / 60000 <= breakMinutes)
    throw new AppError("Die Pause muss kürzer als die gesamte Zeit sein.");
  if (
    one(
      "SELECT id FROM entries WHERE user_id=? AND id!=? AND start<? AND (end IS NULL OR end>?)",
      userId,
      exclude,
      end,
      start,
    )
  )
    throw new AppError(
      "Diese Arbeitszeit überschneidet sich mit einer bestehenden Buchung.",
      409,
    );
}
