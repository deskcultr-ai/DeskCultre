import Link from "next/link";

type MarketingPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  highlights: string[];
  cards: Array<{
    title: string;
    description: string;
  }>;
  ctaLabel?: string;
};

const navItems = [
  ["Features", "/features"],
  ["Solutions", "/solutions"],
  ["Resources", "/resources"],
  ["Pricing", "/pricing"],
];

export default function MarketingPage({ eyebrow, title, description, highlights, cards, ctaLabel = "Start with DeskCulture" }: MarketingPageProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f7f5ff] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(124,92,255,0.12),transparent_24%),radial-gradient(circle_at_82%_12%,rgba(14,165,233,0.10),transparent_22%),radial-gradient(circle_at_50%_88%,rgba(16,185,129,0.08),transparent_26%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-[1320px] items-center justify-between px-6 py-6 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-indigo-600 to-violet-500 text-sm font-bold text-white shadow-[0_10px_30px_rgba(99,102,241,0.35)]">
            DC
          </span>
          <span className="text-xl font-extrabold tracking-tight">DeskCulture</span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex">
          {navItems.map(([label, href]) => (
            <Link key={href} href={href} className="transition hover:text-indigo-600">
              {label}
            </Link>
          ))}
        </nav>

        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-500 px-4 text-sm font-bold text-white shadow-[0_12px_28px_rgba(99,102,241,0.28)]"
        >
          Sign in
        </Link>
      </header>

      <section className="relative z-10 mx-auto grid w-full max-w-[1320px] gap-10 px-6 pb-20 pt-8 lg:grid-cols-[0.95fr_1.05fr] lg:px-10 lg:pt-20">
        <div>
          <p className="inline-flex rounded-full border border-indigo-200 bg-white/70 px-4 py-2 text-sm font-bold text-indigo-600 shadow-sm backdrop-blur">
            {eyebrow}
          </p>
          <h1 className="mt-7 max-w-3xl text-5xl font-black leading-[1] tracking-tight sm:text-6xl lg:text-7xl">{title}</h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-600">{description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {highlights.map((item) => (
              <span key={item} className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-sm font-bold text-slate-700 shadow-sm backdrop-blur">
                {item}
              </span>
            ))}
          </div>
          <Link
            href="/"
            className="mt-9 inline-flex h-12 items-center justify-center rounded-xl bg-gradient-to-r from-indigo-600 to-violet-500 px-6 text-sm font-bold text-white shadow-[0_16px_34px_rgba(99,102,241,0.24)]"
          >
            {ctaLabel}
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((card, index) => (
            <article
              key={card.title}
              className={`rounded-3xl border border-white/75 bg-white/76 p-6 shadow-[0_20px_54px_rgba(85,70,180,0.10)] backdrop-blur-xl ${index === 0 ? "sm:translate-y-8" : ""} ${index === 3 ? "sm:-translate-y-8" : ""}`}
            >
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-500/10 text-lg font-black text-indigo-600">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h2 className="mt-5 text-xl font-black tracking-tight">{card.title}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">{card.description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
