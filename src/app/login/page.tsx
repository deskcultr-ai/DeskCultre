"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("Sending login link...");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: "http://localhost:3000",
      },
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Check your email for the login link.");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 shadow-2xl">
        <p className="text-sm font-semibold text-cyan-300">FlowDesk</p>

        <h1 className="mt-3 text-3xl font-bold">Login to your workspace</h1>

        <p className="mt-3 text-slate-300">
          Enter your email and we will send you a secure login link.
        </p>

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <div>
            <label className="text-sm text-slate-300">Email address</label>
            <input
              type="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400"
            />
          </div>

          <button className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950">
            Send login link
          </button>
        </form>

        {message && <p className="mt-5 text-sm text-cyan-200">{message}</p>}
      </section>
    </main>
  );
}