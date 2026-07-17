"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Input, Select, Alert } from "@/components/ui";

type AuditRow = {
  id: string;
  action: string;
  summary: string | null;
  created_at: string;
  actor_id: string | null;
  actor_name?: string;
  actor_email?: string;
};

export default function AdminAuditLogsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditRow[]>([]);

  // Search & Filters
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const load = useCallback(async () => {
    const me = await getProfile();
    if (!me) {
      router.replace("/login");
      return;
    }
    if (!me.company_id || me.status !== "active") {
      router.replace("/onboarding");
      return;
    }
    setProfile(me);
    if (!isAdmin(me)) {
      setDenied(true);
      setLoading(false);
      return;
    }

    const [logsRes, profilesRes] = await Promise.all([
      supabase.from("activity_log").select("id, action, summary, created_at, actor_id").eq("company_id", me.company_id).order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, first_name, email").eq("company_id", me.company_id),
    ]);

    const activeProfiles = profilesRes.data ?? [];
    const logsData: AuditRow[] = (logsRes.data ?? []).map((row) => {
      const actor = activeProfiles.find((p) => p.id === row.actor_id);
      return {
        ...row,
        actor_name: actor ? (actor.full_name || actor.first_name) : "System Action",
        actor_email: actor ? actor.email : undefined,
      };
    });

    setLogs(logsData);
    setFilteredLogs(logsData);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  // Apply filters whenever search or category changes
  useEffect(() => {
    let result = [...logs];

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      result = result.filter(
        (l) =>
          (l.summary && l.summary.toLowerCase().includes(q)) ||
          (l.action && l.action.toLowerCase().includes(q)) ||
          (l.actor_name && l.actor_name.toLowerCase().includes(q))
      );
    }

    if (actionFilter !== "all") {
      result = result.filter((l) => l.action.startsWith(actionFilter));
    }

    setFilteredLogs(result);
  }, [query, actionFilter, logs]);

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] dark:bg-slate-950 text-slate-500">Loading audit logs...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Audit Logs" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Your role doesn&apos;t have access to organization audit logs.</p>
          <Button className="mt-5" onClick={() => router.push("/dashboard")}>
            Go to my dashboard
          </Button>
        </Card>
      </AppShell>
    );
  }

  // Get unique action types for category filtering
  const actionPrefixes = Array.from(new Set(logs.map((l) => l.action.split(".")[0])));

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Audit & Activity Logs"
      subtitle="View, track, and search system actions, profile updates, and database triggers for compliance."
    >
      <div className="space-y-6">
        {/* Filters grid */}
        <Card className="p-4 grid gap-4 md:grid-cols-3 items-end">
          <label className="block text-xs font-bold text-slate-700">
            Search Audit Logs
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Approved, member.joined"
              className="mt-1 h-10"
            />
          </label>

          <label className="block text-xs font-bold text-slate-700">
            Filter Action Type
            <Select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="mt-1 h-10"
            >
              <option value="all">All Actions</option>
              {actionPrefixes.map((p) => (
                <option key={p} value={p}>{p} actions</option>
              ))}
            </Select>
          </label>

          <Button variant="secondary" onClick={() => { setQuery(""); setActionFilter("all"); }} className="h-10">
            Reset Filters
          </Button>
        </Card>

        {/* Audit Log Table */}
        <Card>
          {filteredLogs.length === 0 ? (
            <p className="text-sm text-slate-400 bg-slate-50 dark:bg-slate-900 p-6 rounded-xl text-center">
              No audit logs match the current filter selection.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs uppercase font-bold tracking-wider">
                    <th className="pb-3">Action Name</th>
                    <th className="pb-3">Description / Summary</th>
                    <th className="pb-3">Triggered By</th>
                    <th className="pb-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => {
                    const isSystem = log.actor_name === "System Action";
                    return (
                      <tr key={log.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                        <td className="py-4 font-mono text-xs text-indigo-600 dark:text-indigo-400 pr-3">
                          {log.action}
                        </td>
                        <td className="py-4 text-slate-700 dark:text-slate-300 font-medium max-w-sm">
                          {log.summary || "No summary details."}
                        </td>
                        <td className="py-4">
                          <div>
                            <span className={`font-bold ${isSystem ? "text-slate-400" : "text-slate-800 dark:text-white"}`}>{log.actor_name}</span>
                            {log.actor_email && (
                              <span className="block text-[10px] text-slate-400 mt-0.5">{log.actor_email}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 text-right text-xs text-slate-500 font-semibold font-mono">
                          {new Date(log.created_at).toLocaleString("en-IN")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
