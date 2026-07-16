"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "register";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    async function check() {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/dashboard");
      else setChecking(false);
    }
    check();
  }, [router]);

  function resetFeedback() { setMessage(""); setError(""); }
  function switchMode(next: Mode) { setMode(next); resetFeedback(); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetFeedback(); setBusy(true);
    if (mode === "login") {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      setBusy(false);
      if (loginError) { setError("Unable to sign in. Check your email and password."); return; }
      router.replace("/dashboard"); return;
    }
    const normalizedPhone = phone.replace(/[\s()-]/g, "");
    if (!/^\+[1-9][0-9]{7,14}$/.test(normalizedPhone)) { setBusy(false); setError("Use an international phone number, for example +919876543210."); return; }
    if (password.length < 10) { setBusy(false); setError("Use a password with at least 10 characters."); return; }
    if (password !== confirmPassword) { setBusy(false); setError("Passwords do not match."); return; }
    const { data, error: signupError } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: `${window.location.origin}/`, data: { registration_type: "workspace_join_request", first_name: firstName.trim(), last_name: lastName.trim(), phone_number: normalizedPhone } },
    });
    setBusy(false);
    if (signupError) { setError(signupError.message); return; }
    if (data.user && !data.session) setMessage("Check your email to verify your account. An admin will review your registration after verification.");
    else setMessage("Your registration request is pending admin approval.");
  }

  if (checking) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Loading FlowDesk...</main>;
  const input = "mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400 disabled:opacity-60";
  return <main className="min-h-screen bg-slate-950 px-6 py-8 text-white"><section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center"><div className="grid w-full gap-12 lg:grid-cols-[1.05fr_.95fr] lg:items-center"><div><p className="text-sm font-semibold text-cyan-300">FlowDesk</p><h1 className="mt-3 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">Manage work with clarity, accountability, and control.</h1><p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Tasks, approvals, attendance, meetings, and collaboration for your entire workspace.</p><div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3">{[["Tasks","Move work forward"],["Approvals","Clear decisions"],["Teams","One workspace"]].map(([title, detail])=><div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="font-semibold text-cyan-200">{title}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>)}</div></div><section className="w-full rounded-3xl border border-white/10 bg-white/10 p-7 shadow-2xl sm:p-9"><div className="grid grid-cols-2 rounded-xl bg-slate-900 p-1 text-sm font-semibold"><button onClick={()=>switchMode("login")} className={`rounded-lg py-2 ${mode==="login"?"bg-cyan-400 text-slate-950":"text-slate-400"}`}>Sign in</button><button onClick={()=>switchMode("register")} className={`rounded-lg py-2 ${mode==="register"?"bg-cyan-400 text-slate-950":"text-slate-400"}`}>Register</button></div><h2 className="mt-7 text-3xl font-bold">{mode==="login"?"Welcome back":"Request workspace access"}</h2><p className="mt-3 text-slate-300">{mode==="login"?"Sign in with your email and password.":"Register with any email. An admin assigns your workspace role and permissions."}</p><form onSubmit={submit} className="mt-7 space-y-4">{mode==="register"&&<><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">First name<input required value={firstName} onChange={e=>setFirstName(e.target.value)} className={input}/></label><label className="text-sm">Last name<input required value={lastName} onChange={e=>setLastName(e.target.value)} className={input}/></label></div><label className="block text-sm">Phone number<input required value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+919876543210" className={input}/></label></>}<label className="block text-sm">Email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" className={input}/></label><label className="block text-sm">Password<input type="password" required autoComplete={mode==="login"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)} className={input}/></label>{mode==="register"&&<label className="block text-sm">Confirm password<input type="password" required autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className={input}/></label>}<button disabled={busy} className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 disabled:opacity-60">{busy?"Please wait…":mode==="login"?"Sign in":"Create account request"}</button></form>{error&&<p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}{message&&<p className="mt-5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">{message}</p>}<button onClick={()=>{ setPassword(""); setConfirmPassword(""); switchMode(mode==="login"?"register":"login"); }} className="mt-6 text-sm text-cyan-300 hover:text-cyan-200">{mode==="login"?"New here? Register for access":"Already registered? Sign in"}</button></section></div></section></main>;
}
