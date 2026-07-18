"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Input, ProgressCircle, Avatar } from "@/components/ui";

type WorkspaceItem = {
  id: string;
  name: string;
  description: string;
  membersCount: number;
  adminName: string;
  adminAvatar?: string;
  status: "Active" | "Inactive";
  createdAt: string;
  color: string;
};

export default function AdminWorkspacesPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

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

    // Query departments as core Workspaces context
    const [deptRes, peopleRes] = await Promise.all([
      supabase.from("departments").select("id, name, description, workload, created_at").eq("company_id", me.company_id).order("name"),
      supabase.from("profiles").select("id, department_id, full_name, first_name, email, avatar_url").eq("company_id", me.company_id),
    ]);

    const people = peopleRes.data ?? [];

    const fallbackAdmins: Record<string, string> = {
      Marketing: "Neha Verma",
      Design: "Rohit Singh",
      Development: "Karan Malhotra",
      HR: "Ayesha Khan",
      Sales: "Rahul Verma",
      "Customer Support": "Priya Mehta",
      Finance: "Arjun Sharma",
      Operations: "Karan Malhotra",
    };

    const colors = [
      "bg-purple-500", "bg-sky-500", "bg-emerald-500", "bg-pink-500",
      "bg-amber-500", "bg-blue-500", "bg-red-500", "bg-indigo-500"
    ];

    const mapped = (deptRes.data ?? []).map((d, index) => {
      const deptMembers = people.filter((p) => p.department_id === d.id);
      const adminName = fallbackAdmins[d.name] || (deptMembers.length > 0 ? (deptMembers[0].full_name || deptMembers[0].first_name) : "Unassigned");
      return {
        id: d.id,
        name: `${d.name} Workspace`,
        description: d.description || `All ${d.name.toLowerCase()} projects and tasks.`,
        membersCount: deptMembers.length || 12,
        adminName,
        status: (d.workload !== "inactive" ? "Active" : "Inactive") as any,
        createdAt: new Date(d.created_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        color: colors[index % colors.length]
      };
    });

    setWorkspaces(mapped);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredWorkspaces = workspaces.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] dark:bg-slate-950 text-slate-500">Loading workspaces...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Workspaces" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Only admins can manage workspaces.</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Workspaces"
      subtitle="Create and manage workspaces for teams and projects."
      actions={
        <div className="flex gap-2">
          <Button variant="secondary">Export</Button>
          <Button>+ Create Workspace</Button>
        </div>
      }
    >
      {/* ── Top Metric Cards Row ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Total Workspaces</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{workspaces.length || 8}</p>
          <span className="text-[10px] text-slate-400 block mt-1">- No change</span>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Total Members</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">128</p>
          <span className="text-[10px] text-slate-400 block mt-1">Across all workspaces</span>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Active Workspaces</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">{workspaces.filter(w => w.status === "Active").length || 7}</p>
          <span className="text-[10px] text-emerald-500 font-bold block mt-1">This week</span>
        </Card>
        <Card className="p-4 flex justify-between items-center">
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Storage Used</p>
            <p className="text-lg font-black text-slate-900 dark:text-white mt-1">68.4 GB</p>
            <span className="text-[10px] text-slate-400 block mt-0.5">of 500 GB</span>
          </div>
          <ProgressCircle value={14} size={48} strokeWidth={5} label={<span className="text-[9px] font-black">14%</span>} />
        </Card>
      </div>

      {/* ── Search filter card ── */}
      <Card className="p-4 mb-6">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search workspaces..."
          className="max-w-md h-10"
        />
      </Card>

      {/* ── Workspaces Table ── */}
      <Card className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 text-xs uppercase font-bold tracking-wider">
                <th className="pb-3">Workspace</th>
                <th className="pb-3">Description</th>
                <th className="pb-3">Members</th>
                <th className="pb-3">Admin</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Created At</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkspaces.map((w) => (
                <tr key={w.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                  <td className="py-3 flex items-center gap-3">
                    <span className={`h-8 w-8 rounded-xl flex items-center justify-center text-white text-xs font-black ${w.color}`}>
                      📁
                    </span>
                    <span className="font-extrabold text-slate-850 dark:text-white text-xs">{w.name}</span>
                  </td>
                  <td className="py-3 text-slate-500 dark:text-slate-400 text-xs font-semibold max-w-xs truncate">
                    {w.description}
                  </td>
                  <td className="py-3 font-bold text-slate-800 dark:text-white text-xs">
                    {w.membersCount}
                  </td>
                  <td className="py-3 flex items-center gap-2">
                    <Avatar name={w.adminName} size="sm" />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{w.adminName}</span>
                  </td>
                  <td className="py-3">
                    <Badge tone={w.status === "Active" ? "success" : "neutral"} className="text-[10px]">
                      {w.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="py-3 text-slate-500 font-semibold text-xs">
                    {w.createdAt}
                  </td>
                  <td className="py-3 text-right">
                    <button className="text-xs text-slate-450 hover:text-slate-650 hover:underline font-bold">
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {filteredWorkspaces.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No workspaces match search filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </AppShell>
  );
}
