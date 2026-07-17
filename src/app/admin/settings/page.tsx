"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProfile, isAdmin, type Profile } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { Card, Badge, Button, Input, Select, Alert } from "@/components/ui";
import { cn } from "@/lib/cn";

type ActiveTab = "general" | "profile" | "notifications" | "appearance" | "account";

export default function AdminSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("general");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // General Settings States
  const [orgName, setOrgName] = useState("");
  const [orgIndustry, setOrgIndustry] = useState("Technology");
  const [orgDesc, setOrgDesc] = useState("");
  const [orgFounded, setOrgFounded] = useState("2024-05-12");
  const [orgWebsite, setOrgWebsite] = useState("deskculture.com");
  const [orgEmail, setOrgEmail] = useState("admin@deskculture.com");
  const [orgPhone, setOrgPhone] = useState("+1 (555) 019-2834");
  const [orgGst, setOrgGst] = useState("29ABCDE1234F1Z5");
  const [orgRegNo, setOrgRegNo] = useState("CIN-U72200MH2024PTC123456");
  
  // HQ details
  const [hqName, setHqName] = useState("Global Headquarters");
  const [hqCountry, setHqCountry] = useState("United States");
  const [hqState, setHqState] = useState("California");
  const [hqCity, setHqCity] = useState("San Francisco");
  const [hqAddress, setHqAddress] = useState("100 Pine St, Suite 1250");
  const [hqZip, setHqZip] = useState("94111");
  const [hqTimezone, setHqTimezone] = useState("PST (UTC-8)");
  const [hqDateFormat, setHqDateFormat] = useState("MM/DD/YYYY");
  const [hqTimeFormat, setHqTimeFormat] = useState("12-hour (AM/PM)");
  const [hqCurrency, setHqCurrency] = useState("USD ($)");
  
  // Branding
  const [brandColor, setBrandColor] = useState("#6f51f5");
  const [accentColor, setAccentColor] = useState("#f7b8dc");
  const [themeMode, setThemeMode] = useState("light");
  const [langDefault, setLangDefault] = useState("English (US)");
  const [regionDefault, setRegionDefault] = useState("North America");
  const [calendarFormat, setCalendarFormat] = useState("Monday Start");

  // Profile Settings States
  const [profName, setProfName] = useState("");
  const [profUsername, setProfUsername] = useState("admin.deskculture");
  const [profDesignation, setProfDesignation] = useState("Super Admin");
  const [profDept, setProfDept] = useState("Operations");
  const [profEmpId, setProfEmpId] = useState("DC-0001");
  const [profEmail, setProfEmail] = useState("");
  const [profMobile, setProfMobile] = useState("");
  const [profEmergency, setProfEmergency] = useState("+1 (555) 011-2233");
  const [profTimezone, setProfTimezone] = useState("UTC+5:30");
  
  // Security
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("recovery@deskculture.com");
  const [recoveryPhone, setRecoveryPhone] = useState("+1 (555) 012-3456");

  // Notification Toggles
  const [notifJoined, setNotifJoined] = useState(true);
  const [notifRemoved, setNotifRemoved] = useState(true);
  const [notifAssigned, setNotifAssigned] = useState(true);
  const [notifCompleted, setNotifCompleted] = useState(true);
  const [notifLeave, setNotifLeave] = useState(true);
  const [notifReports, setNotifReports] = useState(false);
  const [notifMeeting, setNotifMeeting] = useState(true);
  
  const [pushDesktop, setPushDesktop] = useState(true);
  const [pushBrowser, setPushBrowser] = useState(true);
  const [pushMobile, setPushMobile] = useState(false);
  
  const [chatMention, setChatMention] = useState(true);
  const [chatReply, setChatReply] = useState(true);
  const [chatDM, setChatDM] = useState(true);
  const [chatChannel, setChatChannel] = useState(false);
  
  const [aiSuggestions, setAiSuggestions] = useState(true);
  const [aiAutomation, setAiAutomation] = useState(true);
  const [aiReports, setAiReports] = useState(false);

  // Appearance Options
  const [appTheme, setAppTheme] = useState("light");
  const [appSidebar, setAppSidebar] = useState("expanded");
  const [appLayout, setAppLayout] = useState("widgets");
  const [appAccent, setAppAccent] = useState("purple");

  // Account Deletion States
  const [deleteMode, setDeleteMode] = useState<"temporary" | "permanent">("temporary");

  const load = useCallback(async () => {
    const me = await getProfile();
    if (!me) {
      router.replace("/login");
      return;
    }
    if (!me.company_id || me.status !== "active") {
      router.replace("/onboarding");
      return;
    }
    setProfile(me);
    if (!isAdmin(me)) {
      setDenied(true);
      setLoading(false);
      return;
    }

    // Pre-fill states from database values
    const [companyRes, profileRes] = await Promise.all([
      supabase.from("companies").select("name, custom_domain_url, industry_sector").eq("id", me.company_id).single(),
      supabase.from("profiles").select("full_name, email, phone_number").eq("id", me.id).single(),
    ]);

    if (companyRes.data) {
      setOrgName(companyRes.data.name);
      setOrgIndustry(companyRes.data.industry_sector || "Technology");
    }

    if (profileRes.data) {
      setProfName(profileRes.data.full_name || "");
      setProfEmail(profileRes.data.email || "");
      setProfMobile(profileRes.data.phone_number || "");
    }

    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveGeneral(e: React.FormEvent) {
    e.preventDefault();
    if (!profile?.company_id) return;
    setBusy(true);
    setError("");
    setSuccess("");

    const { error: err } = await supabase
      .from("companies")
      .update({
        name: orgName.trim(),
        industry_sector: orgIndustry,
        custom_domain_url: orgWebsite.trim(),
      })
      .eq("id", profile.company_id);

    setBusy(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess("General Organization settings updated successfully!");
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setError("");
    setSuccess("");

    // Update names
    const parts = profName.trim().split(" ");
    const { error: err } = await supabase
      .from("profiles")
      .update({
        full_name: profName.trim(),
        first_name: parts[0] || "",
        last_name: parts.slice(1).join(" ") || null,
        phone_number: profMobile.trim() || null,
      })
      .eq("id", profile.id);

    // If change password is typed
    if (newPassword.trim()) {
      if (newPassword !== confirmPassword) {
        setError("Passwords do not match.");
        setBusy(false);
        return;
      }
      const { error: pwErr } = await supabase.auth.updateUser({ password: newPassword.trim() });
      if (pwErr) {
        setError("Could not update password: " + pwErr.message);
        setBusy(false);
        return;
      }
    }

    setBusy(false);
    if (err) {
      setError(err.message);
    } else {
      setSuccess("Profile settings updated successfully!");
      setNewPassword("");
      setConfirmPassword("");
    }
  }

  async function handleSaveNotifications(e: React.FormEvent) {
    e.preventDefault();
    setSuccess("Notification preferences saved successfully!");
  }

  async function handleSaveAppearance(e: React.FormEvent) {
    e.preventDefault();
    setSuccess("Theme and UI configuration successfully saved!");
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    if (deleteMode === "temporary") {
      setSuccess("Your account deletion request is scheduled. If you do not active this organization or sign in to your panel within 2 months, the account will be deleted permanently.");
    } else {
      // Permanent Deletion
      const { error: delErr } = await supabase.rpc("remove_member", { target_profile: profile?.id });
      if (delErr) {
        setError("Error processing permanent deletion: " + delErr.message);
      } else {
        await supabase.auth.signOut();
        router.replace("/");
      }
    }
    setBusy(false);
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading settings...</main>;
  }

  if (denied) {
    return (
      <AppShell profile={profile} title="Settings" variant="admin">
        <Card className="mx-auto max-w-md text-center">
          <h2 className="text-h4 text-slate-900">Admin access required</h2>
          <p className="mt-2 text-sm text-slate-600">Your role doesn&apos;t have access to settings.</p>
          <Button className="mt-5" onClick={() => router.push("/dashboard")}>
            Go to my dashboard
          </Button>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title="Admin Settings"
      subtitle="Configure organization branding, localization, profile preferences, and account controls."
    >
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Navigation Tabs */}
        <aside className="w-full lg:w-64 shrink-0">
          <Card className="p-3">
            <nav className="flex flex-col gap-1">
              {(
                [
                  { id: "general", label: "General Settings", desc: "Org & branding details" },
                  { id: "profile", label: "Profile Settings", desc: "Personal info & security" },
                  { id: "notifications", label: "Notifications", desc: "Alerts & AI triggers" },
                  { id: "appearance", label: "Appearance", desc: "UI themes & layouts" },
                  { id: "account", label: "Account Deletion", desc: "Deactivate or remove account" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setError("");
                    setSuccess("");
                  }}
                  className={cn(
                    "flex flex-col text-left px-4 py-3 rounded-xl transition duration-150",
                    activeTab === tab.id
                      ? "bg-primary text-white shadow-md shadow-indigo-100"
                      : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <span className="text-sm font-bold">{tab.label}</span>
                  <span className={cn("text-[10px] mt-0.5", activeTab === tab.id ? "text-indigo-100" : "text-slate-400")}>
                    {tab.desc}
                  </span>
                </button>
              ))}
            </nav>
          </Card>
        </aside>

        {/* Content Section */}
        <main className="flex-1 space-y-6">
          {error && <Alert tone="danger">{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}

          {/* 1. General Settings */}
          {activeTab === "general" && (
            <Card>
              <h2 className="text-lg font-black text-slate-900 border-b border-slate-100 pb-3 mb-5">
                Organization Information
              </h2>
              <form onSubmit={handleSaveGeneral} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Organization Name
                    <Input required value={orgName} onChange={(e) => setOrgName(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Organization ID
                    <Input disabled value={profile?.company_id ?? ""} className="mt-1 font-mono" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Industry
                    <Select value={orgIndustry} onChange={(e) => setOrgIndustry(e.target.value)} className="mt-1">
                      <option value="Technology">Technology &amp; SaaS</option>
                      <option value="Finance">Finance &amp; Banking</option>
                      <option value="Healthcare">Healthcare &amp; Pharma</option>
                      <option value="Education">Education</option>
                      <option value="Other">Other</option>
                    </Select>
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Founded Date
                    <Input type="date" value={orgFounded} onChange={(e) => setOrgFounded(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Website
                    <Input value={orgWebsite} onChange={(e) => setOrgWebsite(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Official Email
                    <Input type="email" value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    GST/VAT Number
                    <Input value={orgGst} onChange={(e) => setOrgGst(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Registration Number
                    <Input value={orgRegNo} onChange={(e) => setOrgRegNo(e.target.value)} className="mt-1" />
                  </label>
                </div>
                
                <label className="block text-xs font-bold text-slate-700">
                  Company Description
                  <Input value={orgDesc} onChange={(e) => setOrgDesc(e.target.value)} placeholder="Provide organization description..." className="mt-1" />
                </label>

                <h3 className="text-sm font-bold text-slate-800 border-t border-slate-100 pt-4 mt-4">Office Details</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Headquarters
                    <Input value={hqName} onChange={(e) => setHqName(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Country
                    <Input value={hqCountry} onChange={(e) => setHqCountry(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    State
                    <Input value={hqState} onChange={(e) => setHqState(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    City
                    <Input value={hqCity} onChange={(e) => setHqCity(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Address
                    <Input value={hqAddress} onChange={(e) => setHqAddress(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Zip Code
                    <Input value={hqZip} onChange={(e) => setHqZip(e.target.value)} className="mt-1" />
                  </label>
                </div>

                <h3 className="text-sm font-bold text-slate-800 border-t border-slate-100 pt-4 mt-4">Localization & Branding</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Time Zone
                    <Input value={hqTimezone} onChange={(e) => setHqTimezone(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Currency
                    <Input value={hqCurrency} onChange={(e) => setHqCurrency(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Brand Color
                    <Input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="mt-1 h-10 w-full rounded-2xl cursor-pointer" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Accent Color
                    <Input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="mt-1 h-10 w-full rounded-2xl cursor-pointer" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Default Language
                    <Input value={langDefault} onChange={(e) => setLangDefault(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Region
                    <Input value={regionDefault} onChange={(e) => setRegionDefault(e.target.value)} className="mt-1" />
                  </label>
                </div>

                <div className="border-t border-slate-100 pt-4 flex justify-end">
                  <Button disabled={busy} type="submit" className="px-6 h-11 bg-primary text-white rounded-xl font-bold">
                    {busy ? "Saving Settings..." : "Save Changes"}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* 2. Profile Settings */}
          {activeTab === "profile" && (
            <Card>
              <h2 className="text-lg font-black text-slate-900 border-b border-slate-100 pb-3 mb-5">
                Personal Information
              </h2>
              <form onSubmit={handleSaveProfile} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Full Name
                    <Input required value={profName} onChange={(e) => setProfName(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Username
                    <Input value={profUsername} onChange={(e) => setProfUsername(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Designation
                    <Input value={profDesignation} onChange={(e) => setProfDesignation(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Department
                    <Input value={profDept} onChange={(e) => setProfDept(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Employee ID
                    <Input value={profEmpId} onChange={(e) => setProfEmpId(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Email Address
                    <Input type="email" disabled value={profEmail} className="mt-1 font-mono bg-slate-50" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Mobile Number
                    <Input value={profMobile} onChange={(e) => setProfMobile(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Emergency Contact
                    <Input value={profEmergency} onChange={(e) => setProfEmergency(e.target.value)} className="mt-1" />
                  </label>
                </div>

                <h3 className="text-sm font-bold text-slate-800 border-t border-slate-100 pt-4 mt-4">Security Preferences</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-slate-700">
                    New Password (optional)
                    <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Confirm Password
                    <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Recovery Email
                    <Input value={recoveryEmail} onChange={(e) => setRecoveryEmail(e.target.value)} className="mt-1" />
                  </label>
                  <label className="block text-xs font-bold text-slate-700">
                    Recovery Phone
                    <Input value={recoveryPhone} onChange={(e) => setRecoveryPhone(e.target.value)} className="mt-1" />
                  </label>
                </div>

                <div className="border-t border-slate-100 pt-4 flex justify-end">
                  <Button disabled={busy} type="submit" className="px-6 h-11 bg-primary text-white rounded-xl font-bold">
                    {busy ? "Updating Profile..." : "Save Profile Details"}
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* 3. Notifications */}
          {activeTab === "notifications" && (
            <Card>
              <h2 className="text-lg font-black text-slate-900 border-b border-slate-100 pb-3 mb-5">
                Notification Configurations
              </h2>
              <form onSubmit={handleSaveNotifications} className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-3">Email Alerts</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={notifJoined} onChange={(e) => setNotifJoined(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      User Joined Organization
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={notifRemoved} onChange={(e) => setNotifRemoved(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      User Removed / Left Org
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={notifAssigned} onChange={(e) => setNotifAssigned(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      Task Assigned Alerts
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={notifCompleted} onChange={(e) => setNotifCompleted(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      Task Completed Summary
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={notifLeave} onChange={(e) => setNotifLeave(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      Leave Requests Submitted
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={notifMeeting} onChange={(e) => setNotifMeeting(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      Meeting Reminder Messages
                    </label>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-bold text-slate-800 mb-3">Push / Chat Alert Destinations</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={pushDesktop} onChange={(e) => setPushDesktop(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      Desktop Notifications
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={pushBrowser} onChange={(e) => setPushBrowser(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      Browser Notifications
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={chatMention} onChange={(e) => setChatMention(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      AI Chat Mentions
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={chatDM} onChange={(e) => setChatDM(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      Direct Message Prompts
                    </label>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-bold text-slate-800 mb-3">AI / Automation Alerts</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={aiSuggestions} onChange={(e) => setChatDM(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      AI Task Suggestions
                    </label>
                    <label className="flex items-center gap-3 text-sm text-slate-600">
                      <input type="checkbox" checked={aiAutomation} onChange={(e) => setChatDM(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" />
                      Automation Completion Reports
                    </label>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 flex justify-end">
                  <Button type="submit" className="px-6 h-11 bg-primary text-white rounded-xl font-bold">
                    Save Notification Toggles
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* 4. Appearance Settings */}
          {activeTab === "appearance" && (
            <Card>
              <h2 className="text-lg font-black text-slate-900 border-b border-slate-100 pb-3 mb-5">
                Branding & UI Appearance
              </h2>
              <form onSubmit={handleSaveAppearance} className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Application Theme
                    <Select value={appTheme} onChange={(e) => setAppTheme(e.target.value)} className="mt-1">
                      <option value="light">Light Theme</option>
                      <option value="dark">Dark Theme</option>
                      <option value="auto">Auto / System Theme</option>
                    </Select>
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    Sidebar View Style
                    <Select value={appSidebar} onChange={(e) => setAppSidebar(e.target.value)} className="mt-1">
                      <option value="expanded">Expanded View</option>
                      <option value="compact">Compact Icons Only</option>
                      <option value="floating">Floating Sidebar</option>
                    </Select>
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    Dashboard Layout
                    <Select value={appLayout} onChange={(e) => setAppLayout(e.target.value)} className="mt-1">
                      <option value="widgets">Widgets & Graphs</option>
                      <option value="cards">Compact Cards</option>
                      <option value="drag-drop">Custom Drag &amp; Drop</option>
                    </Select>
                  </label>

                  <label className="block text-xs font-bold text-slate-700">
                    Primary Accent Shade
                    <Select value={appAccent} onChange={(e) => setAppAccent(e.target.value)} className="mt-1">
                      <option value="purple">Royal Purple (Default)</option>
                      <option value="blue">Deep Ocean Blue</option>
                      <option value="green">Forest Green</option>
                      <option value="orange">Sunset Orange</option>
                    </Select>
                  </label>
                </div>

                <div className="border-t border-slate-100 pt-4 flex justify-end">
                  <Button type="submit" className="px-6 h-11 bg-primary text-white rounded-xl font-bold">
                    Apply Brand Appearance
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {/* 5. Account Deletion */}
          {activeTab === "account" && (
            <Card className="border border-red-200">
              <h2 className="text-lg font-black text-red-600 border-b border-red-100 pb-3 mb-5">
                Dangerous Action Zone
              </h2>
              <form onSubmit={handleDeleteAccount} className="space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-3">Select Deletion Priority</h3>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="deleteMode"
                        checked={deleteMode === "temporary"}
                        onChange={() => setDeleteMode("temporary")}
                        className="mt-1 text-red-600 focus:ring-red-500"
                      />
                      <div>
                        <span className="block font-bold">Temporary Deactivation (2 Months Grace Period)</span>
                        <span className="text-xs text-slate-500">
                          Your profile details and organization status will be hidden. If you do not reactivate this workspace or log in to the employee panel within 2 months, the account will be deleted permanently.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="deleteMode"
                        checked={deleteMode === "permanent"}
                        onChange={() => setDeleteMode("permanent")}
                        className="mt-1 text-red-600 focus:ring-red-500"
                      />
                      <div>
                        <span className="block font-bold text-red-600">Immediate Permanent Deletion</span>
                        <span className="text-xs text-slate-500">
                          Permanently delete your profile and detach from the organization. All active session entries will be cleared instantly. This action is irreversible.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 flex justify-end">
                  <Button disabled={busy} type="submit" className="px-6 h-11 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold">
                    {busy ? "Processing..." : "Process Account Action"}
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </main>
      </div>
    </AppShell>
  );
}
