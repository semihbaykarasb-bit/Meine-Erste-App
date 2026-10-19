export type Role = "employee" | "lead" | "hr" | "admin";
export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  team_id: number;
  weekly_hours: number;
  allowance: number;
  carry: number;
  personnel_no: string;
  position: string;
  work_days: string;
  qualifications: string;
  joined: string;
  active: number;
};
export type Team = {
  id: number;
  name: string;
  department: string;
  minimum: number;
  skill: string;
  color: string;
};
export type Shift = {
  id: number;
  user_id: number;
  day: string;
  start: string;
  end: string;
  break_minutes: number;
  status: "draft" | "published" | "changed" | "cancelled";
  note: string;
  required_skill: string;
  version: number;
};
export type Leave = {
  id: number;
  user_id: number;
  start: string;
  end: string;
  half: number;
  kind: "vacation" | "absence";
  status: "pending" | "approved" | "rejected" | "withdrawn";
  days: number;
  reason: string;
  decision_reason: string;
  created_at: string;
};
export type Entry = {
  id: number;
  user_id: number;
  start: string;
  end: string | null;
  break_started: string | null;
  break_seconds: number;
  note: string;
  version: number;
};
export type Availability = {
  id: number;
  user_id: number;
  day: string;
  available: number;
  note: string;
};
export type Swap = {
  id: number;
  shift_id: number;
  target_id: number;
  source_id: number;
  status: string;
  reason: string;
  version: number;
};
export type Notice = {
  id: number;
  user_id: number;
  text: string;
  read_at: string | null;
  created_at: string;
};
export type Rules = {
  company: string;
  rest_hours: number;
  max_daily: number;
  max_weekly: number;
  allow_half: boolean;
  minimum_break: number;
  state: "HE";
};
export type Snapshot = {
  user: User;
  people: User[];
  teams: Team[];
  shifts: Shift[];
  leaves: Leave[];
  entries: Entry[];
  availability: Availability[];
  swaps: Swap[];
  notices: Notice[];
  rules: Rules;
  demo: boolean;
  today: string;
  balances: Record<
    string,
    { allowance: number; used: number; reserved: number; remaining: number }
  >;
};
