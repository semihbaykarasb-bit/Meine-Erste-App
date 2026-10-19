"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Clock3,
  Palmtree,
  ArrowLeftRight,
  Users,
  ChartNoAxesCombined,
  Settings2,
  Bell,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  X,
  LogOut,
  Sun,
  Moon,
  Menu,
  Download,
  Sparkles,
  ShieldCheck,
  ArrowRight,
  Play,
  Pause,
  Square,
  Copy,
  Printer,
  LoaderCircle,
  CalendarCheck2,
  BriefcaseBusiness,
} from "lucide-react";
import type { Entry, Role, Shift, Snapshot, User } from "@/lib/types";
import {
  actualHours,
  addDays,
  berlinDay,
  daysBetween,
  hours,
  monday,
} from "@/lib/calendar";
type Data = Snapshot & { corrections: Record<string, unknown>[] };
type Modal = {
  kind: string;
  shift?: Shift;
  person?: User;
  entry?: Entry;
  day?: string;
  user_id?: number;
  copy?: boolean;
};
const roles: Record<Role, string> = {
  employee: "Mitarbeiter",
  lead: "Teamleitung",
  hr: "Personalabteilung",
  admin: "Administration",
};
const statuses: Record<string, string> = {
  draft: "Entwurf",
  published: "Veröffentlicht",
  changed: "Geändert",
  cancelled: "Abgesagt",
  pending: "Offen",
  approved: "Genehmigt",
  rejected: "Abgelehnt",
  withdrawn: "Zurückgezogen",
  requested: "Angefragt",
  accepted: "Zur Prüfung",
};
const nav = [
  { id: "dashboard", label: "Übersicht", icon: LayoutDashboard },
  { id: "schedule", label: "Dienstplan", icon: CalendarDays },
  { id: "time", label: "Zeiterfassung", icon: Clock3 },
  { id: "leave", label: "Urlaub & Abwesenheit", icon: Palmtree },
  { id: "swaps", label: "Schichtübernahmen", icon: ArrowLeftRight },
  { id: "people", label: "Mitarbeiter", icon: Users },
  { id: "reports", label: "Auswertungen", icon: ChartNoAxesCombined },
  { id: "settings", label: "Einstellungen", icon: Settings2 },
];
const dateLabel = (
  s: string,
  opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" },
) =>
  new Intl.DateTimeFormat("de-DE", {
    ...opts,
    timeZone: "Europe/Berlin",
  }).format(new Date(s.length === 10 ? s + "T12:00Z" : s));
const num = (n: number) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n);
const initials = (name: string) =>
  name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
