"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Alert, Badge, Button, Card, Input, Modal, Select } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { getProfile, type Profile } from "@/lib/session";
import { cn } from "@/lib/cn";

type Department = { id: string; name: string };
type RequestItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  fromDepartmentName: string | null;
  toDepartmentName: string | null;
  requesterName: string;
  mine: boolean;
  dueDate: string | null;
  createdAt: string;
};
type RequestsData = { departments: Department[]; requests: RequestItem[] };

const emptyData: RequestsData = { departments: [], requests: [] };

const priorityTone: Record<string, "danger" | "warning" | "success" | "neutral"> = {
  urgent: "danger",
  high: "danger",
  medium: "warning",
  low: "success",
};

const statusTone: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  pending: "warning",
  accepted: "info",
  in_progress: "info",
  completed: "success",
  rejected: "danger",
};

function dateLabel(value: string | null) {
  if (!value) return "No due date";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function EmployeeRequestsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<RequestsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("mine");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ title: "", description: "", targetDepartment: "", priority: "medium", dueDate: "" });

  const load = useCallback(async () => {
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
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_employee_requests_data");
    if (rpcError) {
      setError(rpcError.message);
      setData(emptyData);
    } else {
      setData({ ...emptyData, ...(rpcData as RequestsData) });
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    return data.requests.filter((request) => {
      if (view === "mine") return request.mine;
      if (view === "incoming") return !request.mine;
      return request.status === view;
    });
  }, [data.requests, view]);

  const counts = useMemo(
    () => ({
      mine: data.requests.filter((request) => request.mine).length,
      incoming: data.requests.filter((request) => !request.mine).length,
      pending: data.requests.filter((request) => request.status === "pending").length,
      completed: data.requests.filter((request) => request.status === "completed").length,
    }),
    [data.requests]
  );

  async function createRequest(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: createError } = await supabase.rpc("create_employee_request", {
      request_title: form.title.trim(),
      request_description: form.description.trim() || null,
      target_department: form.targetDepartment || null,
      request_priority: form.priority,
      target_due_date: form.dueDate || null,
    });
    setBusy(false);
    if (createError) {
      setError(createError.message);
      return;
    }
    setNotice("Request created.");
    setForm({ title: "", description: "", targetDepartment: "", priority: "medium", dueDate: "" });
    setOpen(false);
    await load();
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8fafc] text-slate-500">Loading requests...</main>;
  }

  return (
    <AppShell
      profile={profile}
      title="Requests"
      subtitle="Ask another department for help and track request progress."
      actions={<Button onClick={() => setOpen(true)}>+ New Request</Button>}
    >
      <div className="space-y-6">
        {error && <Alert tone="danger" onClose={() => setError("")}>{error}</Alert>}
        {notice && <Alert tone="success" onClose={() => setNotice("")}>{notice}</Alert>}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <RequestStat active={view === "mine"} label="My Requests" value={counts.mine} onClick={() => setView("mine")} />
          <RequestStat active={view === "incoming"} label="Incoming" value={counts.incoming} onClick={() => setView("incoming")} />
          <RequestStat active={view === "pending"} label="Pending" value={counts.pending} onClick={() => setView("pending")} />
          <RequestStat active={view === "completed"} label="Completed" value={counts.completed} onClick={() => setView("completed")} />
        </section>

        <Card className="rounded-xl border-[#dfe6f3] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-black text-[#071035]">Request List</h2>
            <Select value={view} onChange={(event) => setView(event.target.value)} className="h-10 sm:w-48">
              <option value="mine">My requests</option>
              <option value="incoming">Incoming to my department</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </Select>
          </div>
        </Card>

        <section className="space-y-3">
          {filtered.map((request) => (
            <Card key={request.id} className="rounded-xl border-[#dfe6f3] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-[#071035]">{request.title}</h3>
                    <Badge tone={statusTone[request.status] ?? "neutral"} className="capitalize">{request.status.replace("_", " ")}</Badge>
                  </div>
                  {request.description && <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#526184]">{request.description}</p>}
                  <p className="mt-3 text-xs font-bold text-[#526184]">
                    {request.fromDepartmentName ?? "Your department"} to {request.toDepartmentName ?? "Any department"} - {dateLabel(request.dueDate)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={priorityTone[request.priority] ?? "neutral"} className="capitalize">{request.priority}</Badge>
                  <Badge tone={request.mine ? "info" : "warning"}>{request.mine ? "Created by you" : "Incoming"}</Badge>
                </div>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && <Card className="rounded-xl border-dashed border-[#dfe6f3] p-8 text-center text-sm font-bold text-[#526184]">No requests match this view.</Card>}
        </section>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Create Request" className="max-w-xl">
        <form onSubmit={createRequest} className="space-y-4">
          <label className="block text-sm font-black text-[#33415c]">
            Request title
            <Input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Need product images for new listings" className="mt-2" />
          </label>
          <label className="block text-sm font-black text-[#33415c]">
            Description
            <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Add any context or requirements" className="mt-2" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-black text-[#33415c]">
              Department
              <Select value={form.targetDepartment} onChange={(event) => setForm({ ...form, targetDepartment: event.target.value })} className="mt-2">
                <option value="">Any department</option>
                {data.departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </Select>
            </label>
            <label className="block text-sm font-black text-[#33415c]">
              Priority
              <Select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="mt-2">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </Select>
            </label>
          </div>
          <label className="block text-sm font-black text-[#33415c]">
            Due date
            <Input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} className="mt-2" />
          </label>
          <div className="flex justify-end gap-3 pt-3">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !form.title.trim()}>{busy ? "Creating..." : "Create Request"}</Button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}

function RequestStat({ active, label, value, onClick }: { active: boolean; label: string; value: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className={cn("rounded-xl border-[#dfe6f3] p-5 transition hover:-translate-y-0.5 hover:border-[#bdb5ff] hover:shadow-[0_18px_42px_rgba(40,55,105,0.12)]", active && "border-[#7c66ff] ring-2 ring-[#ece8ff]")}>
        <p className="text-[12px] font-black uppercase tracking-wide text-[#526184]">{label}</p>
        <p className="mt-3 text-3xl font-black text-[#071035]">{value}</p>
      </Card>
    </button>
  );
}
