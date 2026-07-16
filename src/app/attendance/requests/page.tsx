"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AttendanceRequests() {
  const [profile, setProfile] = useState<{ id: string; company_id: string; role: string } | null>(null);
  const [leaveType, setLeaveType] = useState("casual");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("id, company_id, role").eq("id", user.id).single();
      setProfile(data);
    }
    load();
  }, []);

  async function submitLeave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || profile.role === "admin") return;
    const { error } = await supabase.rpc("request_leave", { leave_kind: leaveType, leave_start: from, leave_end: to, leave_reason: reason || null });
    setMessage(error?.message ?? "Leave request submitted.");
    if (!error) { setFrom(""); setTo(""); setReason(""); }
  }

  if (profile?.role === "admin") return <main className="min-h-screen bg-slate-950 px-6 py-8 text-white"><section className="mx-auto max-w-3xl"><p className="text-cyan-300">FlowDesk</p><h1 className="mt-2 text-3xl font-bold">Attendance requests</h1><p className="mt-4 text-slate-300">Admins manage leave approvals and do not submit employee leave requests.</p><Link href="/attendance" className="mt-6 inline-block rounded-xl border border-white/20 px-4 py-2">Back to attendance</Link></section></main>;
  return <main className="min-h-screen bg-slate-950 px-6 py-8 text-white"><section className="mx-auto max-w-3xl"><header className="flex justify-between border-b border-white/10 pb-6"><div><p className="text-cyan-300">FlowDesk</p><h1 className="text-3xl font-bold">Attendance requests</h1></div><Link href="/attendance" className="rounded-xl border border-white/20 px-4 py-2">Attendance</Link></header><form onSubmit={submitLeave} className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold">Request leave</h2><div className="mt-5 grid gap-3 sm:grid-cols-3"><select value={leaveType} onChange={(event) => setLeaveType(event.target.value)} className="rounded-xl bg-slate-900 p-3"><option value="casual">Casual</option><option value="sick">Sick</option><option value="work_from_home">Work from home</option></select><input required type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-xl bg-slate-900 p-3"/><input required type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-xl bg-slate-900 p-3"/></div><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason (optional)" className="mt-4 min-h-24 w-full rounded-xl bg-slate-900 p-3"/><button className="mt-4 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950">Submit leave request</button>{message && <p className="mt-4 text-cyan-200">{message}</p>}</form></section></main>;
}
