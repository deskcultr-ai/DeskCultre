"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Alert, Avatar, Badge, Button, Card, Input, Tabs } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { displayName, getProfile, type Profile } from "@/lib/session";
import { cn } from "@/lib/cn";

type Department = {
  id: string;
  name: string;
  description: string | null;
  bio: string | null;
  channelId: string;
  memberCount: number;
};
type Person = {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  departmentName: string | null;
};
type Message = {
  id: string;
  body: string | null;
  createdAt: string;
  senderId: string | null;
  senderName: string;
  senderAvatarUrl: string | null;
};
type Channel = {
  id: string;
  name: string;
  channelType: "department" | "direct" | "general";
  departmentId: string | null;
  departmentName: string | null;
  isDirect: boolean;
  messages: Message[];
};
type ChatData = {
  departments: Department[];
  people: Person[];
  channels: Channel[];
};

const emptyData: ChatData = { departments: [], people: [], channels: [] };

export default function EmployeeChatsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<ChatData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("departments");
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (preferredChannel?: string) => {
    const me = await getProfile();
    if (!me) {
      router.replace("/login");
      return;
    }
    setProfile(me);
    if (!me.company_id || me.status !== "active") {
      router.replace("/onboarding");
      return;
    }
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_employee_chat_data");
    if (rpcError) {
      setError(rpcError.message);
      setData(emptyData);
    } else {
      const next = { ...emptyData, ...(rpcData as ChatData) };
      setData(next);
      setSelectedChannelId((current) => preferredChannel || current || next.channels[0]?.id || "");
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const departmentChannels = useMemo(() => data.channels.filter((channel) => channel.channelType === "department"), [data.channels]);
  const directChannels = useMemo(() => data.channels.filter((channel) => channel.channelType === "direct"), [data.channels]);
  const selectedChannel = useMemo(() => data.channels.find((channel) => channel.id === selectedChannelId) ?? null, [data.channels, selectedChannelId]);
  const selectedDepartment = useMemo(
    () => data.departments.find((department) => department.channelId === selectedChannelId || department.id === selectedChannel?.departmentId) ?? null,
    [data.departments, selectedChannel, selectedChannelId]
  );

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedChannelId || !message.trim()) return;
    setBusy(true);
    setError("");
    const { error: sendError } = await supabase.rpc("send_employee_chat_message", {
      target_channel: selectedChannelId,
      message_body: message.trim(),
    });
    setBusy(false);
    if (sendError) {
      setError(sendError.message);
      return;
    }
    setMessage("");
    await load(selectedChannelId);
  }

  async function startDirect(person: Person) {
    setBusy(true);
    setError("");
    const { data: channelId, error: startError } = await supabase.rpc("start_employee_direct_chat", {
      target_profile: person.id,
    });
    setBusy(false);
    if (startError) {
      setError(startError.message);
      return;
    }
    setTab("direct");
    await load(channelId as string);
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading chats...</main>;
  }

  return (
    <AppShell profile={profile} title="Chats" subtitle="Message departments or start direct conversations with team members.">
      <div className="space-y-5">
        {error && <Alert tone="danger" onClose={() => setError("")}>{error}</Alert>}

        <section className="grid min-h-[calc(100vh-190px)] gap-5 xl:grid-cols-[360px_1fr]">
          <Card className="rounded-xl border-[#dfe6f3] p-4">
            <Tabs
              value={tab}
              onValueChange={setTab}
              tabs={[
                { id: "departments", label: "Departments" },
                { id: "direct", label: "Personal" },
              ]}
              className="mb-4"
            />

            {tab === "departments" ? (
              <div className="space-y-3">
                {data.departments.map((department) => (
                  <button
                    key={department.id}
                    onClick={() => setSelectedChannelId(department.channelId)}
                    className={cn(
                      "w-full rounded-lg border p-4 text-left transition hover:border-[#bdb5ff] hover:bg-[#fbfcff]",
                      selectedChannelId === department.channelId ? "border-[#7c66ff] bg-[#f8f7ff]" : "border-[#edf0f7] bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-black text-[#071035]">{department.name}</p>
                      <Badge tone="info">{department.memberCount}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-[#526184]">
                      {department.bio || department.description || "Department discussion channel."}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#7b88a8]">Direct chats</p>
                  <div className="space-y-2">
                    {directChannels.length === 0 && <p className="rounded-lg border border-dashed border-[#dfe6f3] p-4 text-sm font-bold text-[#526184]">No direct chats yet.</p>}
                    {directChannels.map((channel) => (
                      <button
                        key={channel.id}
                        onClick={() => setSelectedChannelId(channel.id)}
                        className={cn(
                          "w-full rounded-lg border px-3 py-2 text-left text-sm font-black",
                          selectedChannelId === channel.id ? "border-[#7c66ff] bg-[#f8f7ff] text-[#4f46e5]" : "border-[#edf0f7] bg-white text-[#071035]"
                        )}
                      >
                        {channel.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-wide text-[#7b88a8]">Start personal message</p>
                  <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    {data.people.map((person) => (
                      <button
                        key={person.id}
                        onClick={() => startDirect(person)}
                        disabled={busy}
                        className="flex w-full items-center gap-3 rounded-lg border border-[#edf0f7] bg-white p-3 text-left hover:border-[#bdb5ff]"
                      >
                        <Avatar name={person.name} src={person.avatarUrl ?? undefined} size="md" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-[#071035]">{person.name}</span>
                          <span className="block truncate text-xs font-semibold text-[#526184]">{person.departmentName ?? "No department"}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>

          <Card className="flex min-h-[620px] flex-col rounded-xl border-[#dfe6f3] p-0">
            <div className="border-b border-[#edf0f7] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-[#071035]">{selectedChannel?.name ?? "Select a chat"}</h2>
                  <p className="mt-1 text-sm font-semibold text-[#526184]">
                    {selectedDepartment ? selectedDepartment.bio || selectedDepartment.description || "Department messages" : "Personal conversation"}
                  </p>
                </div>
                {selectedDepartment && <Badge tone="info">{selectedDepartment.memberCount} members</Badge>}
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto bg-[#fbfcff] p-5">
              {!selectedChannel && <p className="rounded-lg border border-dashed border-[#dfe6f3] p-5 text-center text-sm font-bold text-[#526184]">Choose a department or direct chat.</p>}
              {selectedChannel?.messages.length === 0 && <p className="rounded-lg border border-dashed border-[#dfe6f3] p-5 text-center text-sm font-bold text-[#526184]">No messages yet. Start the conversation.</p>}
              {selectedChannel?.messages.map((item) => {
                const mine = item.senderId === profile?.id;
                return (
                  <div key={item.id} className={cn("flex gap-3", mine && "justify-end")}>
                    {!mine && <Avatar name={item.senderName} src={item.senderAvatarUrl ?? undefined} size="sm" />}
                    <div className={cn("max-w-[78%] rounded-2xl px-4 py-3", mine ? "bg-[#5b36f2] text-white" : "border border-[#edf0f7] bg-white text-[#071035]")}>
                      {!mine && <p className="mb-1 text-xs font-black text-[#4f46e5]">{item.senderName}</p>}
                      <p className="text-sm font-semibold leading-6">{item.body}</p>
                      <p className={cn("mt-1 text-[11px] font-bold", mine ? "text-white/70" : "text-[#7b88a8]")}>
                        {new Date(item.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <form onSubmit={sendMessage} className="flex gap-3 border-t border-[#edf0f7] p-4">
              <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Type a message..." className="h-11" disabled={!selectedChannelId || busy} />
              <Button disabled={!selectedChannelId || !message.trim() || busy}>{busy ? "Sending..." : "Send"}</Button>
            </form>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
