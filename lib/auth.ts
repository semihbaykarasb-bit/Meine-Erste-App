import { randomBytes, createHash } from "node:crypto";
import { compareSync } from "bcryptjs";
import { all, one, run } from "./db";
import type { User } from "./types";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const publicFields =
  "id,name,email,role,team_id,weekly_hours,allowance,carry,personnel_no,position,work_days,qualifications,joined,active";
export const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function getUser(token: string | undefined) {
  if (!token) return;
  const session = one<{ user_id: number }>(
    "SELECT user_id FROM sessions WHERE token_hash=? AND expires>?",
    digest(token),
    Date.now(),
  );
  return session
    ? one<User>(
        `SELECT ${publicFields} FROM users WHERE id=? AND active=1`,
        session.user_id,
      )
    : undefined;
}
export function login(email: string, password: string) {
  const key = email.trim().toLowerCase();
  const attempt = one<{ failures: number; locked_until: number }>(
    "SELECT * FROM login_attempts WHERE email=?",
    key,
  );
  if (attempt && attempt.locked_until > Date.now())
    throw new AppError(
      "Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.",
      429,
    );
  const user = one<User & { password: string }>(
    "SELECT * FROM users WHERE email=? AND active=1",
    key,
  );
  // Fixed valid bcrypt cost on missing users to avoid a fast identity oracle.
  const valid = compareSync(
    password,
    user?.password ||
      "$2b$12$X3QUBrIriZI9Mo20PWpxbObp8gMOh37CCjQvmLSBhEGgxXUtF2T0a",
  );
  if (!user || !valid) {
    const failures =
      (attempt?.locked_until && attempt.locked_until <= Date.now()
        ? 0
        : attempt?.failures || 0) + 1;
    run(
      "INSERT INTO login_attempts VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET failures=excluded.failures,locked_until=excluded.locked_until",
      key,
      failures,
      failures >= 5 ? Date.now() + 900000 : 0,
    );
    throw new AppError("E-Mail oder Passwort stimmt nicht.", 401);
  }
  run("DELETE FROM login_attempts WHERE email=?", key);
  run("DELETE FROM sessions WHERE expires<=?", Date.now());
  const token = randomBytes(32).toString("base64url");
  run(
    "INSERT INTO sessions VALUES (?,?,?)",
    digest(token),
    user.id,
    Date.now() + 8 * 3600000,
  );
  return token;
}
export function requireUser(token: string | undefined) {
  const u = getUser(token);
  if (!u) throw new AppError("Bitte melde dich an.", 401);
  return u;
}
export function manage(actor: User, target: User) {
  if (
    actor.role === "admin" ||
    actor.role === "hr" ||
    (actor.role === "lead" && actor.team_id === target.team_id)
  )
    return;
  throw new AppError("Dafür fehlt dir die Berechtigung.", 403);
}
export function leadership(actor: User) {
  if (actor.role === "employee")
    throw new AppError(
      "Diese Funktion ist für Teamleitung und HR vorgesehen.",
      403,
    );
}
export function employee(id: number) {
  const u = one<User>(
    `SELECT ${publicFields} FROM users WHERE id=? AND active=1`,
    id,
  );
  if (!u) throw new AppError("Mitarbeiter wurde nicht gefunden.", 404);
  return u;
}
export function visiblePeople(actor: User) {
  return actor.role === "admin" || actor.role === "hr"
    ? all<User>(`SELECT ${publicFields} FROM users WHERE active=1`)
    : all<User>(
        `SELECT ${publicFields} FROM users WHERE active=1 AND team_id=?`,
        actor.team_id,
      );
}
