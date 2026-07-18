"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/ui";
import type { Profile } from "@/lib/session";
import { displayName } from "@/lib/session";

type NavItem = { label: string; href?: string; icon: React.ReactNode };
type NavGroup = { heading?: string; items: NavItem[] };
type NotificationItem = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-[18px] w-[18px] shrink-0">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} />
  </svg>
);

const ICONS = {
  home: "M2.25 12l8.954-8.955a1.125 1.125 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75",
  users: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
  building: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
  shield: "M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z",
  grid: "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25A2.25 2.25 0 0 1 13.5 8.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
  check: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  inbox: "M2.25 13.5h3.86a2.25 2.25 0 0 1 2.012 1.244l.256.512a2.25 2.25 0 0 0 2.013 1.244h3.218a2.25 2.25 0 0 0 2.013-1.244l.256-.512a2.25 2.25 0 0 1 2.013-1.244h3.859m-19.5.338V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18v-4.162c0-.224-.034-.447-.1-.661L19.24 5.338a2.25 2.25 0 0 0-2.15-1.588H6.911a2.25 2.25 0 0 0-2.15 1.588L2.35 13.177a2.25 2.25 0 0 0-.1.661Z",
  video: "m15.75 10.5 4.72-2.36a.75.75 0 0 1 1.03.67v9.38a.75.75 0 0 1-1.03.67l-4.72-2.36M4.5 6.75h9a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5h-9a1.5 1.5 0 0 1-1.5-1.5v-7.5a1.5 1.5 0 0 1 1.5-1.5Z",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0V11.25A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5",
  folder: "M3 7h5l2 2h11v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  file: "M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l6 6v10a2 2 0 0 1-2 2ZM13 3v6h6",
  paperPlane: "M6 12 3.269 3.125A59.77 59.77 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L6 12Zm0 0h7.5",
  megaphone: "M10.34 15.84 9.2 19.25a1.5 1.5 0 0 1-2.85-.08L5.63 16.5M19.5 12c0 2.6.56 5.06 1.57 7.29.13.29-.08.62-.4.62H19.5a7.5 7.5 0 0 1-7.5-7.5v-.82a7.5 7.5 0 0 1 7.5-7.5h1.17c.32 0 .53.33.4.62A17.9 17.9 0 0 0 19.5 12ZM12 12H4.5a2 2 0 0 0 0 4H12",
  link: "M13.19 8.688a4.5 4.5 0 0 1 6.363 6.364l-1.768 1.767a4.5 4.5 0 0 1-6.364 0M10.81 15.312a4.5 4.5 0 0 1-6.363-6.364L6.215 7.18a4.5 4.5 0 0 1 6.364 0",
  chat: "M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155",
  chart: "M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21M7.5 15.75V12M12 15.75V8.25M16.5 15.75v-4.5M21 15.75V6",
  clock: "M12 6.75V12l3 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  gear: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.03 7.03 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.397-1.11-.94l-.213-1.28c-.062-.375-.312-.687-.644-.87a6.52 6.52 0 0 1-.22-.128c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.93 6.93 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z",
  book: "M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25",
  logs: "M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z",
};

const employeeNav: NavGroup[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: icon(ICONS.home) },
      { label: "Chats", href: "/chats", icon: icon(ICONS.chat) },
      { label: "Tasks", href: "/tasks", icon: icon(ICONS.check) },
      { label: "Requests", href: "/requests", icon: icon(ICONS.inbox) },
    ],
  },
];

const adminNav: NavGroup[] = [
  { items: [{ label: "Dashboard", href: "/admin", icon: icon(ICONS.home) }] },
  {
    heading: "Manage",
    items: [
      { label: "Users & Teams", href: "/admin/users", icon: icon(ICONS.users) },
      { label: "Departments", href: "/admin/departments", icon: icon(ICONS.building) },
      { label: "Roles & Permissions", href: "/admin/roles", icon: icon(ICONS.shield) },
    ],
  },
  {
    heading: "Workplace",
    items: [
      { label: "Tasks", href: "/admin/tasks", icon: icon(ICONS.check) },
      { label: "Requests", href: "/admin/requests", icon: icon(ICONS.inbox) },
      { label: "Projects", href: "/admin/projects", icon: icon(ICONS.folder) },
      { label: "Meetings", href: "/admin/meetings", icon: icon(ICONS.video) },
      { label: "Calendar", href: "/admin/calendar", icon: icon(ICONS.calendar) },
      { label: "Announcements", href: "/admin/announcements", icon: icon(ICONS.megaphone) },
      { label: "Chat", href: "/admin/chat", icon: icon(ICONS.chat) },
      { label: "Drive", href: "/admin/drive", icon: icon(ICONS.folder) },
    ],
  },
];

