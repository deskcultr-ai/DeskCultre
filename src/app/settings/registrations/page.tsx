"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Registration = { id: string; first_name: string; last_name: string; email: string; phone_number: string; created_at: string };
type OrgItem = { id: string; name: string; company_id?: string };

export default function RegistrationsPage() {
  const [loading, setLoading] = useState(true);
  const [admin, setAdmin] = useState(false);
  const [requests, setRequests] = useState<Registration[]>([]);
  const [companies, setCompanies] = useState<OrgItem[]>([]);
  const [departments, setDepartments] = useState<OrgItem[]>([]);
  const [teams, setTeams] = useState<OrgItem[]>([]);
  const [company, setCompany] = useState(""); const [department, setDepartment] = useState(""); const [team, setTeam] = useState("");
  const [role, setRole] = useState("member"); const [create, setCreate] = useState(false); const [review, setReview] = useState(false);
  const [error, setError] = useState(""); const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setLoading(false); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth.user.id).single();
    if (profile?.role !== "admin") { setLoading(false); return; }
    setAdmin(true);
    const [r, c, d, t] = await Promise.all([
      supabase.from("registration_requests").select("id,first_name,last_name,email,phone_number,created_at").eq("status", "pending").order("created_at"),
      supabase.from("companies").select("id,name").order("name"),
      supabase.from("departments").select("id,name,company_id").order("name"),
      supabase.from("teams").select("id,name,company_id").eq("is_active", true).order("name"),
    ]);
    setRequests(r.data ?? []); setCompanies(c.data ?? []); setDepartments(d.data ?? []); setTeams(t.data ?? []);
    setCompany((current) => current || c.data?.[0]?.id || ""); setLoading(false);
  }
  useEffect(() => { // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);
  const isManager = ["admin", "manager"].includes(role);
  async function approve(request: Registration) {
    if (!company) return; setBusy(request.id); setError("");
    const { error: rpcError } = await supabase.rpc("approve_registration_request", { request_id: request.id, target_company_id: company, target_department_id: department || null, target_team_id: team || null, target_role: role, allow_task_creation: create, allow_review: review, allow_people: isManager, allow_organization: isManager, allow_reports: isManager, allow_meetings: isManager });
    setBusy(null); if (rpcError) setError(rpcError.message); else await load();
  }
  async function reject(request: Registration) {
    const note = window.prompt(`Reason for rejecting ${request.email}`); if (!note) return;
    setBusy(request.id); const { error: rpcError } = await supabase.rpc("reject_registration_request", { request_id: request.id, rejection_note: note });
    setBusy(null); if (rpcError) setError(rpcError.message); else await load();
  }
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading registration requests...</main>;
  if (!admin) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Admin access required.</main>;
  return <main className="min-h-screen bg-slate-950 px-6 py-8 text-white"><section className="mx-auto max-w-6xl"><header className="flex items-center justify-between border-b border-white/10 pb-6"><div><p className="text-sm font-semibold text-cyan-300">FlowDesk</p><h1 className="mt-1 text-3xl font-bold">Registration Requests</h1><p className="mt-2 text-slate-400">Approve access, teams, roles, and permissions.</p></div><Link href="/dashboard" className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold">Dashboard</Link></header>{error && <p className="mt-5 text-sm text-red-300">{error}</p>}<section className="mt-6 grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:grid-cols-2 lg:grid-cols-4"><select value={company} onChange={(e) => { setCompany(e.target.value); setDepartment(""); setTeam(""); }} className="rounded-xl bg-slate-900 px-3 py-2"><option value="">Select company</option>{companies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={department} onChange={(e) => setDepartment(e.target.value)} className="rounded-xl bg-slate-900 px-3 py-2"><option value="">No department</option>{departments.filter((item) => item.company_id === company).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-xl bg-slate-900 px-3 py-2"><option value="">No team</option>{teams.filter((item) => item.company_id === company).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl bg-slate-900 px-3 py-2"><option value="member">Team Member</option><option value="executive">Executive</option><option value="manager">Manager</option><option value="reviewer">Reviewer</option><option value="admin">Admin</option></select><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} />Create tasks</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={review} onChange={(e) => setReview(e.target.checked)} />Review work</label></section><div className="mt-6 space-y-3">{requests.map((request) => <article key={request.id} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">{request.first_name} {request.last_name}</h2><p className="mt-1 text-sm text-slate-300">{request.email} · {request.phone_number}</p><p className="mt-1 text-xs text-slate-500">Requested {new Date(request.created_at).toLocaleString("en-IN")}</p></div><div className="flex gap-3"><button onClick={() => approve(request)} disabled={busy === request.id || !company} className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">Approve</button><button onClick={() => reject(request)} disabled={busy === request.id} className="rounded-xl border border-red-400/40 px-4 py-2 text-sm font-semibold text-red-200 disabled:opacity-60">Reject</button></div></article>)}{requests.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-slate-400">No pending registration requests.</div>}</div></section></main>;
}
