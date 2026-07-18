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
    let cancelled = false;

    async function handleCallback() {
      // Surface any provider-side error immediately (e.g. user denied consent).
      const providerError =
        searchParams.get("error_description") ?? searchParams.get("error");
      if (providerError) {
        setError(providerError);
        return;
      }

      const code = searchParams.get("code");

      if (!code) {
        setError(
          "No sign-in code was returned. Please start the sign-in again from the login page."
        );
        return;
      }

      // Explicitly exchange the PKCE authorisation code for a session.
      // detectSessionInUrl is disabled in the client to avoid a race where
      // supabase-js tries to exchange the same one-time code on initialisation.
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (cancelled) return;

      if (exchangeError) {
        // Common cause: the code was already exchanged (e.g. page reloaded).
        // Attempt to get the existing session before showing an error.
        const { data: existing } = await supabase.auth.getSession();
        if (!cancelled && existing.session) {
          await finishWithSession();
          return;
        }
        setError(
          `Could not complete sign in: ${exchangeError.message}. ` +
            `Please try again from the login page.`
        );
        return;
      }

      await finishWithSession();
    }

    async function finishWithSession() {
      if (cancelled) return;

      // If this was a Google register flow, persist the profile details.
      const pendingRegistration = readPendingRegistration();
      if (pendingRegistration) {
        const { error: requestError } = await supabase.rpc(
          "request_workspace_access",
          {
            request_first_name: pendingRegistration.firstName,
            request_last_name: pendingRegistration.lastName,
            request_phone_number: pendingRegistration.phoneNumber,
          }
        );
        if (!cancelled && requestError) {
          // Non-fatal: log and continue. The user profile will still be created
          // by the handle_new_user trigger; they just won't have phone details.
          console.warn("request_workspace_access failed:", requestError.message);
        }
        window.localStorage.removeItem("deskCulture.pendingRegistration");
      }

      if (cancelled) return;

      const next = searchParams.get("next");
      const redirectTo =
        next === "/account" || next === "/onboarding" ? next : await getPostAuthRedirect();

      if (!cancelled) {
        router.replace(redirectTo);
      }
    }

    handleCallback();

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f7efff_0%,#f0e9ff_58%,#faeaf8_100%)] px-6 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-[0_24px_60px_rgba(85,70,180,0.12)] backdrop-blur-xl">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#7b61ff] to-[#5d42df] font-black text-white">
          D
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Finishing sign in</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          We are confirming your session and preparing your organization setup.
        </p>

        {!error && (
          <div className="mt-6 flex justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-indigo-600 border-t-transparent" />
          </div>
        )}

        {error && (
          <>
            <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex text-sm font-bold text-indigo-600 hover:text-indigo-500"
            >
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
            <p className="mt-2 text-sm leading-6 text-slate-600">Preparing your organization setup.</p>
            <div className="mt-6 flex justify-center">
              <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-indigo-600 border-t-transparent" />
            </div>
          </section>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
