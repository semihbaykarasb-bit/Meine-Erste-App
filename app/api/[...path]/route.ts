import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, digest, login, requireUser } from "@/lib/auth";
import { execute } from "@/lib/actions";
import { snapshot } from "@/lib/snapshot";
import { run } from "@/lib/db";
import { actualHours, berlinDay, hours } from "@/lib/calendar";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function failure(e: unknown) {
  if (e instanceof ZodError)
    return json({ error: e.issues.map((i) => i.message).join(" ") }, 400);
  if (e instanceof AppError) return json({ error: e.message }, e.status);
  console.error(
    "Workforce request failed",
    e instanceof Error ? e.name : "unknown",
  );
  return json(
    {
      error:
        "Die Aktion konnte nicht gespeichert werden. Bitte lade die Seite neu und versuche es erneut.",
    },
    500,
  );
}
function sameOrigin(req: NextRequest) {
  const expected = process.env.APP_ORIGIN || req.nextUrl.origin;
  if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN)
    throw new AppError(
      "APP_ORIGIN muss vor dem Betrieb konfiguriert werden.",
      503,
    );
  if (req.headers.get("origin") !== expected)
    throw new AppError("Diese Anfrage ist nicht zulässig.", 403);
}
export async function GET(req: NextRequest) {
  try {
    const user = requireUser(req.cookies.get("amor_session")?.value),
      path = req.nextUrl.pathname;
    if (path === "/api/session") return json({ user });
    if (path === "/api/snapshot") return json(snapshot(user));
    if (path === "/api/export") {
      const s = snapshot(user),
        from =
          req.nextUrl.searchParams.get("from") || `${s.today.slice(0, 7)}-01`,
        to = req.nextUrl.searchParams.get("to") || s.today;
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(from) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
        to < from
      )
        throw new AppError("Ungültiger Zeitraum.");
      const quote = (v: unknown) =>
        '"' +
        String(v ?? "")
          .replace(/^[=+@\-\t\r]/, "'$&")
          .replaceAll('"', '""') +
        '"';
      const rows: unknown[][] = [
        [
          "Mitarbeiter",
          "Datum",
          "Typ",
          "Beginn",
          "Ende",
          "Netto Stunden",
          "Status",
        ],
      ];
      for (const shift of s.shifts.filter(
        (x) =>
          x.day >= from &&
          x.day <= to &&
          (user.role !== "employee" || x.user_id === user.id),
      ))
        rows.push([
          s.people.find((p) => p.id === shift.user_id)?.name,
          shift.day,
          "Plan",
          shift.start,
          shift.end,
          shift.status === "cancelled" ? 0 : hours(shift).toFixed(2),
          shift.status,
        ]);
      for (const entry of s.entries.filter(
        (x) => berlinDay(x.start) >= from && berlinDay(x.start) <= to,
      ))
        rows.push([
          s.people.find((p) => p.id === entry.user_id)?.name,
          berlinDay(entry.start),
          "Ist",
          entry.start,
          entry.end,
          actualHours(entry).toFixed(2),
          entry.end ? "abgeschlossen" : "laufend",
        ]);
      return new NextResponse(
        "\ufeff" + rows.map((r) => r.map(quote).join(";")).join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="amor-arbeitszeiten.csv"',
            "Cache-Control": "no-store",
          },
        },
      );
    }
    return json({ error: "Seite nicht gefunden." }, 404);
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    if (Number(req.headers.get("content-length") || 0) > 16384)
      throw new AppError("Anfrage zu groß.", 413);
    const raw = await req.text();
    if (raw.length > 16384) throw new AppError("Anfrage zu groß.", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AppError("Ungültige Anfrage.");
    }
    const path = req.nextUrl.pathname;
    if (path === "/api/login") {
      if (
        typeof body.email !== "string" ||
        typeof body.password !== "string" ||
        body.email.length > 254 ||
        Buffer.byteLength(body.password) > 72
      )
        throw new AppError("Bitte prüfe deine Anmeldedaten.");
      const token = login(body.email, body.password);
      const res = json({ ok: true });
      res.cookies.set("amor_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 8 * 3600,
      });
      return res;
    }
    const user = requireUser(req.cookies.get("amor_session")?.value);
    if (path === "/api/logout") {
      run(
        "DELETE FROM sessions WHERE token_hash=?",
        digest(req.cookies.get("amor_session")!.value),
      );
      const res = json({ ok: true });
      res.cookies.set("amor_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return res;
    }
    if (path === "/api/action") return json(execute(user, body));
    return json({ error: "Seite nicht gefunden." }, 404);
  } catch (e) {
    return failure(e);
  }
}