function Avatar({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span className={"avatar " + (small ? "small" : "")}>{initials(name)}</span>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={"badge " + status}>
      <i />
      {statuses[status] || status}
    </span>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <span className="eyebrow">AMOR WORKFORCE</span>
          <h2>{title}</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Schließen"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
async function request(path: string, body?: unknown) {
  const res = await fetch("/api/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(
      new Error(data.error || "Die Anfrage ist fehlgeschlagen."),
      { status: res.status },
    );
  return data;
}
export default function Workforce() {
  const [data, setData] = useState<Data | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [view, setView] = useState("dashboard"),
    [dark, setDark] = useState(false),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<Modal | null>(null),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [loginError, setLoginError] = useState(""),
    [query, setQuery] = useState(""),
    [team, setTeam] = useState(0),
    [anchor, setAnchor] = useState(""),
    [range, setRange] = useState("week"),
    [personFilter, setPersonFilter] = useState("all"),
    [now, setNow] = useState(Date.now()),
    [reportDays, setReportDays] = useState(7);
  const refresh = async () => {
    try {
      const d = await request("snapshot");
      setData(d);
      setTeam((t) =>
        ["admin", "hr"].includes(d.user.role)
          ? t || d.user.team_id
          : d.user.team_id,
      );
      setAnchor((a) => a || d.today);
    } catch (e) {
      if ((e as { status?: number }).status !== 401)
        setToast({ text: (e as Error).message, error: true });
      setData(null);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    setDark(localStorage.getItem("amor-theme") === "dark");
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("amor-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(timer);
  }, [toast]);
  const go = (id: string) => {
    setView(id);
    setMobile(false);
    setQuery("");
    setPersonFilter("all");
  };
  async function action(name: string, values: unknown = {}) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await request("action", { action: name, data: values });
      setToast({ text: result.message });
      setModal(null);
      await refresh();
    } catch (e) {
      setToast({ text: (e as Error).message, error: true });
      if ((e as { status?: number }).status === 401) setData(null);
    } finally {
      setBusy(false);
    }
  }
  const form =
    (fn: (d: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!busy) fn(new FormData(e.currentTarget));
    };
  if (loading)
    return (
      <div className="loading-screen">
        <span className="wordmark">
          amor<span>WORKFORCE</span>
        </span>
        <LoaderCircle className="spin" />
        <p>Dein Arbeitsbereich wird geladen.</p>
      </div>
    );
  if (!data)
    return (
      <main className="login">
        <section className="login-brand">
          <div className="wordmark">
            amor<span>WORKFORCE</span>
          </div>
          <div>
            <span className="eyebrow">DEIN TEAM. DEINE ZEIT.</span>
            <h1>
              Gemeinsam.
              <br />
              Gut geplant.
            </h1>
            <p>
              Mehr Überblick im Alltag.
              <br />
              Mehr Raum für das Wesentliche.
            </p>
            <div className="brand-lines">
              <span />
              <span />
              <span />
            </div>
          </div>
          <small>AMOR GROUP · WORKFORCE MANAGEMENT</small>
        </section>
        <section className="login-form">
          <div className="login-inner">
            <span className="eyebrow">WILLKOMMEN ZURÜCK</span>
            <h2>Schön, dass du da bist.</h2>
            <p>Melde dich in deinem Arbeitsbereich an.</p>
            <form
              onSubmit={form(async (f) => {
                setBusy(true);
                setLoginError("");
                try {
                  await request("login", {
                    email: f.get("email"),
                    password: f.get("password"),
                  });
                  await refresh();
                } catch (e) {
                  setLoginError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              })}
            >
              <Field label="E-Mail-Adresse">
                <input
                  name="email"
                  type="email"
                  placeholder="name@unternehmen.de"
                  autoComplete="username"
                  required
                  maxLength={254}
                />
              </Field>
              <Field label="Passwort">
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={72}
                />
              </Field>
              {loginError && (
                <p className="error-text" role="alert">
                  {loginError}
                </p>
              )}
              <button
                disabled={busy}
                className="button primary wide"
                type="submit"
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <>
                    Anmelden
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
            <div className="login-note">
              <ShieldCheck size={18} />
              <span>
                Dein Zugang wird von deiner Administration eingerichtet. Für den
                lokalen Test gelten die selbst festgelegten Demo-Zugangsdaten.
              </span>
            </div>
          </div>
        </section>
      </main>
    );
  const { user, people, teams, shifts, leaves, entries } = data;
  const manager = user.role !== "employee",
    hr = ["hr", "admin"].includes(user.role),
    admin = user.role === "admin";
  const name = (id: number) =>
    people.find((p) => p.id === id)?.name || "Teammitglied";
  const teamPeople = people.filter((p) => p.team_id === team),
    selectedTeam = teams.find((t) => t.id === team)!;
  const weekStart = monday(anchor),
    weekEnd = addDays(weekStart, 6),
    ownBalance = data.balances[user.id];
  const currentWeek = monday(data.today),
    weekShifts = shifts.filter(
      (s) =>
        s.user_id === user.id &&
        s.day >= currentWeek &&
        s.day <= addDays(currentWeek, 6) &&
        s.status !== "cancelled",
    ),
    planHours = weekShifts.reduce((n, s) => n + hours(s), 0);
  const myEntries = entries.filter((e) => e.user_id === user.id),
    activeEntry = myEntries.find((e) => !e.end),
    ownWeekActual = myEntries
      .filter(
        (e) =>
          berlinDay(e.start) >= currentWeek &&
          berlinDay(e.start) <= addDays(currentWeek, 6),
      )
      .reduce((s, e) => s + actualHours(e), 0);
  const nextShift = shifts
    .filter(
      (s) =>
        s.user_id === user.id &&
        s.day >= data.today &&
        ["published", "changed"].includes(s.status),
    )
    .sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start))[0];
  const pending = leaves.filter(
    (l) =>
      l.status === "pending" &&
      (manager ? l.user_id !== user.id : l.user_id === user.id),
  );
  const todayTeam = shifts.filter(
    (s) =>
      s.day === data.today &&
      s.status !== "cancelled" &&
      teamPeople.some((p) => p.id === s.user_id),
  );
  const uniqueToday = new Set(todayTeam.map((s) => s.user_id));
  const totalActual = myEntries.reduce((s, e) => s + actualHours(e), 0),
    completedPlan = shifts
      .filter(
        (s) =>
          s.user_id === user.id &&
          s.day < data.today &&
          ["published", "changed"].includes(s.status),
      )
      .reduce((s, e) => s + hours(e), 0),
    overtime = totalActual - completedPlan;
  const unread = data.notices.filter((n) => !n.read_at).length;
  const statCards = [
    {
      label: "Arbeitszeit diese Woche",
      value: num(ownWeekActual),
      unit: "Std.",
      detail: `${num(planHours)} Std. geplant`,
      icon: Clock3,
    },
    {
      label: "Verfügbarer Urlaub",
      value: num(ownBalance?.remaining || 0),
      unit: "Tage",
      detail: `${num(ownBalance?.reserved || 0)} Tage vorgemerkt`,
      icon: Palmtree,
    },
    {
      label: "Zeitabweichung",
      value: (overtime > 0 ? "+" : "") + num(overtime),
      unit: "Std.",
      detail: "Ist minus vergangene Planschichten",
      icon: ArrowLeftRight,
    },
    {
      label: manager ? "Offene Anträge" : "Meine offenen Anträge",
      value: String(pending.length),
      unit: "",
      detail: pending.length
        ? "Warten auf eine Entscheidung"
        : "Alles auf dem aktuellen Stand",
      icon: CalendarCheck2,
    },
  ];
  const periodStart =
    range === "day"
      ? anchor
      : range === "month"
        ? anchor.slice(0, 7) + "-01"
        : weekStart;
  const monthEnd = addDays(
    anchor.slice(0, 7) + "-01",
    new Date(
      Number(anchor.slice(0, 4)),
      Number(anchor.slice(5, 7)),
      0,
    ).getDate() - 1,
  );
  const columns = daysBetween(
    periodStart,
    range === "day" ? anchor : range === "month" ? monthEnd : weekEnd,
  );
  const filteredPeople = teamPeople.filter(
    (p) =>
      (personFilter === "all" || String(p.id) === personFilter) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  const footerButtons = (
    <div className="form-footer">
      <button
        type="button"
        className="button ghost"
        onClick={() => setModal(null)}
      >
        Abbrechen
      </button>
      <button type="submit" disabled={busy} className="button primary">
        {busy ? (
          <LoaderCircle size={16} className="spin" />
        ) : (
          <Check size={16} />
        )}
        Speichern
      </button>
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "mobile-open" : "")}>
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("dashboard");
          }}
        >
          amor<span>WORKFORCE</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">A</span>
          <div>
            <strong>{data.rules.company}</strong>
            <small>Dein Arbeitsbereich</small>
          </div>
          <ShieldCheck size={16} />
        </div>
        <span className="nav-label">ARBEITSPLATZ</span>
        <nav>
          {nav.slice(0, 7).map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.id === "leave" && pending.length > 0 && (
                <b className="nav-count">{pending.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="team-note">
            <span className="gold-dot" />
            <strong>Alles beginnt mit einem Team.</strong>
            <p>
              Wir machen Zeit für das,
              <br />
              was wirklich zählt.
            </p>
          </div>
          <nav>
            <button
              className={view === "settings" ? "active" : ""}
              onClick={() => go("settings")}
            >
              <Settings2 size={19} />
              Einstellungen
            </button>
          </nav>
          <div className="user-block">
            <Avatar name={user.name} />
            <div>
              <strong>{user.name}</strong>
              <small>{roles[user.role]}</small>
            </div>
            <button
              className="icon-button"
              onClick={async () => {
                await request("logout", {});
                setData(null);
                setTeam(0);
                go("dashboard");
              }}
              aria-label="Abmelden"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobile(false)}
          aria-label="Menü schließen"
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Menü öffnen"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={20} />
            </button>
            <span>Arbeitsplatz</span>
            <ChevronRight size={14} />
            <strong>
              {nav.find((n) => n.id === view)?.label || "Benachrichtigungen"}
            </strong>
          </div>
          <div className="top-actions">
            {data.demo && <span className="demo-label">DEMO-DATEN</span>}
            <span className="top-date">
              {dateLabel(data.today, {
                weekday: "short",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              className="icon-button"
              onClick={() => setDark(!dark)}
              aria-label={
                dark ? "Hellen Modus aktivieren" : "Dunklen Modus aktivieren"
              }
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <button
              className="icon-button notification-button"
              onClick={() => go("notifications")}
              aria-label={`${unread} ungelesene Benachrichtigungen`}
            >
              <Bell size={20} />
              {unread > 0 && <span />}
            </button>
            <Avatar name={user.name} small />
          </div>
        </header>
        <main className="content" aria-busy={busy}>
          {view === "dashboard" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">DEIN TAG AUF EINEN BLICK</span>
                  <h1>
                    {Number(
                      new Intl.DateTimeFormat("de", {
                        timeZone: "Europe/Berlin",
                        hour: "numeric",
                        hourCycle: "h23",
                      }).format(now),
                    ) < 11
                      ? "Guten Morgen"
                      : Number(
                            new Intl.DateTimeFormat("de", {
                              timeZone: "Europe/Berlin",
                              hour: "numeric",
                              hourCycle: "h23",
                            }).format(now),
                          ) < 18
                        ? "Guten Tag"
                        : "Guten Abend"}
                    , {user.name.split(" ")[0]}
                    <span className="gold-period">.</span>
                  </h1>
                  <p>
                    Gut geplant ist ein guter Anfang. Hier ist deine Übersicht.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    setAnchor(data.today);
                    go("schedule");
                  }}
                >
                  <CalendarDays size={17} />
                  Mein Dienstplan
                  <ArrowUpRight size={16} />
                </button>
              </div>
              <section className="welcome-banner">
                <div>
                  <span className="banner-kicker">
                    <span />
                    GEMEINSAM IM TAKT
                  </span>
                  <h2>
                    Ein starkes Team.
                    <br />
                    Ein klarer Plan.
                  </h2>
                  <p>
                    {uniqueToday.size} Menschen sind heute in{" "}
                    {selectedTeam.name} eingeplant.
                    <br />
                    Gestalte deinen Tag mit einem guten Überblick.
                  </p>
                  <button
                    onClick={() => {
                      setAnchor(data.today);
                      go("schedule");
                    }}
                    className="banner-link"
                  >
                    Zur Wochenübersicht
                    <ArrowRight size={16} />
                  </button>
                </div>
                <div className="banner-art" aria-hidden="true">
                  <div className="orbit one" />
                  <div className="orbit two" />
                  <div className="floating-calendar">
                    <div>
                      <span>DEINE WOCHE</span>
                      <CalendarDays size={16} />
                    </div>
                    <strong>{dateLabel(data.today, { month: "long" })}</strong>
                    <div className="mini-week">
                      {["M", "D", "M", "D", "F"].map((d, i) => (
                        <span key={i}>
                          {d}
                          <b className={i === 2 ? "selected" : ""}>
                            {new Date(
                              addDays(currentWeek, i) + "T12:00Z",
                            ).getUTCDate()}
                          </b>
                        </span>
                      ))}
                    </div>
                    <div className="mini-task">
                      <span />
                      <i />
                      <CheckCheck size={16} />
                    </div>
                    <div className="mini-task">
                      <span />
                      <i />
                      <CheckCheck size={16} />
                    </div>
                  </div>
                  <div className="floating-pill">
                    <ShieldCheck size={18} />
                    Zeit für das Wesentliche
                  </div>
                </div>
              </section>
              <div className="stats-grid">
                {statCards.map((s, i) => (
                  <section className="stat-card" key={s.label}>
                    <div className="stat-top">
                      <span>{s.label}</span>
                      <s.icon size={18} />
                    </div>
                    <div className="stat-value">
                      {s.value}
                      <small>{s.unit}</small>
                    </div>
                    <div
                      className={"stat-detail " + (i === 1 ? "gold-text" : "")}
                    >
                      {s.detail}
                    </div>
                  </section>
                ))}
              </div>
              <div className="dashboard-grid">
                <section className="card">
                  <div className="card-heading">
                    <div>
                      <h2>Deine Woche</h2>
                      <p>
                        {dateLabel(currentWeek)} bis{" "}
                        {dateLabel(addDays(currentWeek, 6))}
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => go("schedule")}
                    >
                      Dienstplan
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  <div className="week-strip">
                    {Array.from({ length: 7 }, (_, i) =>
                      addDays(currentWeek, i),
                    ).map((day) => {
                      const ss = weekShifts.filter((s) => s.day === day);
                      return (
                        <button
                          key={day}
                          className={
                            "week-day " + (day === data.today ? "today" : "")
                          }
                          onClick={() => {
                            setAnchor(day);
                            setRange("day");
                            go("schedule");
                          }}
                        >
                          <span>{dateLabel(day, { weekday: "short" })}</span>
                          <strong>{dateLabel(day, { day: "2-digit" })}</strong>
                          <i className={ss.length ? "on" : ""} />
                          <small>{ss.length ? ss[0].start : "Frei"}</small>
                        </button>
                      );
                    })}
                  </div>
                  <div className="next-shift">
                    <div className="next-icon">
                      <Clock3 size={22} />
                    </div>
                    <div>
                      <span>NÄCHSTE VERÖFFENTLICHTE SCHICHT</span>
                      <strong>
                        {nextShift
                          ? `${dateLabel(nextShift.day, { weekday: "long", day: "numeric", month: "short" })} · ${nextShift.start} – ${nextShift.end}`
                          : "Aktuell keine Schicht veröffentlicht"}
                      </strong>
                      <small>
                        {nextShift
                          ? `${teams.find((t) => t.id === user.team_id)?.name} · ${nextShift.break_minutes} Minuten Pause`
                          : "Neue Dienstpläne findest du hier, sobald sie freigegeben sind."}
                      </small>
                    </div>
                  </div>
                </section>
                <section className="card">
                  <div className="card-heading">
                    <div>
                      <h2>Heute im Team</h2>
                      <p>{selectedTeam.name}</p>
                    </div>
                    <span className="soft-count">
                      {uniqueToday.size} / {teamPeople.length}
                    </span>
                  </div>
                  <div className="team-list">
                    {teamPeople.slice(0, 4).map((p) => {
                      const shift = todayTeam.find((s) => s.user_id === p.id);
                      return (
                        <div className="person-row" key={p.id}>
                          <Avatar name={p.name} />
                          <div>
                            <strong>{p.name}</strong>
                            <small>{p.position}</small>
                          </div>
                          <span
                            className={"presence " + (shift ? "present" : "")}
                          >
                            {shift
                              ? shift.start + " – " + shift.end
                              : "Nicht eingeplant"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    className="card-bottom-link"
                    onClick={() => go("people")}
                  >
                    Alle Teammitglieder ansehen
                    <ArrowRight size={16} />
                  </button>
                </section>
              </div>
              <div className="dashboard-grid lower">
                <section className="card">
                  <div className="card-heading">
                    <div>
                      <h2>
                        {manager ? "Offene Entscheidungen" : "Meine Anträge"}
                      </h2>
                      <p>
                        {manager
                          ? "Ein guter Plan braucht kurze Wege."
                          : "Deine Auszeiten im Überblick."}
                      </p>
                    </div>
                    <button className="text-button" onClick={() => go("leave")}>
                      Alle ansehen
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                  {pending.length ? (
                    pending.slice(0, 3).map((l) => (
                      <div className="request-row" key={l.id}>
                        <Avatar name={name(l.user_id)} />
                        <div>
                          <strong>{name(l.user_id)}</strong>
                          <small>
                            {dateLabel(l.start)} bis {dateLabel(l.end)} ·{" "}
                            {num(l.days)} Tage
                          </small>
                        </div>
                        <Badge status={l.status} />
                        <button
                          className="icon-button"
                          onClick={() => go("leave")}
                          aria-label="Antrag ansehen"
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <Empty
                      title="Alles erledigt"
                      text="Zurzeit gibt es keine offenen Anträge."
                    />
                  )}
                </section>
                <section className="card accent-card">
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">DEIN ZEITKONTO</span>
                      <h2>
                        Mach kurz Pause.
                        <br />
                        Wir behalten die Zeit im Blick.
                      </h2>
                    </div>
                    <Clock3 size={27} />
                  </div>
                  <p>
                    {activeEntry
                      ? activeEntry.break_started
                        ? "Deine Pause läuft."
                        : "Deine Arbeitszeit läuft."
                      : "Bereit für deinen Arbeitstag?"}
                  </p>
                  <button
                    disabled={busy}
                    className="button primary"
                    onClick={() =>
                      activeEntry ? go("time") : action("clock.start")
                    }
                  >
                    {activeEntry ? "Zur Zeiterfassung" : "Arbeit starten"}
                    <ArrowRight size={16} />
                  </button>
                </section>
              </div>
            </>
          )}
          {view === "schedule" && (
            <>
              <Heading
                eyebrow="GEMEINSAM GUT GEPLANT"
                title="Dienstplan"
                subtitle="Alle Schichten. Ein Überblick."
              >
                <button className="button ghost" onClick={() => window.print()}>
                  <Printer size={16} />
                  Drucken
                </button>
                {manager && (
                  <>
                    <button
                      className="button secondary"
                      onClick={() => setModal({ kind: "assist" })}
                    >
                      <Sparkles size={16} />
                      Planungsassistent
                    </button>
                    <button
                      className="button primary"
                      onClick={() => setModal({ kind: "shift", day: anchor })}
                    >
                      <Plus size={17} />
                      Neue Schicht
                    </button>
                  </>
                )}
              </Heading>
              <div className="toolbar">
                <div className="toolbar-group">
                  <select
                    aria-label="Team wählen"
                    value={team}
                    onChange={(e) => {
                      setTeam(Number(e.target.value));
                      setPersonFilter("all");
                    }}
                  >
                    {teams
                      .filter((t) => hr || t.id === user.team_id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                  <div className="date-switch">
                    <button
                      className="icon-button"
                      aria-label="Vorheriger Zeitraum"
                      onClick={() =>
                        setAnchor(
                          range === "month"
                            ? addDays(periodStart, -1)
                            : addDays(anchor, range === "day" ? -1 : -7),
                        )
                      }
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <strong>
                      {range === "month"
                        ? dateLabel(anchor, { month: "long", year: "numeric" })
                        : range === "day"
                          ? dateLabel(anchor, { day: "numeric", month: "long" })
                          : `${dateLabel(weekStart)} – ${dateLabel(weekEnd)}`}
                    </strong>
                    <button
                      className="icon-button"
                      aria-label="Nächster Zeitraum"
                      onClick={() =>
                        setAnchor(
                          range === "month"
                            ? addDays(monthEnd, 1)
                            : addDays(anchor, range === "day" ? 1 : 7),
                        )
                      }
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  <button
                    className="button compact ghost"
                    onClick={() => setAnchor(data.today)}
                  >
                    Heute
                  </button>
                </div>
                <div className="segmented">
                  {[
                    ["day", "Tag"],
                    ["week", "Woche"],
                    ["month", "Monat"],
                  ].map(([v, l]) => (
                    <button
                      className={range === v ? "selected" : ""}
                      onClick={() => setRange(v)}
                      key={v}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="schedule-options">
                <label className="search-input">
                  <Search size={17} />
                  <input
                    placeholder="Mitarbeiter suchen"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  value={personFilter}
                  onChange={(e) => setPersonFilter(e.target.value)}
                  aria-label="Mitarbeiteransicht"
                >
                  <option value="all">Teamansicht</option>
                  {teamPeople.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                      {p.id === user.id ? " (Ich)" : ""}
                    </option>
                  ))}
                </select>
                <div className="legend">
                  <span>
                    <i className="published" />
                    Veröffentlicht
                  </span>
                  <span>
                    <i className="draft" />
                    Entwurf
                  </span>
                  <span>
                    <i className="vacation" />
                    Urlaub
                  </span>
                </div>
              </div>
              <section className="schedule-wrap">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th className="employee-col">
                        <span>{selectedTeam.name}</span>
                        <small>{filteredPeople.length} Teammitglieder</small>
                      </th>
                      {columns.map((d) => (
                        <th
                          key={d}
                          className={d === data.today ? "current-day" : ""}
                        >
                          <span>{dateLabel(d, { weekday: "short" })}</span>
                          <strong>
                            {dateLabel(d, { day: "numeric", month: "short" })}
                          </strong>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPeople.map((p) => (
                      <tr key={p.id}>
                        <th className="employee-col">
                          <div className="schedule-person">
                            <Avatar name={p.name} />
                            <div>
                              <strong>{p.name}</strong>
                              <small>
                                {p.weekly_hours
                                  ? num(p.weekly_hours) + " Std. / Woche"
                                  : p.position}
                              </small>
                            </div>
                          </div>
                        </th>
                        {columns.map((day) => {
                          const ss = shifts.filter(
                              (s) =>
                                s.user_id === p.id &&
                                s.day === day &&
                                s.status !== "cancelled",
                            ),
                            leave = leaves.find(
                              (l) =>
                                l.user_id === p.id &&
                                l.status === "approved" &&
                                l.start <= day &&
                                l.end >= day,
                            ),
                            off = data.availability.find(
                              (a) =>
                                a.user_id === p.id &&
                                a.day === day &&
                                !a.available,
                            );
                          return (
                            <td
                              key={day}
                              className={
                                day === data.today ? "current-day" : ""
                              }
                            >
                              {ss.map((s) => (
                                <button
                                  key={s.id}
                                  className={"shift-block " + s.status}
                                  onClick={() =>
                                    setModal({ kind: "shift", shift: s })
                                  }
                                >
                                  <span>
                                    {s.start} – {s.end}
                                  </span>
                                  <small>
                                    {num(hours(s))} Std. · {s.break_minutes}{" "}
                                    Min. Pause
                                  </small>
                                  <i>{statuses[s.status]}</i>
                                </button>
                              ))}
                              {leave ? (
                                <div className="leave-cell">
                                  <Palmtree size={15} />
                                  {leave.kind === "vacation"
                                    ? "Urlaub"
                                    : "Abwesend"}
                                </div>
                              ) : off ? (
                                <span className="cell-free">
                                  Nicht verfügbar
                                </span>
                              ) : !ss.length ? (
                                manager ? (
                                  <button
                                    className="add-shift"
                                    aria-label={`Schicht für ${p.name} am ${day} erstellen`}
                                    onClick={() =>
                                      setModal({
                                        kind: "shift",
                                        day,
                                        user_id: p.id,
                                      })
                                    }
                                  >
                                    <Plus size={17} />
                                  </button>
                                ) : (
                                  <span className="cell-free">Frei</span>
                                )
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th className="employee-col">
                        Tagesbesetzung <small>Schichten je Tag</small>
                      </th>
                      {columns.map((day) => {
                        const count = new Set(
                            shifts
                              .filter(
                                (s) =>
                                  s.day === day &&
                                  s.status !== "cancelled" &&
                                  teamPeople.some((p) => p.id === s.user_id),
                              )
                              .map((s) => s.user_id),
                          ).size,
                          weekend = [0, 6].includes(
                            new Date(day + "T12:00Z").getUTCDay(),
                          );
                        return (
                          <td key={day}>
                            <span
                              className={
                                !weekend && count < selectedTeam.minimum
                                  ? "coverage-low"
                                  : "coverage-ok"
                              }
                            >
                              {count} / {selectedTeam.minimum}
                              {!weekend && count < selectedTeam.minimum
                                ? " · Unterbesetzt"
                                : ""}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
                {!filteredPeople.length && (
                  <Empty title="Keine Treffer" text="Passe deine Suche an." />
                )}
              </section>
              <div className="schedule-footer">
                <p>
                  <ShieldCheck size={16} />
                  {manager
                    ? "Entwürfe sind für Mitarbeiter nicht sichtbar."
                    : "Hier werden nur veröffentlichte und geänderte Schichten angezeigt."}
                </p>
                {manager && (
                  <button
                    disabled={busy}
                    className="button primary"
                    onClick={() => setModal({ kind: "publish" })}
                  >
                    <CheckCheck size={17} />
                    Zeitraum veröffentlichen
                  </button>
                )}
              </div>
            </>
          )}
          {view === "leave" && (
            <>
              <Heading
                eyebrow="ZEIT FÜR DICH"
                title="Urlaub & Abwesenheit"
                subtitle="Auszeiten planen. Klarheit für alle."
              >
                <button
                  className="button primary"
                  onClick={() => setModal({ kind: "leave" })}
                >
                  <Plus size={17} />
                  Abwesenheit beantragen
                </button>
              </Heading>
              <div className="stats-grid three">
                {[
                  [
                    "Jahresanspruch",
                    ownBalance?.allowance || 0,
                    "inklusive Übertrag",
                  ],
                  [
                    "Genehmigt",
                    ownBalance?.used || 0,
                    "im laufenden Kalenderjahr",
                  ],
                  [
                    "Noch verfügbar",
                    ownBalance?.remaining || 0,
                    `${num(ownBalance?.reserved || 0)} Tage für offene Anträge reserviert`,
                  ],
                ].map(([l, v, d]) => (
                  <section key={String(l)} className="stat-card">
                    <div className="stat-top">
                      {l}
                      <Palmtree size={18} />
                    </div>
                    <div className="stat-value">
                      {num(Number(v))}
                      <small>Tage</small>
                    </div>
                    <p className="stat-detail">{d}</p>
                  </section>
                ))}
              </div>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>
                      {manager
                        ? "Anträge im Verantwortungsbereich"
                        : "Meine Anträge"}
                    </h2>
                    <p>
                      Feiertage in Hessen und persönliche Arbeitstage werden
                      berücksichtigt.
                    </p>
                  </div>
                  <span className="soft-count">{leaves.length}</span>
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Mitarbeiter</th>
                        <th>Zeitraum</th>
                        <th>Art / Dauer</th>
                        <th>Status</th>
                        <th>Details</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaves.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <div className="inline-person">
                              <Avatar name={name(l.user_id)} small />
                              {name(l.user_id)}
                            </div>
                          </td>
                          <td>
                            {dateLabel(l.start)} –{" "}
                            {dateLabel(l.end, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                          <td>
                            {l.kind === "vacation" ? "Urlaub" : "Abwesenheit"}
                            <small>
                              {num(l.days)} Tage{l.half ? " · halber Tag" : ""}
                            </small>
                          </td>
                          <td>
                            <Badge status={l.status} />
                          </td>
                          <td>
                            <span className="table-note">
                              {l.decision_reason || l.reason || "Keine Angabe"}
                            </span>
                            {manager && (
                              <small>
                                {
                                  leaves.filter(
                                    (x) =>
                                      x.id !== l.id &&
                                      x.status === "approved" &&
                                      x.start <= l.end &&
                                      x.end >= l.start &&
                                      people.find((p) => p.id === x.user_id)
                                        ?.team_id ===
                                        people.find((p) => p.id === l.user_id)
                                          ?.team_id,
                                  ).length
                                }{" "}
                                weitere Teamabwesenheiten im Zeitraum
                              </small>
                            )}
                          </td>
                          <td>
                            {l.status === "pending" &&
                              (l.user_id === user.id ? (
                                <button
                                  disabled={busy}
                                  className="text-button"
                                  onClick={() =>
                                    action("leave.withdraw", { id: l.id })
                                  }
                                >
                                  Zurückziehen
                                </button>
                              ) : manager ? (
                                <div className="row-actions">
                                  <button
                                    disabled={busy}
                                    className="button compact secondary"
                                    onClick={() =>
                                      action("leave.review", {
                                        id: l.id,
                                        approve: true,
                                      })
                                    }
                                  >
                                    Genehmigen
                                  </button>
                                  <button
                                    disabled={busy}
                                    className="icon-button"
                                    aria-label="Antrag ablehnen"
                                    onClick={() =>
                                      setModal({
                                        kind: "reject",
                                        user_id: l.id,
                                      })
                                    }
                                  >
                                    <X size={17} />
                                  </button>
                                </div>
                              ) : null)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!leaves.length && (
                  <Empty
                    title="Zeit für die nächste Auszeit?"
                    text="Deine Anträge erscheinen nach dem Einreichen hier."
                  />
                )}
              </section>
            </>
          )}
          {view === "time" && (
            <>
              <Heading
                eyebrow="DEIN ARBEITSTAG, IM BLICK"
                title="Zeiterfassung"
                subtitle="Geplante und tatsächlich geleistete Zeit bleiben getrennt."
              >
                <button
                  className="button secondary"
                  onClick={() => setModal({ kind: "manual" })}
                >
                  <Plus size={16} />
                  Zeit nachtragen
                </button>
              </Heading>
              <section className="clock-card">
                <div>
                  <span className="eyebrow">
                    {activeEntry
                      ? activeEntry.break_started
                        ? "PAUSE LÄUFT"
                        : "ARBEITSZEIT LÄUFT"
                      : "BEREIT FÜR DEINEN TAG"}
                  </span>
                  <div className="clock-number">
                    {activeEntry
                      ? (() => {
                          const secs = Math.max(
                            0,
                            Math.floor(
                              (now - Date.parse(activeEntry.start)) / 1000,
                            ) -
                              activeEntry.break_seconds -
                              (activeEntry.break_started
                                ? Math.floor(
                                    (now -
                                      Date.parse(activeEntry.break_started)) /
                                      1000,
                                  )
                                : 0),
                          );
                          return `${String(Math.floor(secs / 3600)).padStart(2, "0")}:${String(Math.floor(secs / 60) % 60).padStart(2, "0")}`;
                        })()
                      : "00:00"}
                    <small>Std.</small>
                  </div>
                  <p>
                    {activeEntry
                      ? `Gestartet um ${dateLabel(activeEntry.start, { hour: "2-digit", minute: "2-digit" })} · Pausen werden abgezogen`
                      : "Starte die Erfassung, wenn deine Arbeit beginnt."}
                  </p>
                </div>
                <div className="clock-actions">
                  {activeEntry ? (
                    <>
                      <button
                        disabled={busy}
                        className="button secondary"
                        onClick={() =>
                          action(
                            activeEntry.break_started
                              ? "clock.resume"
                              : "clock.pause",
                          )
                        }
                      >
                        {activeEntry.break_started ? (
                          <Play size={17} />
                        ) : (
                          <Pause size={17} />
                        )}{" "}
                        {activeEntry.break_started
                          ? "Fortsetzen"
                          : "Pause starten"}
                      </button>
                      <button
                        disabled={busy}
                        className="button primary"
                        onClick={() => action("clock.stop")}
                      >
                        <Square size={16} />
                        Arbeit beenden
                      </button>
                    </>
                  ) : (
                    <button
                      disabled={busy}
                      className="button primary"
                      onClick={() => action("clock.start")}
                    >
                      <Play size={18} />
                      Arbeit starten
                    </button>
                  )}
                </div>
              </section>
              <div className="stats-grid three">
                {[
                  ["Ist diese Woche", ownWeekActual],
                  ["Geplant diese Woche", planHours],
                  ["Wochenvertrag", user.weekly_hours],
                ].map(([l, v]) => (
                  <div className="stat-card" key={l}>
                    <div className="stat-top">{l}</div>
                    <div className="stat-value">
                      {num(Number(v))}
                      <small>Std.</small>
                    </div>
                  </div>
                ))}
              </div>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Meine Zeitbuchungen</h2>
                    <p>
                      Korrekturen werden nach Freigabe protokolliert übernommen.
                    </p>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Datum</th>
                        <th>Beginn</th>
                        <th>Ende</th>
                        <th>Pause</th>
                        <th>Arbeitszeit</th>
                        <th>Aktion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myEntries.map((e) => (
                        <tr key={e.id}>
                          <td>
                            {dateLabel(e.start, {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </td>
                          <td>
                            {dateLabel(e.start, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td>
                            {e.end
                              ? dateLabel(e.end, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Läuft"}
                          </td>
                          <td>{Math.round(e.break_seconds / 60)} Min.</td>
                          <td>
                            {e.end
                              ? num(actualHours(e)) + " Std."
                              : "In Erfassung"}
                          </td>
                          <td>
                            {e.end && (
                              <button
                                className="text-button"
                                onClick={() =>
                                  setModal({ kind: "correction", entry: e })
                                }
                              >
                                Korrektur anfragen
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!myEntries.length && (
                  <Empty
                    title="Deine Zeit zählt"
                    text="Erfasste Arbeitszeiten erscheinen hier."
                  />
                )}
              </section>
              {data.corrections.length > 0 && (
                <section className="card section-gap">
                  <div className="card-heading">
                    <div>
                      <h2>Zeitkorrekturen</h2>
                      <p>
                        {manager
                          ? "Prüfe die Anträge deines Teams."
                          : "Der Status deiner Korrekturanträge."}
                      </p>
                    </div>
                  </div>
                  {data.corrections.map((c) => (
                    <div className="request-row" key={String(c.id)}>
                      <Avatar name={name(Number(c.user_id))} />
                      <div>
                        <strong>
                          {name(Number(c.user_id))} · {String(c.reason)}
                        </strong>
                        <small>
                          {dateLabel(String(c.start))} ·{" "}
                          {dateLabel(String(c.start), {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          –{" "}
                          {dateLabel(String(c.end), {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </small>
                      </div>
                      <Badge status={String(c.status)} />
                      {manager &&
                        c.status === "pending" &&
                        c.user_id !== user.id && (
                          <div className="row-actions">
                            <button
                              disabled={busy}
                              className="button compact secondary"
                              onClick={() =>
                                action("correction.review", {
                                  id: c.id,
                                  approve: true,
                                })
                              }
                            >
                              Genehmigen
                            </button>
                            <button
                              disabled={busy}
                              className="icon-button"
                              onClick={() =>
                                action("correction.review", {
                                  id: c.id,
                                  approve: false,
                                })
                              }
                              aria-label="Korrektur ablehnen"
                            >
                              <X size={17} />
                            </button>
                          </div>
                        )}
                    </div>
                  ))}
                </section>
              )}
            </>
          )}
          {view === "swaps" && (
            <>
              <Heading
                eyebrow="FLEXIBEL ALS TEAM"
                title="Schichtübernahmen"
                subtitle="Kollege nimmt an. Teamleitung prüft. Erst dann wird umgeplant."
              >
                <button
                  className="button primary"
                  onClick={() => setModal({ kind: "swap" })}
                >
                  <Plus size={17} />
                  Übernahme anfragen
                </button>
              </Heading>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <h2>Aktuelle Anfragen</h2>
                    <p>
                      Verfügbarkeiten und Konflikte werden vor der Freigabe
                      erneut geprüft.
                    </p>
                  </div>
                </div>
                {data.swaps.map((sw) => {
                  const shift = shifts.find((s) => s.id === sw.shift_id);
                  return (
                    <div className="swap-row" key={sw.id}>
                      <div className="swap-people">
                        <Avatar name={name(sw.source_id)} />
                        <ArrowRight size={16} />
                        <Avatar name={name(sw.target_id)} />
                      </div>
                      <div className="grow">
                        <strong>
                          {name(sw.source_id)} an {name(sw.target_id)}
                        </strong>
                        <small>
                          {shift
                            ? `${dateLabel(shift.day)} · ${shift.start} – ${shift.end}`
                            : "Schicht nicht verfügbar"}
                          {sw.reason ? " · " + sw.reason : ""}
                        </small>
                      </div>
                      <Badge status={sw.status} />
                      {sw.target_id === user.id &&
                        sw.status === "requested" && (
                          <div className="row-actions">
                            <button
                              disabled={busy}
                              className="button compact primary"
                              onClick={() =>
                                action("swap.respond", {
                                  id: sw.id,
                                  accept: true,
                                })
                              }
                            >
                              Annehmen
                            </button>
                            <button
                              disabled={busy}
                              className="button compact ghost"
                              onClick={() =>
                                action("swap.respond", {
                                  id: sw.id,
                                  accept: false,
                                })
                              }
                            >
                              Ablehnen
                            </button>
                          </div>
                        )}
                      {manager &&
                        sw.status === "accepted" &&
                        ![sw.source_id, sw.target_id].includes(user.id) && (
                          <div className="row-actions">
                            <button
                              disabled={busy}
                              className="button compact primary"
                              onClick={() =>
                                action("swap.review", {
                                  id: sw.id,
                                  approve: true,
                                })
                              }
                            >
                              Freigeben
                            </button>
                            <button
                              disabled={busy}
                              className="button compact ghost"
                              onClick={() =>
                                action("swap.review", {
                                  id: sw.id,
                                  approve: false,
                                })
                              }
                            >
                              Ablehnen
                            </button>
                          </div>
                        )}
                    </div>
                  );
                })}
                {!data.swaps.length && (
                  <Empty
                    title="Mehr Flexibilität im Alltag"
                    text="Frage Kollegen an, wenn du eine veröffentlichte Schicht abgeben möchtest."
                  />
                )}
              </section>
            </>
          )}
          {view === "people" && (
            <>
              <Heading
                eyebrow="MENSCHEN MACHEN DEN UNTERSCHIED"
                title="Unser Team"
                subtitle={`${people.length} Teammitglieder. Gemeinsam mehr bewegen.`}
              />
              <div className="toolbar">
                <label className="search-input">
                  <Search size={18} />
                  <input
                    placeholder="Nach Name oder Position suchen"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Team filtern"
                  value={personFilter}
                  onChange={(e) => setPersonFilter(e.target.value)}
                >
                  <option value="all">Alle sichtbaren Teams</option>
                  {teams
                    .filter((t) => hr || t.id === user.team_id)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="people-grid">
                {people
                  .filter(
                    (p) =>
                      (personFilter === "all" ||
                        String(p.team_id) === personFilter) &&
                      (p.name + " " + p.position)
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )
                  .map((p) => (
                    <section className="person-card" key={p.id}>
                      <div className="person-card-top">
                        <span
                          className="team-chip"
                          style={{
                            borderColor: teams.find((t) => t.id === p.team_id)
                              ?.color,
                          }}
                        >
                          {teams.find((t) => t.id === p.team_id)?.name}
                        </span>
                        {p.id === user.id && <small>Du</small>}
                      </div>
                      <Avatar name={p.name} />
                      <h2>{p.name}</h2>
                      <p>{p.position}</p>
                      <div className="person-meta">
                        <span>
                          <BriefcaseBusiness size={15} />
                          {p.weekly_hours
                            ? num(p.weekly_hours) + " Std. / Woche"
                            : "Teammitglied"}
                        </span>
                        <span>{roles[p.role]}</span>
                      </div>
                      {hr && (
                        <button
                          className="card-bottom-link"
                          onClick={() =>
                            setModal({ kind: "person", person: p })
                          }
                        >
                          Profil verwalten
                          <ArrowUpRight size={15} />
                        </button>
                      )}
                    </section>
                  ))}
              </div>
            </>
          )}
          {view === "reports" &&
            (() => {
              const from = addDays(data.today, -reportDays + 1),
                scope = manager
                  ? people
                  : people.filter((p) => p.id === user.id),
                scopeIds = new Set(scope.map((p) => p.id)),
                periodShifts = shifts.filter(
                  (s) =>
                    scopeIds.has(s.user_id) &&
                    s.day >= from &&
                    s.day <= data.today &&
                    ["published", "changed"].includes(s.status),
                ),
                periodEntries = entries.filter(
                  (e) =>
                    scopeIds.has(e.user_id) &&
                    berlinDay(e.start) >= from &&
                    berlinDay(e.start) <= data.today,
                ),
                plan = periodShifts.reduce((v, s) => v + hours(s), 0),
                actual = periodEntries.reduce((v, s) => v + actualHours(s), 0),
                chartDays = daysBetween(from, data.today),
                max = Math.max(
                  1,
                  ...chartDays.map((day) =>
                    periodShifts
                      .filter((s) => s.day === day)
                      .reduce((v, s) => v + hours(s), 0),
                  ),
                  ...chartDays.map((day) =>
                    periodEntries
                      .filter((e) => berlinDay(e.start) === day)
                      .reduce((v, e) => v + actualHours(e), 0),
                  ),
                );
              return (
                <>
                  <Heading
                    eyebrow="AUS ZAHLEN WIRD ÜBERBLICK"
                    title="Auswertungen"
                    subtitle="Berechnet aus veröffentlichten Plänen und abgeschlossenen Zeitbuchungen."
                  >
                    <select
                      aria-label="Berichtszeitraum"
                      value={reportDays}
                      onChange={(e) => setReportDays(Number(e.target.value))}
                    >
                      <option value={7}>Letzte 7 Tage</option>
                      <option value={30}>Letzte 30 Tage</option>
                    </select>
                    <a
                      className="button primary"
                      href={`/api/export?from=${from}&to=${data.today}`}
                    >
                      <Download size={16} />
                      CSV exportieren
                    </a>
                    <button
                      className="button ghost"
                      onClick={() => window.print()}
                      aria-label="Bericht drucken"
                    >
                      <Printer size={17} />
                    </button>
                  </Heading>
                  <div className="stats-grid three">
                    {[
                      ["Geplante Zeit", plan],
                      ["Erfasste Zeit", actual],
                      ["Abweichung", actual - plan],
                    ].map(([l, v]) => (
                      <div className="stat-card" key={l}>
                        <div className="stat-top">{l}</div>
                        <div className="stat-value">
                          {num(Number(v))}
                          <small>Std.</small>
                        </div>
                      </div>
                    ))}
                  </div>
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <h2>Plan und Wirklichkeit</h2>
                        <p>
                          {dateLabel(from)} bis {dateLabel(data.today)} · Werte
                          in Stunden
                        </p>
                      </div>
                      <div className="legend">
                        <span>
                          <i className="draft" />
                          Plan
                        </span>
                        <span>
                          <i className="published" />
                          Ist
                        </span>
                      </div>
                    </div>
                    <div className="chart-scroll">
                      <div className="bar-chart">
                        {chartDays.map((day) => {
                          const p = periodShifts
                              .filter((s) => s.day === day)
                              .reduce((v, s) => v + hours(s), 0),
                            a = periodEntries
                              .filter((e) => berlinDay(e.start) === day)
                              .reduce((v, e) => v + actualHours(e), 0);
                          return (
                            <button
                              className="chart-day"
                              key={day}
                              aria-label={`${dateLabel(day)}: Plan ${num(p)}, Ist ${num(a)} Stunden`}
                              onClick={() =>
                                setToast({
                                  text: `${dateLabel(day)}: ${num(p)} Std. geplant, ${num(a)} Std. erfasst.`,
                                })
                              }
                            >
                              <div className="bars">
                                <span
                                  style={{
                                    height: Math.max(2, (p / max) * 165) + "px",
                                  }}
                                />
                                <span
                                  style={{
                                    height: Math.max(2, (a / max) * 165) + "px",
                                  }}
                                />
                              </div>
                              <small>
                                {dateLabel(day, {
                                  day: "2-digit",
                                  month: "2-digit",
                                })}
                              </small>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                  <section className="card section-gap">
                    <div className="card-heading">
                      <div>
                        <h2>Arbeitszeit nach Teammitglied</h2>
                        <p>
                          Abweichungen sind Planvergleiche und kein geprüftes
                          Überstundenkonto.
                        </p>
                      </div>
                    </div>
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Mitarbeiter</th>
                            <th>Plan</th>
                            <th>Ist</th>
                            <th>Abweichung</th>
                            <th>Offene Anträge</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scope.map((p) => {
                            const a = periodEntries
                                .filter((e) => e.user_id === p.id)
                                .reduce((v, e) => v + actualHours(e), 0),
                              b = periodShifts
                                .filter((s) => s.user_id === p.id)
                                .reduce((v, e) => v + hours(e), 0);
                            return (
                              <tr key={p.id}>
                                <td>{p.name}</td>
                                <td>{num(b)} Std.</td>
                                <td>{num(a)} Std.</td>
                                <td>{num(a - b)} Std.</td>
                                <td>
                                  {
                                    leaves.filter(
                                      (l) =>
                                        l.user_id === p.id &&
                                        l.status === "pending",
                                    ).length
                                  }
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              );
            })()}
          {view === "settings" && (
            <>
              <Heading
                eyebrow="DEIN ARBEITSBEREICH"
                title="Einstellungen"
                subtitle="Persönliche Ansicht und zentrale Planungsregeln."
              />
              <div className="settings-grid">
                <section className="card settings-card">
                  <h2>Dein Profil</h2>
                  <div className="profile-summary">
                    <Avatar name={user.name} />
                    <div>
                      <strong>{user.name}</strong>
                      <p>{user.email}</p>
                    </div>
                  </div>
                  <dl>
                    <dt>Rolle</dt>
                    <dd>{roles[user.role]}</dd>
                    <dt>Team</dt>
                    <dd>{teams.find((t) => t.id === user.team_id)?.name}</dd>
                    <dt>Personalnummer</dt>
                    <dd>{user.personnel_no}</dd>
                    <dt>Eintritt</dt>
                    <dd>
                      {dateLabel(user.joined, {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </dd>
                  </dl>
                  <div className="setting-line">
                    <div>
                      <strong>Erscheinungsbild</strong>
                      <small>{dark ? "Dunkler Modus" : "Heller Modus"}</small>
                    </div>
                    <button
                      className="button secondary compact"
                      onClick={() => setDark(!dark)}
                    >
                      {dark ? <Sun size={16} /> : <Moon size={16} />}Wechseln
                    </button>
                  </div>
                  <button
                    className="button secondary wide"
                    onClick={() => setModal({ kind: "availability" })}
                  >
                    <CalendarDays size={17} />
                    Verfügbarkeit hinterlegen
                  </button>
                  <div className="availability-list">
                    {data.availability
                      .filter(
                        (a) => a.user_id === user.id && a.day >= data.today,
                      )
                      .map((a) => (
                        <p key={a.id}>
                          {dateLabel(a.day)} ·{" "}
                          {a.available ? "Verfügbar" : "Nicht verfügbar"}
                          {a.note ? " · " + a.note : ""}
                        </p>
                      ))}
                  </div>
                </section>
                <section className="card settings-card">
                  <h2>Dienstplanregeln</h2>
                  <p className="muted">
                    Aktuell für Hessen. Änderungen sind der Administration
                    vorbehalten.
                  </p>
                  <form
                    onSubmit={form((f) =>
                      action("settings.save", {
                        company: f.get("company"),
                        rest_hours: f.get("rest"),
                        max_daily: f.get("daily"),
                        max_weekly: f.get("weekly"),
                        minimum_break: f.get("pause"),
                        allow_half: f.get("half") === "on",
                        state: "HE",
                      }),
                    )}
                  >
                    <fieldset disabled={!admin || busy}>
                      <Field label="Unternehmen">
                        <input
                          name="company"
                          defaultValue={data.rules.company}
                          required
                          maxLength={80}
                        />
                      </Field>
                      <div className="form-grid">
                        <Field label="Mindestruhezeit (Std.)">
                          <input
                            name="rest"
                            type="number"
                            min="11"
                            max="24"
                            defaultValue={data.rules.rest_hours}
                            required
                          />
                        </Field>
                        <Field label="Max. Arbeitszeit / Tag (Std.)">
                          <input
                            name="daily"
                            type="number"
                            min="1"
                            max="10"
                            defaultValue={data.rules.max_daily}
                            required
                          />
                        </Field>
                        <Field label="Max. Arbeitszeit / Woche (Std.)">
                          <input
                            name="weekly"
                            type="number"
                            min="1"
                            max="48"
                            defaultValue={data.rules.max_weekly}
                            required
                          />
                        </Field>
                        <Field label="Mindestpause ab 6 Std. (Min.)">
                          <input
                            name="pause"
                            type="number"
                            min="30"
                            max="120"
                            defaultValue={data.rules.minimum_break}
                            required
                          />
                        </Field>
                      </div>
                      <label className="checkbox-label">
                        <input
                          name="half"
                          type="checkbox"
                          defaultChecked={data.rules.allow_half}
                        />
                        Halbe Urlaubstage erlauben
                      </label>
                      {admin && (
                        <button
                          className="button primary"
                          type="submit"
                          disabled={busy}
                        >
                          <Check size={16} />
                          Regeln speichern
                        </button>
                      )}
                    </fieldset>
                  </form>
                  <div className="info-box">
                    <ShieldCheck size={19} />
                    <p>
                      Die Regeln unterstützen die Planung. Arbeitszeitmodelle,
                      Ausnahmen und Datenschutz müssen vor dem betrieblichen
                      Einsatz fachlich und rechtlich geprüft werden.
                    </p>
                  </div>
                </section>
              </div>
            </>
          )}
          {view === "notifications" && (
            <>
              <Heading
                eyebrow="IMMER AUF DEM AKTUELLEN STAND"
                title="Benachrichtigungen"
                subtitle={`${unread} ungelesene Mitteilungen`}
              >
                <button
                  disabled={busy}
                  className="button secondary"
                  onClick={() => action("notices.read")}
                >
                  <CheckCheck size={17} />
                  Alle als gelesen markieren
                </button>
              </Heading>
              <section className="card">
                {data.notices.map((n) => (
                  <div
                    className={"notice-row " + (!n.read_at ? "unread" : "")}
                    key={n.id}
                  >
                    <div className="next-icon">
                      <Bell size={18} />
                    </div>
                    <div>
                      <strong>{n.text}</strong>
                      <small>
                        {dateLabel(n.created_at, {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </div>
                    {!n.read_at && <span className="gold-dot" />}
                  </div>
                ))}
                {!data.notices.length && (
                  <Empty
                    title="Alles auf dem aktuellen Stand"
                    text="Neue Mitteilungen erscheinen hier."
                  />
                )}
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>AMOR WORKFORCE</span>
            <span>
              {data.demo
                ? "Fiktive Demo-Daten · Keine echten Personaldaten"
                : "Dein Team. Deine Zeit."}
            </span>
          </footer>
        </main>
      </div>
      <nav className="bottom-nav">
        {nav.slice(0, 4).map((n) => (
          <button
            key={n.id}
            onClick={() => go(n.id)}
            className={view === n.id ? "active" : ""}
          >
            <n.icon size={20} />
            <span>{n.id === "leave" ? "Urlaub" : n.label}</span>
          </button>
        ))}
        <button
          onClick={() => setMobile(!mobile)}
          className={mobile ? "active" : ""}
        >
          <Menu size={20} />
          <span>Mehr</span>
        </button>
      </nav>
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={"toast " + (toast.error ? "error" : "")}
        >
          <span>{toast.error ? <X size={18} /> : <Check size={18} />}</span>
          <p>{toast.text}</p>
          <button
            aria-label="Hinweis schließen"
            className="icon-button"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <Dialog
          onClose={() => setModal(null)}
          title={
            {
              shift:
                modal.shift && !modal.copy ? "Schichtdetails" : "Neue Schicht",
              leave: "Abwesenheit beantragen",
              reject: "Antrag ablehnen",
              manual: "Arbeitszeit nachtragen",
              correction: "Korrektur beantragen",
              swap: "Schichtübernahme anfragen",
              person: "Mitarbeiterprofil",
              availability: "Verfügbarkeit hinterlegen",
              assist: "Dein Planungsassistent",
              publish: "Dienstplan veröffentlichen",
            }[modal.kind] || "Details"
          }
        >
          {modal.kind === "shift" && (
            <form
              onSubmit={form((f) =>
                action("shift.save", {
                  id: modal.copy ? undefined : modal.shift?.id,
                  version: modal.copy ? undefined : modal.shift?.version,
                  user_id: f.get("user_id"),
                  day: f.get("day"),
                  start: f.get("start"),
                  end: f.get("end"),
                  break_minutes: f.get("break"),
                  note: f.get("note"),
                  required_skill: f.get("skill"),
                }),
              )}
            >
              <fieldset disabled={!manager || busy}>
                <Field label="Mitarbeiter">
                  <select
                    name="user_id"
                    defaultValue={
                      modal.shift?.user_id || modal.user_id || teamPeople[0]?.id
                    }
                  >
                    {people
                      .filter((p) => hr || p.team_id === user.team_id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ·{" "}
                          {teams.find((t) => t.id === p.team_id)?.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Datum">
                  <input
                    type="date"
                    name="day"
                    required
                    defaultValue={modal.shift?.day || modal.day || data.today}
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Beginn">
                    <input
                      type="time"
                      name="start"
                      required
                      defaultValue={modal.shift?.start || "09:00"}
                    />
                  </Field>
                  <Field label="Ende">
                    <input
                      type="time"
                      name="end"
                      required
                      defaultValue={modal.shift?.end || "17:30"}
                    />
                  </Field>
                  <Field label="Pause (Minuten)">
                    <input
                      type="number"
                      name="break"
                      min="0"
                      max="120"
                      required
                      defaultValue={modal.shift?.break_minutes ?? 30}
                    />
                  </Field>
                  <Field label="Erforderliche Qualifikation">
                    <input
                      name="skill"
                      maxLength={80}
                      defaultValue={modal.shift?.required_skill || ""}
                      placeholder="z. B. Support"
                    />
                  </Field>
                </div>
                <Field label="Notiz">
                  <textarea
                    name="note"
                    maxLength={500}
                    defaultValue={modal.shift?.note || ""}
                  />
                </Field>
              </fieldset>
              {modal.shift && (
                <p className="muted">
                  <Badge status={modal.shift.status} /> · Version{" "}
                  {modal.shift.version}
                </p>
              )}
              {manager && (
                <>
                  {modal.shift && !modal.copy && (
                    <div className="row-actions">
                      <button
                        className="button ghost compact"
                        type="button"
                        onClick={() => setModal({ ...modal, copy: true })}
                      >
                        <Copy size={15} />
                        Kopieren
                      </button>
                      <button
                        disabled={busy}
                        className="button danger compact"
                        type="button"
                        onClick={() =>
                          action("shift.cancel", {
                            id: modal.shift!.id,
                            version: modal.shift!.version,
                          })
                        }
                      >
                        Schicht absagen
                      </button>
                    </div>
                  )}
                  {footerButtons}
                </>
              )}
            </form>
          )}
          {modal.kind === "leave" && (
            <form
              onSubmit={form((f) =>
                action("leave.create", {
                  start: f.get("start"),
                  end: f.get("end"),
                  kind: f.get("kind"),
                  half: f.get("half") === "on",
                  reason: f.get("reason"),
                }),
              )}
            >
              <Field label="Art der Abwesenheit">
                <select name="kind">
                  <option value="vacation">Urlaub</option>
                  <option value="absence">Sonstige Abwesenheit</option>
                </select>
              </Field>
              <div className="form-grid">
                <Field label="Von">
                  <input
                    type="date"
                    name="start"
                    min={data.today}
                    defaultValue={data.today}
                    required
                  />
                </Field>
                <Field label="Bis">
                  <input
                    type="date"
                    name="end"
                    min={data.today}
                    defaultValue={data.today}
                    required
                  />
                </Field>
              </div>
              {data.rules.allow_half && (
                <label className="checkbox-label">
                  <input type="checkbox" name="half" />
                  Halber Tag (nur bei gleichem Start und Ende)
                </label>
              )}
              <Field label="Notiz (optional, keine Gesundheitsdaten)">
                <textarea name="reason" maxLength={500} />
              </Field>
              <p className="muted">
                Gezählt werden persönliche Arbeitstage ohne hessische Feiertage.
                Ein Antrag reserviert Urlaub bis zur Entscheidung.
              </p>
              {footerButtons}
            </form>
          )}
          {modal.kind === "reject" && (
            <form
              onSubmit={form((f) =>
                action("leave.review", {
                  id: modal.user_id,
                  approve: false,
                  reason: f.get("reason"),
                }),
              )}
            >
              <Field label="Begründung für das Teammitglied">
                <textarea
                  name="reason"
                  required
                  minLength={2}
                  maxLength={500}
                />
              </Field>
              {footerButtons}
            </form>
          )}
          {["manual", "correction"].includes(modal.kind) && (
            <form
              onSubmit={form((f) =>
                action(
                  modal.kind === "manual" ? "entry.manual" : "entry.correct",
                  {
                    id: modal.entry?.id,
                    day: f.get("day"),
                    start: f.get("start"),
                    end: f.get("end"),
                    break_minutes: f.get("pause"),
                    note: f.get("reason"),
                    reason: f.get("reason"),
                  },
                ),
              )}
            >
              <Field label="Datum">
                <input
                  type="date"
                  name="day"
                  max={data.today}
                  defaultValue={
                    modal.entry ? berlinDay(modal.entry.start) : data.today
                  }
                  required
                />
              </Field>
              <div className="form-grid">
                <Field label="Beginn">
                  <input
                    type="time"
                    name="start"
                    defaultValue={
                      modal.entry
                        ? dateLabel(modal.entry.start, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "09:00"
                    }
                    required
                  />
                </Field>
                <Field label="Ende">
                  <input
                    type="time"
                    name="end"
                    defaultValue={
                      modal.entry?.end
                        ? dateLabel(modal.entry.end, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "17:30"
                    }
                    required
                  />
                </Field>
              </div>
              <Field label="Pause (Minuten)">
                <input
                  type="number"
                  name="pause"
                  min="0"
                  max="120"
                  defaultValue={
                    modal.entry
                      ? Math.round(modal.entry.break_seconds / 60)
                      : 30
                  }
                  required
                />
              </Field>
              <Field label="Begründung">
                <textarea
                  name="reason"
                  required
                  minLength={3}
                  maxLength={500}
                />
              </Field>
              <p className="muted">
                Nachträge und Korrekturen werden mit einem Änderungsnachweis
                gespeichert.
              </p>
              {footerButtons}
            </form>
          )}
          {modal.kind === "availability" && (
            <form
              onSubmit={form((f) =>
                action("availability.save", {
                  day: f.get("day"),
                  available: f.get("available") === "yes",
                  note: f.get("note"),
                }),
              )}
            >
              <Field label="Datum">
                <input
                  type="date"
                  name="day"
                  min={data.today}
                  defaultValue={data.today}
                  required
                />
              </Field>
              <Field label="Verfügbarkeit">
                <select name="available">
                  <option value="no">Nicht verfügbar</option>
                  <option value="yes">Verfügbar</option>
                </select>
              </Field>
              <Field label="Notiz (optional)">
                <textarea name="note" maxLength={500} />
              </Field>
              {footerButtons}
            </form>
          )}
          {modal.kind === "swap" && (
            <form
              onSubmit={form((f) =>
                action("swap.create", {
                  shift_id: f.get("shift"),
                  target_id: f.get("target"),
                  reason: f.get("reason"),
                }),
              )}
            >
              <Field label="Deine Schicht">
                <select name="shift" required defaultValue="">
                  <option value="" disabled>
                    Schicht auswählen
                  </option>
                  {shifts
                    .filter(
                      (s) =>
                        s.user_id === user.id &&
                        s.day >= data.today &&
                        ["published", "changed"].includes(s.status),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {dateLabel(s.day)} · {s.start} – {s.end}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Angefragter Kollege">
                <select name="target" required defaultValue="">
                  <option value="" disabled>
                    Teammitglied auswählen
                  </option>
                  {people
                    .filter(
                      (p) => p.team_id === user.team_id && p.id !== user.id,
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Nachricht (optional)">
                <textarea name="reason" maxLength={500} />
              </Field>
              <p className="muted">
                Die Anfrage betrifft die Übergabe einer Schicht. Sie wird erst
                nach Annahme und Freigabe durch eine unbeteiligte Teamleitung
                wirksam.
              </p>
              {footerButtons}
            </form>
          )}
          {modal.kind === "person" && modal.person && (
            <form
              onSubmit={form((f) =>
                action("employee.save", {
                  id: modal.person!.id,
                  name: f.get("name"),
                  position: f.get("position"),
                  team_id: f.get("team"),
                  weekly_hours: f.get("hours"),
                  allowance: f.get("allowance"),
                  carry: f.get("carry"),
                  role: f.get("role"),
                  qualifications: String(f.get("skills"))
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  work_days: f.getAll("workday").map(Number),
                }),
              )}
            >
              <Field label="Name">
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  defaultValue={modal.person.name}
                />
              </Field>
              <Field label="Position">
                <input
                  name="position"
                  required
                  minLength={2}
                  maxLength={100}
                  defaultValue={modal.person.position}
                />
              </Field>
              <div className="form-grid">
                <Field label="Team">
                  <select name="team" defaultValue={modal.person.team_id}>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Wochenstunden">
                  <input
                    name="hours"
                    type="number"
                    min="1"
                    max="48"
                    required
                    step="0.5"
                    defaultValue={modal.person.weekly_hours}
                  />
                </Field>
                <Field label="Urlaubstage">
                  <input
                    type="number"
                    name="allowance"
                    required
                    min="0"
                    max="60"
                    step="0.5"
                    defaultValue={modal.person.allowance}
                  />
                </Field>
                <Field label="Übertrag">
                  <input
                    type="number"
                    name="carry"
                    required
                    min="0"
                    max="60"
                    step="0.5"
                    defaultValue={modal.person.carry}
                  />
                </Field>
              </div>
              <Field label="Qualifikationen (durch Komma trennen)">
                <input
                  name="skills"
                  maxLength={500}
                  defaultValue={JSON.parse(modal.person.qualifications).join(
                    ", ",
                  )}
                />
              </Field>
              <Field label="Berechtigungsrolle">
                <select
                  name="role"
                  defaultValue={modal.person.role}
                  aria-readonly={!admin}
                  onChange={(e) => {
                    if (!admin) e.target.value = modal.person!.role;
                  }}
                >
                  {Object.entries(roles).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="workday-options">
                <span>Reguläre Arbeitstage</span>
                {["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"].map((s, i) => (
                  <label key={i}>
                    <input
                      name="workday"
                      type="checkbox"
                      value={i}
                      defaultChecked={JSON.parse(
                        modal.person!.work_days,
                      ).includes(i)}
                    />
                    {s}
                  </label>
                ))}
              </div>
              {footerButtons}
            </form>
          )}
          {modal.kind === "assist" && (
            <form
              onSubmit={form((f) =>
                action("plan.assist", {
                  team_id: team,
                  start: f.get("start"),
                  headcount: f.get("headcount"),
                  start_time: f.get("start_time"),
                  end_time: f.get("end_time"),
                  break_minutes: f.get("pause"),
                }),
              )}
            >
              <div className="info-box">
                <Sparkles size={20} />
                <p>
                  Der Assistent verteilt Schichten für Montag bis Freitag anhand
                  freier Kapazität, Vertragsstunden, Verfügbarkeit und
                  Planungsregeln. Er erstellt ausschließlich Entwürfe.
                </p>
              </div>
              <Field label="Woche auswählen">
                <input
                  type="date"
                  name="start"
                  min={data.today}
                  defaultValue={addDays(monday(data.today), 7)}
                  required
                />
              </Field>
              <Field label="Benötigte Teammitglieder pro Tag">
                <input
                  name="headcount"
                  type="number"
                  min="1"
                  max="20"
                  defaultValue={selectedTeam.minimum}
                  required
                />
              </Field>
              <div className="form-grid">
                <Field label="Von">
                  <input
                    name="start_time"
                    type="time"
                    defaultValue="09:00"
                    required
                  />
                </Field>
                <Field label="Bis">
                  <input
                    name="end_time"
                    type="time"
                    defaultValue="17:30"
                    required
                  />
                </Field>
              </div>
              <Field label="Pause (Minuten)">
                <input
                  type="number"
                  name="pause"
                  min="0"
                  max="120"
                  defaultValue="30"
                  required
                />
              </Field>
              {footerButtons}
            </form>
          )}
          {modal.kind === "publish" && (
            <div>
              <p>
                Veröffentliche die Entwürfe für{" "}
                <strong>{selectedTeam.name}</strong> vom{" "}
                <strong>{dateLabel(periodStart)}</strong> bis{" "}
                <strong>{dateLabel(columns.at(-1)!)}</strong>.
              </p>
              <p className="muted">
                Alle Schichten werden erneut auf Konflikte geprüft. Die
                Teammitglieder erhalten anschließend eine Benachrichtigung.
              </p>
              <div className="form-footer">
                <button className="button ghost" onClick={() => setModal(null)}>
                  Abbrechen
                </button>
                <button
                  disabled={busy}
                  className="button primary"
                  onClick={() =>
                    action("plan.publish", {
                      team_id: team,
                      start: periodStart,
                      end: columns.at(-1)!,
                    })
                  }
                >
                  <CheckCheck size={17} />
                  Jetzt veröffentlichen
                </button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
function Heading({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>
          {title}
          <span className="gold-period">.</span>
        </h1>
        <p>{subtitle}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <CalendarCheck2 size={27} />
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
