"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Notification = { id: string; task_id: string | null; title: string; body: string | null; created_at: string; read_at: string | null };

export function NotificationPanel() {
  const [items, setItems] = useState<Notification[]>([]);
  useEffect(() => { async function load() { const { data } = await supabase.from("notifications").select("id, task_id, title, body, created_at, read_at").is("read_at", null).order("created_at", { ascending: false }).limit(5); setItems(data ?? []); } load(); }, []);
  if (items.length === 0) return null;
  return <section className="mt-10"><h2 className="text-xl font-semibold">Notifications</h2><div className="mt-4 space-y-3">{items.map((item) => <Link key={item.id} href={item.task_id ? `/tasks/${item.task_id}` : "/dashboard"} className="block rounded-2xl border border-orange-400/20 bg-orange-400/5 p-4"><p className="font-semibold text-orange-100">{item.title}</p>{item.body && <p className="mt-1 text-sm text-slate-300">{item.body}</p>}<p className="mt-2 text-xs text-slate-500">{new Date(item.created_at).toLocaleString("en-IN")}</p></Link>)}</div></section>;
}
