import Link from "next/link";
import AuthPanel from "@/components/auth-panel";

export default function RegisterPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#f7efff_0%,#f0e9ff_58%,#faeaf8_100%)] px-6 py-8 text-slate-900">
      <div className="pointer-events-none absolute -left-36 -top-36 h-[520px] w-[520px] rounded-full bg-[#c7b6ff]/45 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-40 h-[620px] w-[620px] rounded-full bg-[#f7b8dc]/35 blur-3xl" />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#7b61ff] to-[#5d42df] text-base font-black text-white shadow-[0_16px_40px_rgba(99,70,230,0.35)]">
            D
          </span>
          <span className="text-lg font-black tracking-tight text-slate-950">DeskCulture</span>
        </Link>
        <Link href="/login" className="text-sm font-bold text-indigo-600 hover:text-indigo-500">
          Sign in
        </Link>
      </header>

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-md items-center py-8">
        <AuthPanel initialMode="register" />
      </section>
    </main>
  );
}
