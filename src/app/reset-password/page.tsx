"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setMessage(""); await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/account` }); setBusy(false); setMessage("If that address has an account, a password-reset link has been sent."); }
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8"><p className="text-sm font-semibold text-cyan-300">FlowDesk</p><h1 className="mt-3 text-3xl font-bold">Reset your password</h1><p className="mt-3 text-slate-300">Enter your account email. We never reveal whether an account exists.</p><label className="mt-6 block text-sm">Email address<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-400" /></label><button disabled={busy} className="mt-5 w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">{busy ? "Sending..." : "Send reset link"}</button>{message && <p className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-100">{message}</p>}<Link href="/" className="mt-5 inline-block text-sm text-cyan-300">Back to sign in</Link></form></main>;
}
