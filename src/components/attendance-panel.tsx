"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type AttendanceRow = {
  id: string;
  user_id: string;
  login_at: string;
  last_seen_at: string;
  logout_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
};

type Person = {
  id: string;
  full_name: string | null;
  email: string;
};

const WORKDAY_SECONDS = 8.5 * 60 * 60;

function formatDuration(totalSeconds: number) {
  const absolute = Math.abs(Math.floor(totalSeconds));
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export function AttendancePanel({
  userId,
  companyId,
  canManage,
}: {
  userId: string;
  companyId: string;
  canManage: boolean;
}) {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let heartbeat: number | undefined;
    async function recordAndLoadAttendance() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        const response = await fetch("/api/attendance/login", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          const result = (await response.json()) as { error?: string };
          setError(result.error ?? "Attendance could not be recorded.");
        }
        heartbeat = window.setInterval(() => {
          void fetch("/api/attendance/login", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
        }, 60_000);
      }

      let attendanceQuery = supabase
        .from("attendance_sessions")
        .select("id, user_id, login_at, last_seen_at, logout_at, ip_address, user_agent")
        .eq("company_id", companyId)
        .order("login_at", { ascending: false })
        .limit(canManage ? 25 : 10);

      if (!canManage) attendanceQuery = attendanceQuery.eq("user_id", userId);
      const { data: attendanceData, error: attendanceError } =
        await attendanceQuery;
      if (attendanceError) {
        setError(attendanceError.message);
        return;
      }
      setRows(attendanceData ?? []);

      if (canManage) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .eq("company_id", companyId);
        const map: Record<string, Person> = {};
        for (const person of profileData ?? []) map[person.id] = person;
        setPeople(map);
      }
    }

    recordAndLoadAttendance();
    return () => { if (heartbeat) window.clearInterval(heartbeat); };
  }, [canManage, companyId, userId]);

  const todaySessions = useMemo(() => {
    const today = new Date();
    return rows.filter((row) => { const date = new Date(row.login_at); return row.user_id === userId && date.toDateString() === today.toDateString(); });
  }, [rows, userId, now]);
  const firstLoginToday = todaySessions.reduce<string | null>((first, row) => !first || row.login_at < first ? row.login_at : first, null);
  const elapsedSeconds = firstLoginToday ? Math.max(0, (now - new Date(firstLoginToday).getTime()) / 1000) : 0;
  const remainingSeconds = WORKDAY_SECONDS - elapsedSeconds;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Attendance</h2>
          <p className="mt-1 text-sm text-slate-400">
            {canManage ? "Recent company login sessions" : "Your recent login sessions"}
          </p>
        </div>
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 px-5 py-3 text-right">
          <p className="text-xs uppercase tracking-wide text-cyan-300">Workday timer</p>
          <p className="mt-1 text-xl font-bold">{formatDuration(elapsedSeconds)}</p>
          <p className={`text-xs ${remainingSeconds >= 0 ? "text-slate-400" : "text-emerald-300"}`}>
            {remainingSeconds >= 0
              ? `${formatDuration(remainingSeconds)} remaining`
              : `${formatDuration(remainingSeconds)} extra`}
          </p>
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
      {rows.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-400">
          No attendance sessions recorded yet. Apply the Batch 1 migration to enable attendance.
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-white/5 text-slate-400">
              <tr><th className="px-4 py-3">Person</th><th className="px-4 py-3">Login</th><th className="px-4 py-3">Last seen</th><th className="px-4 py-3">IP address</th><th className="px-4 py-3">Device / browser</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const person = people[row.user_id];
                return (
                  <tr key={row.id} className="border-t border-white/10">
                    <td className="px-4 py-3 font-medium">{row.user_id === userId ? "You" : person?.full_name || person?.email || "Team member"}</td>
                    <td className="px-4 py-3 text-slate-300">{new Date(row.login_at).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-slate-300">{new Date(row.last_seen_at).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{row.ip_address ?? "Unavailable"}</td>
                    <td className="max-w-xs px-4 py-3 text-xs text-slate-400">{row.user_agent ?? "Unavailable"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