export function AppShell({
  profile,
  children,
  title,
  subtitle,
  variant = "employee",
  actions,
}: {
  profile: Profile | null;
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  variant?: "employee" | "admin";
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const groups = variant === "admin" ? adminNav : employeeNav;
  const isAdminShell = variant === "admin";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (variant === "admin") {
      document.documentElement.classList.remove("dark");
      return;
    }
    const savedTheme = localStorage.getItem("deskCulture.theme") || "light";
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [variant]);

  useEffect(() => {
    if (!isAdminShell || !profile?.id) return;
    let alive = true;
    async function loadNotifications() {
      const { data } = await supabase
        .from("notifications")
        .select("id,title,body,link,read_at,created_at")
        .eq("profile_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(6);
      if (alive) setNotifications((data as NotificationItem[]) ?? []);
    }
    loadNotifications();
    return () => {
      alive = false;
    };
  }, [isAdminShell, profile?.id]);

  useEffect(() => {
    if (!isAdminShell) return;
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
        setProfileOpen(false);
        setMobileNavOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isAdminShell]);

  const searchItems = useMemo(
    () =>
      groups
        .flatMap((group) => group.items)
        .filter((item): item is NavItem & { href: string } => Boolean(item.href))
        .filter((item) => item.label.toLowerCase().includes(searchQuery.trim().toLowerCase())),
    [groups, searchQuery]
  );

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  function goTo(href: string) {
    router.push(href);
    setSearchOpen(false);
    setProfileOpen(false);
    setNotificationsOpen(false);
    setMobileNavOpen(false);
  }

  async function openNotification(item: NotificationItem) {
    if (!item.read_at) {
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((n) => (n.id === item.id ? { ...n, read_at: readAt } : n)));
      await supabase.from("notifications").update({ read_at: readAt }).eq("id", item.id);
    }
    if (item.link) goTo(item.link);
  }

  return (
    <div className={cn("flex min-h-screen transition-colors duration-200", isAdminShell ? "bg-[#f8faff] text-[#0f1740]" : "bg-[#f8fafc] dark:bg-slate-950 dark:text-slate-100")}>
      {/* Sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r",
          sidebarCollapsed ? "lg:hidden" : "lg:flex",
          isAdminShell ? "w-[264px] border-[#e7ebf5] bg-white" : "w-64 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        )}
      >
        <Link href="/" className="flex items-center gap-3 px-6 py-5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-sm font-bold text-white">
            {isAdminShell ? "DC" : "DC"}
          </div>
          <span className={cn("text-lg font-extrabold tracking-tight", isAdminShell ? "text-[#101936]" : "text-slate-900 dark:text-white")}>DeskCulture</span>
        </Link>

        <nav className={cn("flex-1 overflow-y-auto px-3", isAdminShell ? "pb-3" : "pb-4")}>
          {groups.map((group, groupIndex) => (
            <div key={group.heading ?? groupIndex} className={cn(isAdminShell ? "mb-5" : "mb-4")}>
              {group.heading && (
                <p className={cn("px-3 pb-2 text-[11px] font-bold uppercase tracking-wider", isAdminShell ? "pt-2 text-[#7180a6]" : "pt-3 text-slate-400 dark:text-slate-500")}>
                  {group.heading}
                </p>
              )}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active = item.href && (pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`)));
                  return (
                    <li key={item.label}>
                      {item.href ? (
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition",
                            isAdminShell ? "py-2.5" : "py-2",
                            active
                              ? isAdminShell
                                ? "bg-[#f0edff] text-primary"
                                : "bg-primary-light text-primary dark:bg-indigo-950/60 dark:text-indigo-300"
                              : isAdminShell
                                ? "text-[#4b587d] hover:bg-[#f6f7fb] hover:text-primary"
                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:text-slate-900 dark:hover:text-white"
                          )}
                        >
                          {item.icon}
                          {item.label}
                        </Link>
                      ) : (
                        <span
                          title="Not built yet"
                          className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 dark:text-slate-700"
                        >
                          {item.icon}
                          {item.label}
                          <span className="ml-auto text-[10px] font-semibold uppercase text-slate-300 dark:text-slate-700">soon</span>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={cn("p-4", isAdminShell ? "border-t border-[#eef1f7]" : "border-t border-slate-200 dark:border-slate-800")}>
          {isAdminShell && (
            <div className="mb-4 rounded-lg border border-[#e6e9f4] bg-[#f7f8ff] p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-light text-primary">{icon(ICONS.chat)}</span>
                <div>
                  <p className="text-sm font-bold text-[#101936]">Need Help?</p>
                  <p className="text-xs text-[#637091]">Chat with our support team</p>
                </div>
              </div>
            </div>
          )}
          {isAdminShell && (
            <div className="mb-4 rounded-lg border border-[#dedbff] bg-gradient-to-br from-[#f7f5ff] to-[#eef4ff] p-4">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#ede8ff] text-primary">{icon(ICONS.shield)}</div>
              <p className="mt-3 text-sm font-bold text-[#101936]">Upgrade to Pro</p>
              <p className="mt-1 text-xs text-[#637091]">Unlock advanced analytics</p>
              <button className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary text-xs font-bold text-white shadow-ds-sm">
                Upgrade Now
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-6-6 6 6-6 6" />
                </svg>
              </button>
            </div>
          )}
          <div className={cn("flex items-center gap-3", isAdminShell && "hidden")}>
            <Avatar name={displayName(profile)} src={profile?.avatar_url ?? undefined} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{profile?.full_name || displayName(profile)}</p>
              <p className="truncate text-xs capitalize text-slate-500 dark:text-slate-400">{profile?.role?.replace("_", " ")}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className={cn(
              "w-full rounded-lg border py-2 text-xs font-semibold transition",
              isAdminShell ? "border-[#e6e9f4] text-[#637091] hover:bg-[#f6f7fb]" : "mt-3 border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800"
            )}
          >
            Sign out
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative flex h-full w-[286px] max-w-[86vw] flex-col border-r border-[#e7ebf5] bg-white shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4">
              <Link href="/" className="flex items-center gap-3" onClick={() => setMobileNavOpen(false)}>
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary to-violet-500 text-sm font-bold text-white">DC</div>
                <span className="text-lg font-extrabold tracking-tight text-[#101936]">DeskCulture</span>
              </Link>
              <button
                aria-label="Close navigation"
                onClick={() => setMobileNavOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-[#24304f] hover:bg-[#f3f5fb]"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 pb-4">
              {groups.map((group, groupIndex) => (
                <div key={group.heading ?? groupIndex} className="mb-5">
                  {group.heading && <p className="px-3 pb-2 pt-2 text-[11px] font-bold uppercase tracking-wider text-[#7180a6]">{group.heading}</p>}
                  <ul className="space-y-1">
                    {group.items.map((item) => {
                      const active = item.href && (pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`)));
                      return (
                        <li key={item.label}>
                          {item.href ? (
                            <Link
                              href={item.href}
                              onClick={() => setMobileNavOpen(false)}
                              className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                                active ? "bg-[#f0edff] text-primary" : "text-[#4b587d] hover:bg-[#f6f7fb] hover:text-primary"
                              )}
                            >
                              {item.icon}
                              {item.label}
                            </Link>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur-xl sm:gap-4 sm:px-6 sm:py-4",
            isAdminShell ? "border-[#e6eaf3] bg-white/90" : "border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/80"
          )}
        >
          <button
            aria-label="Open navigation"
            onClick={() => {
              if (isAdminShell && window.matchMedia("(min-width: 1024px)").matches) {
                setSidebarCollapsed((collapsed) => !collapsed);
              } else {
                setMobileNavOpen(true);
              }
            }}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-lg hover:bg-[#f3f5fb]",
              isAdminShell ? "text-[#24304f]" : "text-slate-700 lg:hidden dark:text-slate-200"
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className={cn("truncate text-h3", isAdminShell ? "text-[#101936]" : "text-slate-900 dark:text-white")}>{title}</h1>
            {subtitle && <p className={cn("truncate text-sm", isAdminShell ? "text-[#637091]" : "text-slate-500 dark:text-slate-400")}>{subtitle}</p>}
          </div>
          {actions}
          {isAdminShell && (
            <>
              <div className="relative ml-auto w-full max-w-[420px] md:w-[360px] lg:w-[420px]">
                <div className="flex h-11 items-center gap-3 rounded-lg border border-[#e3e7f2] bg-[#f9faff] px-3 sm:px-4">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5 shrink-0 text-[#4b587d]">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
                  </svg>
                  <input
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value);
                      setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && searchItems[0]) goTo(searchItems[0].href);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-sm text-[#24304f] outline-none placeholder:text-[#7180a6]"
                    placeholder="Search anything..."
                  />
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    className="hidden rounded-md border border-[#dfe4ef] bg-white px-2 py-1 text-[11px] font-semibold text-[#7180a6] sm:block"
                  >
                    Ctrl + K
                  </button>
                </div>
                {searchOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] z-30 w-full overflow-hidden rounded-lg border border-[#e2e7f2] bg-white shadow-[0_18px_48px_rgba(27,42,94,0.14)]">
                    <div className="max-h-[320px] overflow-y-auto p-2">
                      {(searchQuery.trim() ? searchItems : searchItems.slice(0, 6)).map((item) => (
                        <button
                          key={item.href}
                          type="button"
                          onClick={() => goTo(item.href)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-[#24304f] hover:bg-[#f4f1ff] hover:text-primary"
                        >
                          {item.icon}
                          {item.label}
                        </button>
                      ))}
                      {searchItems.length === 0 && (
                        <p className="rounded-lg px-3 py-4 text-center text-sm font-semibold text-[#7180a6]">No matching admin tab.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  aria-label="Notifications"
                  onClick={() => {
                    setNotificationsOpen((open) => !open);
                    setProfileOpen(false);
                    setSearchOpen(false);
                  }}
                  className="relative grid h-10 w-10 place-items-center rounded-lg text-[#18213d] hover:bg-[#f3f5fb]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.86 17.08a2.25 2.25 0 0 1-5.72 0M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-[320px] max-w-[86vw] overflow-hidden rounded-lg border border-[#e2e7f2] bg-white shadow-[0_18px_48px_rgba(27,42,94,0.14)]">
                    <div className="flex items-center justify-between border-b border-[#eef1f7] px-4 py-3">
                      <p className="text-sm font-black text-[#111936]">Notifications</p>
                      <button onClick={() => goTo("/admin/settings")} className="text-xs font-black text-primary">Settings</button>
                    </div>
                    <div className="max-h-[320px] overflow-y-auto p-2">
                      {notifications.length > 0 ? (
                        notifications.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openNotification(item)}
                            className="flex w-full gap-3 rounded-lg px-3 py-3 text-left hover:bg-[#f8faff]"
                          >
                            <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", item.read_at ? "bg-[#cfd6e8]" : "bg-red-500")} />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-[#111936]">{item.title}</span>
                              {item.body && <span className="mt-0.5 block line-clamp-2 text-xs font-semibold text-[#7180a6]">{item.body}</span>}
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="rounded-lg px-3 py-6 text-center text-sm font-semibold text-[#7180a6]">No notifications yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => {
                    setProfileOpen((open) => !open);
                    setNotificationsOpen(false);
                    setSearchOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-[#f3f5fb] sm:gap-3 sm:px-2"
                >
                  <Avatar name={displayName(profile)} src={profile?.avatar_url ?? undefined} size="lg" />
                  <div className="hidden min-w-0 lg:block">
                    <p className="truncate text-sm font-bold text-[#101936]">{profile?.full_name || displayName(profile)}</p>
                    <p className="truncate text-xs capitalize text-[#637091]">{profile?.role?.replace("_", " ") || "Admin"}</p>
                  </div>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="hidden h-4 w-4 text-[#637091] sm:block">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {profileOpen && (
                  <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-[260px] overflow-hidden rounded-lg border border-[#e2e7f2] bg-white shadow-[0_18px_48px_rgba(27,42,94,0.14)]">
                    <div className="border-b border-[#eef1f7] px-4 py-4">
                      <p className="truncate text-sm font-black text-[#111936]">{profile?.full_name || displayName(profile)}</p>
                      <p className="truncate text-xs font-semibold text-[#7180a6]">{profile?.email}</p>
                    </div>
                    <div className="p-2">
                      <button onClick={() => goTo("/admin/settings")} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#24304f] hover:bg-[#f4f1ff]">Admin settings</button>
                      <button onClick={() => goTo("/profile")} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#24304f] hover:bg-[#f4f1ff]">Profile</button>
                      <button onClick={() => goTo("/account")} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#24304f] hover:bg-[#f4f1ff]">Account</button>
                    </div>
                    <div className="border-t border-[#eef1f7] p-2">
                      <button
                        onClick={signOut}
                        className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-red-600 hover:bg-red-50"
                      >
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </header>

        <main className={cn("flex-1 overflow-y-auto", isAdminShell ? "p-6" : "p-6")}>{children}</main>
      </div>
    </div>
  );
}
