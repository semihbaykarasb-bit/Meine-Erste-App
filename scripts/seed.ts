import { hashSync } from "bcryptjs";
import { all, db, notify, run, transaction } from "../lib/db";
import { addDays, instant, monday, today } from "../lib/calendar";
export function seed(password: string) {
  if (password.length < 12 || Buffer.byteLength(password) > 72)
    throw new Error("DEMO_PASSWORD muss 12 bis 72 Bytes enthalten.");
  if (all("SELECT id FROM users LIMIT 1").length)
    throw new Error(
      "Datenbank enthält bereits Benutzer. Seed wurde nicht ausgeführt.",
    );
  const hash = hashSync(password, 12),
    start = monday(today());
  transaction(() => {
    [
      ["Customer Care", "Kundenservice", 3, "Support", "#C5A46D"],
      ["Retail", "Vertrieb", 3, "Beratung", "#789D91"],
      ["Fulfillment", "Logistik", 3, "Versand", "#8E9DB6"],
      ["Brand Studio", "Marketing", 2, "Design", "#A68CA6"],
    ].forEach((t, i) =>
      run(
        "INSERT INTO teams(id,name,department,minimum,skill,color) VALUES (?,?,?,?,?,?)",
        i + 1,
        ...(t as [string, string, number, string, string]),
      ),
    );
    const names = [
      "Mila Winter",
      "Leon Berger",
      "Nora Falk",
      "Emil Stern",
      "Lena Sommer",
      "Finn Wald",
      "Ella Brandt",
      "Noah West",
      "Mia Linden",
      "Luca Bach",
      "Clara Wolff",
      "Ben Hansen",
      "Lina Seidel",
      "Paul Berg",
      "Emma Roth",
      "Theo König",
      "Ida Stein",
      "Jonas Blum",
      "Anna Feld",
      "Luis Morgen",
    ];
    for (let i = 0; i < 20; i++) {
      const team = Math.floor(i / 5) + 1,
        role =
          i === 0
            ? "admin"
            : i === 1
              ? "hr"
              : i % 5 === 0
                ? "lead"
                : "employee",
        part = i % 5 === 4,
        skill = ["Support", "Beratung", "Versand", "Design"][team - 1];
      run(
        "INSERT INTO users(id,name,email,password,role,team_id,weekly_hours,allowance,carry,personnel_no,position,qualifications,joined) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        i + 1,
        names[i],
        `demo${i + 1}@example.invalid`,
        hash,
        role,
        team,
        part ? 20 : 40,
        30,
        0,
        `DEMO-${String(i + 1).padStart(3, "0")}`,
        role === "admin"
          ? "Administration"
          : role === "hr"
            ? "People & Culture"
            : role === "lead"
              ? "Teamleitung"
              : part
                ? "Teilzeit"
                : "Teammitglied",
        JSON.stringify([skill]),
        "2025-01-15",
      );
      for (let w = -1; w <= 1; w++)
        for (let d = 0; d < 5; d++) {
          const date = addDays(start, w * 7 + d),
            end = part ? "13:00" : "17:30",
            pause = part ? 0 : 30,
            status = w === 1 ? "draft" : "published";
          run(
            "INSERT INTO shifts(user_id,day,start,end,break_minutes,status,note,required_skill) VALUES (?,?,?,?,?,?,?,?)",
            i + 1,
            date,
            "09:00",
            end,
            pause,
            status,
            "",
            skill,
          );
          if (date < today() && w <= 0)
            run(
              "INSERT INTO entries(user_id,start,end,break_seconds,note) VALUES (?,?,?,?,?)",
              i + 1,
              new Date(instant(date, "09:00")).toISOString(),
              new Date(instant(date, end)).toISOString(),
              pause * 60,
              "Fiktive Demo-Buchung",
            );
        }
      notify(
        i + 1,
        "Willkommen bei AMOR WORKFORCE. Alle angezeigten Personaldaten sind fiktive Demo-Daten.",
      );
    }
    const leaveDay = addDays(start, 21);
    for (const uid of [3, 8, 13])
      run(
        "INSERT INTO leaves(user_id,start,end,kind,status,days,reason,created_at) VALUES (?,?,?,'vacation','pending',3,'Private Auszeit',?)",
        uid,
        leaveDay,
        addDays(leaveDay, 2),
        new Date().toISOString(),
      );
    run(
      "INSERT INTO leaves(user_id,start,end,kind,status,days,reason,created_at) VALUES (?,?,?,'vacation','approved',5,'Urlaub',?)",
      4,
      addDays(start, 28),
      addDays(start, 32),
      new Date().toISOString(),
    );
    const sw = all<{ id: number }>(
      "SELECT id FROM shifts WHERE user_id=4 AND day>=? AND status='published' ORDER BY day LIMIT 1",
      today(),
    )[0];
    if (sw) {
      const original = all<{ day: string }>(
        "SELECT day FROM shifts WHERE id=?",
        sw.id,
      )[0];
      run(
        "UPDATE shifts SET status='cancelled' WHERE user_id=5 AND day=?",
        original.day,
      );
      run(
        "INSERT INTO swaps(shift_id,target_id,source_id,status,reason) VALUES (?,5,4,'requested','Privater Termin')",
        sw.id,
      );
    }
    run(
      "INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      "demo",
      "true",
    );
  });
}
if (process.argv[1]?.endsWith("seed.ts")) {
  seed(process.env.DEMO_PASSWORD || "");
  console.log(
    "20 fiktive Benutzer, vier Teams und Demo-Dienstpläne angelegt. Anmeldung: demo1@example.invalid (Admin), demo2@example.invalid (HR), demo6@example.invalid (Teamleitung), demo7@example.invalid (Mitarbeiter). Passwort: dein gesetztes DEMO_PASSWORD.",
  );
  db().close();
}
