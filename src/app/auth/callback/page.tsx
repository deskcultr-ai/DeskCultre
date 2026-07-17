"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { getPostAuthRedirect } from "@/lib/auth-redirect";
import { supabase } from "@/lib/supabase";

type PendingRegistration = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
};

function readPendingRegistration(): PendingRegistration | null {
  const raw = window.localStorage.getItem("deskCulture.pendingRegistration");
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingRegistration;
    if (!parsed.firstName || !parsed.lastName || !parsed.phoneNumber) return null;
    return parsed;
  } catch {
    return null;
  }
}

function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    async function finishAuth() {
      const code = searchParams.get("code");
      const next = searchParams.get("next");

      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
      }

      const pendingRegistration = readPendingRegistration();
      if (pendingRegistration) {
        const { error: requestError } = await supabase.rpc("request_workspace_access", {
          request_first_name: pendingRegistration.firstName,
          request_last_name: pendingRegistration.lastName,
          request_phone_number: pendingRegistration.phoneNumber,
        });

        if (requestError) {
          setError(requestError.message);
          return;
        }

        window.localStorage.removeItem("deskCulture.pendingRegistration");
      }

      const redirectTo = await getPostAuthRedirect();
      router.replace(next === "/account" && redirectTo !== "/dashboard" ? "/account" : redirectTo);
    }

    finishAuth();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f7efff_0%,#f0e9ff_58%,#faeaf8_100%)] px-6 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-[0_24px_60px_rgba(85,70,180,0.12)] backdrop-blur-xl">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#7b61ff] to-[#5d42df] font-black text-white">
          D
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Finishing sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          We are confirming your Supabase session and preparing your workspace.
        </p>
        {error && (
          <>
            <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</p>
            <Link href="/login" className="mt-5 inline-flex text-sm font-bold text-indigo-600 hover:text-indigo-500">
              Back to sign in
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f7efff_0%,#f0e9ff_58%,#faeaf8_100%)] px-6 text-slate-900">
          <section className="w-full max-w-md rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-[0_24px_60px_rgba(85,70,180,0.12)] backdrop-blur-xl">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#7b61ff] to-[#5d42df] font-black text-white">
              D
            </div>
            <h1 className="mt-5 text-2xl font-black tracking-tight">Finishing sign in</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Preparing your workspace.</p>
          </section>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
