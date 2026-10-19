import { z } from "zod";
import { hashSync } from "bcryptjs";
import { all, db, run, transaction } from "../lib/db";
const [email, name, role = "employee", team = "1"] = process.argv.slice(2);
const d = z
  .object({
    email: z.email(),
    name: z.string().min(2).max(100),
    role: z.enum(["employee", "lead", "hr", "admin"]),
    team: z.coerce.number().int().positive(),
    password: z
      .string()
      .min(12)
      .refine((p) => Buffer.byteLength(p) <= 72, "Höchstens 72 Bytes"),
  })
  .parse({ email, name, role, team, password: process.env.NEW_USER_PASSWORD });
transaction(() => {
  if (!all("SELECT id FROM teams LIMIT 1").length)
    run(
      "INSERT INTO teams(id,name,department,minimum,skill,color) VALUES (1,'Customer Care','Kundenservice',3,'Support','#C5A46D')",
    );
  run(
    "INSERT INTO users(name,email,password,role,team_id,weekly_hours,personnel_no,position,joined) VALUES (?,?,?,?,?,40,?,?,?)",
    d.name,
    d.email.toLowerCase(),
    hashSync(d.password, 12),
    d.role,
    d.team,
    `MA-${crypto.randomUUID().slice(0, 8)}`,
    "Teammitglied",
    new Date().toISOString().slice(0, 10),
  );
});
console.log("Benutzer angelegt. Es wurde kein Passwort ausgegeben.");
db().close();
