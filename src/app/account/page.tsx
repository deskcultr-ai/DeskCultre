"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Request = { status: string; review_note: string | null; updated_at: string };
export default function AccountPage() {
  const router = useRouter(); const [request, setRequest] = useState<Request | null>(null); const [password, setPassword] = useState(""); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { const { data } = await supabase.auth.getUser(); if (!data.user) { router.replace("/login"); return; } const { data: status } = await supabase.rpc("get_my_registration_status"); setRequest(status); setLoading(false); }, [router]);
  useEffect(() => { // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  async function resubmit() { const { error } = await supabase.rpc("resubmit_registration_request"); setMessage(error ? error.message : "Your request has been resubmitted for review."); if (!error) await load(); }
  async function updatePassword(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); if (password.length < 10) { setMessage("Use a password with at least 10 characters."); return; } const { error } = await supabase.auth.updateUser({ password }); setMessage(error ? error.message : "Password updated successfully."); setPassword(""); }
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading account...</main>;
  const label = request?.status ?? "awaiting verification";
  return <main className="min-h-screen bg-slate-950 px-6 py-8 text-white"><section className="mx-auto max-w-3xl"><header className="flex items-center justify-between border-b border-white/10 pb-6"><div><p className="text-sm font-semibold text-cyan-300">FlowDesk</p><h1 className="mt-1 text-3xl font-bold">Account & access</h1></div><Link href="/dashboard" className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold">Dashboard</Link></header><section className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-6"><p className="text-sm text-slate-400">Registration status</p><p className="mt-2 text-2xl font-semibold capitalize text-cyan-200">{label}</p>{request?.review_note && <p className="mt-4 text-sm text-slate-300">Admin note: {request.review_note}</p>}{request?.status === "rejected" && <button onClick={resubmit} className="mt-5 rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950">Resubmit request</button>}</section><form onSubmit={updatePassword} className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold">Password security</h2><p className="mt-2 text-sm text-slate-400">Use a unique password of at least 10 characters.</p><label className="mt-5 block text-sm">New password<input required type="password" minLength={10} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-400" /></label><button className="mt-5 rounded-xl border border-cyan-400/40 px-5 py-3 font-semibold text-cyan-200">Update password</button></form>{message && <p className="mt-5 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4 text-sm text-cyan-100">{message}</p>}</section></main>;
}
