import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
let singleton: DatabaseSync | undefined;
export function db() {
  if (singleton) return singleton;
  const path = resolve(
    /* turbopackIgnore: true */ process.env.DATABASE_PATH ||
      "./data/workforce.sqlite",
  );
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  singleton = new DatabaseSync(path);
  singleton.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS teams(id INTEGER PRIMARY KEY,name TEXT NOT NULL,department TEXT NOT NULL,minimum INTEGER NOT NULL DEFAULT 3,skill TEXT NOT NULL DEFAULT '',color TEXT NOT NULL DEFAULT '#C5A46D');
  CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE COLLATE NOCASE,password TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('employee','lead','hr','admin')),team_id INTEGER NOT NULL REFERENCES teams(id),weekly_hours REAL NOT NULL CHECK(weekly_hours BETWEEN 1 AND 60),allowance REAL NOT NULL DEFAULT 30,carry REAL NOT NULL DEFAULT 0,personnel_no TEXT NOT NULL UNIQUE,position TEXT NOT NULL,work_days TEXT NOT NULL DEFAULT '[1,2,3,4,5]',qualifications TEXT NOT NULL DEFAULT '[]',joined TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS login_attempts(email TEXT PRIMARY KEY,failures INTEGER NOT NULL,locked_until INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS shifts(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),day TEXT NOT NULL,start TEXT NOT NULL,end TEXT NOT NULL,break_minutes INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('draft','published','changed','cancelled')),note TEXT NOT NULL DEFAULT '',required_skill TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1);
  CREATE INDEX IF NOT EXISTS shift_day ON shifts(day,user_id);
  CREATE TABLE IF NOT EXISTS leaves(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),start TEXT NOT NULL,end TEXT NOT NULL,half INTEGER NOT NULL DEFAULT 0,kind TEXT NOT NULL CHECK(kind IN ('vacation','absence')),status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','withdrawn')),days REAL NOT NULL,reason TEXT NOT NULL DEFAULT '',decision_reason TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),start TEXT NOT NULL,end TEXT,break_started TEXT,break_seconds INTEGER NOT NULL DEFAULT 0,note TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1);
  CREATE UNIQUE INDEX IF NOT EXISTS one_running_entry ON entries(user_id) WHERE end IS NULL;
  CREATE TABLE IF NOT EXISTS availability(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),day TEXT NOT NULL,available INTEGER NOT NULL,note TEXT NOT NULL DEFAULT '',UNIQUE(user_id,day));
  CREATE TABLE IF NOT EXISTS swaps(id INTEGER PRIMARY KEY,shift_id INTEGER NOT NULL REFERENCES shifts(id),target_id INTEGER NOT NULL REFERENCES users(id),source_id INTEGER NOT NULL REFERENCES users(id),status TEXT NOT NULL,reason TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS corrections(id INTEGER PRIMARY KEY,entry_id INTEGER NOT NULL REFERENCES entries(id),user_id INTEGER NOT NULL REFERENCES users(id),start TEXT NOT NULL,end TEXT NOT NULL,break_minutes INTEGER NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',entry_version INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS notices(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),text TEXT NOT NULL,read_at TEXT,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,actor_id INTEGER NOT NULL REFERENCES users(id),action TEXT NOT NULL,entity TEXT NOT NULL,before_json TEXT,after_json TEXT,created_at TEXT NOT NULL);
  CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'Audit is append-only'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'Audit is append-only'); END;`);
  singleton.prepare("INSERT OR IGNORE INTO meta VALUES (?,?)").run(
    "rules",
    JSON.stringify({
      company: "AMOR GROUP",
      rest_hours: 11,
      max_daily: 10,
      max_weekly: 48,
      allow_half: true,
      minimum_break: 30,
      state: "HE",
    }),
  );
  return singleton;
}
export function all<T>(sql: string, ...args: (string | number | null)[]): T[] {
  return db()
    .prepare(sql)
    .all(...args) as unknown as T[];
}
export function one<T>(
  sql: string,
  ...args: (string | number | null)[]
): T | undefined {
  return db()
    .prepare(sql)
    .get(...args) as unknown as T | undefined;
}
export function run(sql: string, ...args: (string | number | null)[]) {
  return db()
    .prepare(sql)
    .run(...args);
}
export function transaction<T>(fn: () => T): T {
  db().exec("BEGIN IMMEDIATE");
  try {
    const v = fn();
    db().exec("COMMIT");
    return v;
  } catch (e) {
    db().exec("ROLLBACK");
    throw e;
  }
}
export function audit(
  actor: number,
  action: string,
  entity: string,
  before: unknown,
  after: unknown,
) {
  run(
    "INSERT INTO audit(actor_id,action,entity,before_json,after_json,created_at) VALUES (?,?,?,?,?,?)",
    actor,
    action,
    entity,
    JSON.stringify(before ?? null),
    JSON.stringify(after ?? null),
    new Date().toISOString(),
  );
}
export function notify(id: number, text: string) {
  run(
    "INSERT INTO notices(user_id,text,created_at) VALUES (?,?,?)",
    id,
    text,
    new Date().toISOString(),
  );
}
export function resetConnection() {
  singleton?.close();
  singleton = undefined;
}
