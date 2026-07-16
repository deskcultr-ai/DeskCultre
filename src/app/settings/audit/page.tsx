"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Audit = { id: string; action: string; details: Record<string, unknown>; created_at: string; target_user_id: string | null };
export default function AuditPage() {
  const [items, setItems] = useState<Audit[]>([]); const [allowed, setAllowed] = useState(false); const [loading, setLoading] = useState(true);
  useEffect(() => { async function load() { const { data: auth } = await supabase.auth.getUser(); const { data: profile } = await supabase.from("profiles").select("role,company_id").eq("id", auth.user?.id ?? "").maybeSingle(); if (profile?.role === "admin") { setAllowed(true); const { data } = await supabase.from("access_audit_log").select("id,action,details,created_at,target_user_id").eq("company_id", profile.company_id).order("created_at", { ascending: false }).limit(100); setItems(data ?? []); } setLoading(false); } load(); }, []);
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading audit log...</main>;
  if (!allowed) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Admin access required.</main>;
  return <main className="min-h-screen bg-slate-950 px-6 py-8 text-white"><section className="mx-auto max-w-5xl"><header className="flex items-center justify-between border-b border-white/10 pb-6"><div><p className="text-sm font-semibold text-cyan-300">FlowDesk</p><h1 className="mt-1 text-3xl font-bold">Access audit log</h1><p className="mt-2 text-slate-400">Latest 100 access and approval events.</p></div><Link href="/dashboard" className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold">Dashboard</Link></header><div className="mt-6 space-y-3">{items.map((item) => <article key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-5"><p className="font-semibold capitalize">{item.action.replaceAll("_", " ")}</p><p className="mt-2 break-words text-sm text-slate-300">{JSON.stringify(item.details)}</p><p className="mt-2 text-xs text-slate-500">{new Date(item.created_at).toLocaleString("en-IN")}</p></article>)}{items.length === 0 && <p className="rounded-2xl border border-white/10 bg-white/5 p-7 text-slate-400">No logged events yet.</p>}</div></section></main>;
}
