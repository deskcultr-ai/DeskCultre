"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Profile = { id: string; company_id: string; role: string | null; can_manage_organization: boolean };
type Company = { id: string; name: string; slug: string | null };
type Item = { id: string; name: string };
type Team = Item & { department_id: string | null; description: string | null };

const inputClass = "mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400";
export default function OrganizationSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [brands, setBrands] = useState<Item[]>([]);
  const [channels, setChannels] = useState<Item[]>([]);
  const [departments, setDepartments] = useState<Item[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tags, setTags] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [companySlug, setCompanySlug] = useState("");
  const [brandName, setBrandName] = useState("");
  const [channelName, setChannelName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamDepartment, setTeamDepartment] = useState("");
  const [tagName, setTagName] = useState("");

  async function loadData() {
    const { data: authData } = await supabase.auth.getUser();
    const currentUser = authData.user;
    setUser(currentUser);
    if (!currentUser) { setLoading(false); return; }
    const { data: profileData } = await supabase.from("profiles").select("id, company_id, role, can_manage_organization").eq("id", currentUser.id).single();
    if (!profileData) { setLoading(false); return; }
    setProfile(profileData);
    const [companyResult, brandsResult, channelsResult, departmentsResult, teamsResult, tagsResult] = await Promise.all([
      supabase.from("companies").select("id, name, slug").eq("id", profileData.company_id).single(),
      supabase.from("brands").select("id, name").order("name"),
      supabase.from("channels").select("id, name").eq("company_id", profileData.company_id).eq("is_active", true).order("name"),
      supabase.from("departments").select("id, name").eq("company_id", profileData.company_id).order("name"),
      supabase.from("teams").select("id, name, department_id, description").eq("company_id", profileData.company_id).eq("is_active", true).order("name"),
      supabase.from("task_tags").select("id, name").eq("company_id", profileData.company_id).order("name"),
    ]);
    setCompany(companyResult.data);
    setCompanyName(companyResult.data?.name ?? "");
    setCompanySlug(companyResult.data?.slug ?? "");
    setBrands(brandsResult.data ?? []); setChannels(channelsResult.data ?? []); setDepartments(departmentsResult.data ?? []); setTeams(teamsResult.data ?? []); setTags(tagsResult.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // Browser-authenticated data loading is async; the updates occur after the auth lookup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  async function saveCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const { error: rpcError } = await supabase.rpc("update_company_settings", { company_name: companyName, company_slug: companySlug || null });
    setSaving(false); if (rpcError) setError(rpcError.message); else await loadData();
  }

  async function addBrand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const { error: rpcError } = await supabase.rpc("create_or_link_brand", { brand_name: brandName, brand_slug: null });
    setSaving(false); if (rpcError) setError(rpcError.message); else { setBrandName(""); await loadData(); }
  }

  async function addTenantItem(table: "channels" | "teams" | "task_tags", values: Record<string, string | null>, reset: () => void) {
    if (!profile) return; setSaving(true); setError("");
    const { error: insertError } = await supabase.from(table).insert({ company_id: profile.company_id, ...values });
    setSaving(false); if (insertError) setError(insertError.message); else { reset(); await loadData(); }
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">Loading organization settings...</main>;
  const canManage = profile && (["admin", "owner"].includes(profile.role ?? "") || profile.can_manage_organization);
  if (!user || !profile || !company) return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white"><section className="rounded-3xl border border-white/10 bg-white/10 p-8 text-center"><h1 className="text-2xl font-bold">Organization setup unavailable</h1><Link href="/dashboard" className="mt-6 inline-block text-cyan-300">Back to Dashboard</Link></section></main>;
  if (!canManage) return <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white"><section className="max-w-md rounded-3xl border border-white/10 bg-white/10 p-8 text-center"><h1 className="text-2xl font-bold">Organization permission required</h1><p className="mt-3 text-slate-300">Only admins and authorized managers can change organization settings.</p><Link href="/dashboard" className="mt-6 inline-block text-cyan-300">Back to Dashboard</Link></section></main>;

  return <main className="min-h-screen bg-slate-950 px-6 py-8 text-white"><section className="mx-auto max-w-5xl"><header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6"><div><p className="text-sm font-semibold text-cyan-300">FlowDesk</p><h1 className="mt-1 text-3xl font-bold">Organization Settings</h1><p className="mt-2 text-slate-400">Manage the workspace structure used to classify tasks.</p></div><Link href="/dashboard" className="rounded-xl border border-white/20 px-5 py-2 text-sm font-semibold">Dashboard</Link></header>
    {error && <p className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold">Company</h2><form onSubmit={saveCompany} className="mt-4 space-y-4"><label className="block text-sm text-slate-300">Name<input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className={inputClass} /></label><label className="block text-sm text-slate-300">Slug<input value={companySlug} onChange={(e) => setCompanySlug(e.target.value)} placeholder="belle-lingeries" className={inputClass} /></label><button disabled={saving} className="rounded-xl bg-cyan-400 px-5 py-2 font-semibold text-slate-950 disabled:opacity-60">Save Company</button></form></section>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold">Brands</h2><p className="mt-1 text-sm text-slate-400">Brands can be linked to more than one company.</p><form onSubmit={addBrand} className="mt-4 flex gap-3"><input value={brandName} onChange={(e) => setBrandName(e.target.value)} required placeholder="Add or link a brand" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"/><button disabled={saving} className="rounded-xl border border-white/20 px-4 text-sm font-semibold disabled:opacity-60">Add</button></form><ItemList items={brands} empty="No brands linked yet." /></section>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold">Sales Channels</h2><form onSubmit={(e) => { e.preventDefault(); void addTenantItem("channels", { name: channelName, slug: null }, () => setChannelName("")); }} className="mt-4 flex gap-3"><input value={channelName} onChange={(e) => setChannelName(e.target.value)} required placeholder="Shopify, Amazon…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"/><button disabled={saving} className="rounded-xl border border-white/20 px-4 text-sm font-semibold">Add</button></form><ItemList items={channels} empty="No sales channels yet." /></section>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6"><h2 className="text-xl font-semibold">Task Tags</h2><form onSubmit={(e) => { e.preventDefault(); void addTenantItem("task_tags", { name: tagName, color: "#06b6d4" }, () => setTagName("")); }} className="mt-4 flex gap-3"><input value={tagName} onChange={(e) => setTagName(e.target.value)} required placeholder="Campaign, Finance…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"/><button disabled={saving} className="rounded-xl border border-white/20 px-4 text-sm font-semibold">Add</button></form><ItemList items={tags} empty="No tags yet." /></section>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 lg:col-span-2"><h2 className="text-xl font-semibold">Teams</h2><form onSubmit={(e) => { e.preventDefault(); void addTenantItem("teams", { name: teamName, department_id: teamDepartment || null, description: null }, () => { setTeamName(""); setTeamDepartment(""); }); }} className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px_auto]"><input value={teamName} onChange={(e) => setTeamName(e.target.value)} required placeholder="Team name" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"/><select value={teamDepartment} onChange={(e) => setTeamDepartment(e.target.value)} className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white"><option value="">No department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select><button disabled={saving} className="rounded-xl border border-white/20 px-4 text-sm font-semibold">Add Team</button></form><div className="mt-5 grid gap-3 sm:grid-cols-2">{teams.map((team) => <div key={team.id} className="rounded-xl bg-slate-900 px-4 py-3"><p className="font-medium">{team.name}</p><p className="mt-1 text-xs text-slate-400">{departments.find((department) => department.id === team.department_id)?.name ?? "No department"}</p></div>)}{teams.length === 0 && <p className="text-sm text-slate-400">No teams yet.</p>}</div></section>
    </div></section></main>;
}

function ItemList({ items, empty }: { items: Item[]; empty: string }) {
  if (items.length === 0) return <p className="mt-4 text-sm text-slate-400">{empty}</p>;
  return <div className="mt-4 flex flex-wrap gap-2">{items.map((item) => <span key={item.id} className="rounded-full bg-slate-900 px-3 py-1 text-sm text-slate-300">{item.name}</span>)}</div>;
}
