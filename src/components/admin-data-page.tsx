"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Avatar, AvatarGroup, Badge, Button, Card, Input, Select } from "@/components/ui";
import { getProfile, type Profile } from "@/lib/session";
import { cn } from "@/lib/cn";

type Tone = "primary" | "success" | "warning" | "danger" | "info" | "neutral";
type Metric = { label: string; value: string; helper: string; tone: Tone; icon: "users" | "check" | "clock" | "file" | "calendar" | "chart" };
type Column = { key: string; label: string };
type Row = Record<string, string | number | { text: string; tone: Tone } | string[]>;
type AdminDataset = {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  primaryAction: string;
  showing: string;
  metrics: Metric[];
  filters: string[];
  columns: Column[];
  rows: Row[];
  tabs?: string[];
};

const iconPaths = {
  users: "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003A6.375 6.375 0 0 0 8.624 13.5a6.375 6.375 0 0 0-6.374 5.625l-.001.109A12.318 12.318 0 0 0 8.624 21c2.331 0 4.512-.645 6.374-1.766ZM12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Z",
  check: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  clock: "M12 6.75V12l3 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  file: "M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l6 6v10a2 2 0 0 1-2 2ZM13 3v6h6",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25A2.25 2.25 0 0 1 18.75 21H5.25A2.25 2.25 0 0 1 3 18.75ZM3 11.25h18",
  chart: "M3 3v16.5A1.5 1.5 0 0 0 4.5 21H21M7.5 15.75V12M12 15.75V8.25M16.5 15.75v-4.5",
};

const iconTone: Record<Tone, string> = {
  primary: "bg-primary-light text-primary",
  success: "bg-success-light text-success",
  warning: "bg-warning-light text-warning",
  danger: "bg-danger-light text-danger",
  info: "bg-info-light text-info",
  neutral: "bg-slate-100 text-slate-500",
};

const people = ["Neha Verma", "Rohit Singh", "Priya Mehta", "Karan Malhotra", "Ayesha Khan", "Arjun Sharma", "Rahul Verma"];

const datasets: Record<"tasks" | "requests" | "projects" | "meetings", AdminDataset> = {
  tasks: {
    title: "Tasks",
    subtitle: "Create, assign and track tasks across workspaces.",
    searchPlaceholder: "Search tasks...",
    primaryAction: "Create Task",
    showing: "Showing 1 to 7 of 342 tasks",
    metrics: [
      { label: "Total Tasks", value: "342", helper: "+ 18.6% this week", tone: "primary", icon: "users" },
      { label: "Completed", value: "142", helper: "41.5% of total", tone: "success", icon: "check" },
      { label: "In Progress", value: "86", helper: "25.1% of total", tone: "info", icon: "file" },
      { label: "Pending", value: "78", helper: "22.8% of total", tone: "warning", icon: "clock" },
      { label: "Overdue", value: "10", helper: "2.9% of total", tone: "danger", icon: "clock" },
    ],
    filters: ["Workspace", "Assignee", "Status", "Priority"],
    columns: [
      { key: "task", label: "Task" },
      { key: "workspace", label: "Workspace" },
      { key: "assignee", label: "Assignee" },
      { key: "priority", label: "Priority" },
      { key: "status", label: "Status" },
      { key: "due", label: "Due Date" },
      { key: "actions", label: "Actions" },
    ],
    rows: [
      { task: "Design new landing page", workspace: "Marketing Workspace", assignee: "Neha Verma", priority: { text: "High", tone: "danger" }, status: { text: "In Progress", tone: "info" }, due: "May 20, 2024", actions: "..." },
      { task: "Review campaign brief", workspace: "Marketing Workspace", assignee: "Rohit Singh", priority: { text: "Medium", tone: "warning" }, status: { text: "Pending", tone: "warning" }, due: "May 18, 2024", actions: "..." },
      { task: "Update product roadmap", workspace: "Product Workspace", assignee: "Priya Mehta", priority: { text: "High", tone: "danger" }, status: { text: "In Progress", tone: "info" }, due: "May 22, 2024", actions: "..." },
      { task: "Fix login issue", workspace: "Development Workspace", assignee: "Karan Malhotra", priority: { text: "Medium", tone: "warning" }, status: { text: "Completed", tone: "success" }, due: "May 15, 2024", actions: "..." },
      { task: "Prepare Q2 report", workspace: "Finance Workspace", assignee: "Arjun Sharma", priority: { text: "Low", tone: "success" }, status: { text: "Pending", tone: "warning" }, due: "May 25, 2024", actions: "..." },
      { task: "Onboard new employee", workspace: "HR Workspace", assignee: "Ayesha Khan", priority: { text: "Medium", tone: "warning" }, status: { text: "In Progress", tone: "info" }, due: "May 21, 2024", actions: "..." },
      { task: "Set up analytics tracking", workspace: "Marketing Workspace", assignee: "Rahul Verma", priority: { text: "Low", tone: "success" }, status: { text: "Completed", tone: "success" }, due: "May 16, 2024", actions: "..." },
    ],
  },
  requests: {
    title: "Requests",
    subtitle: "Manage and track all requests from your team.",
    searchPlaceholder: "Search requests...",
    primaryAction: "New Request",
    showing: "Showing 1 to 7 of 128 requests",
    metrics: [
      { label: "Total Requests", value: "128", helper: "+ 15.2% this week", tone: "primary", icon: "users" },
      { label: "Pending", value: "28", helper: "21.9% of total", tone: "warning", icon: "clock" },
      { label: "In Progress", value: "46", helper: "35.9% of total", tone: "info", icon: "file" },
      { label: "Approved", value: "40", helper: "31.3% of total", tone: "success", icon: "check" },
      { label: "Rejected", value: "14", helper: "10.9% of total", tone: "danger", icon: "clock" },
    ],
    filters: ["Type", "Status", "Priority", "Department"],
    columns: [
      { key: "request", label: "Request" },
      { key: "type", label: "Type" },
      { key: "requestedBy", label: "Requested By" },
      { key: "department", label: "Department" },
      { key: "status", label: "Status" },
      { key: "priority", label: "Priority" },
      { key: "requestedOn", label: "Requested On" },
      { key: "actions", label: "Actions" },
    ],
    rows: [
      { request: "New Laptop", type: "Hardware", requestedBy: "Rohit Singh", department: "Design", status: { text: "In Progress", tone: "info" }, priority: { text: "High", tone: "danger" }, requestedOn: "May 17, 2024", actions: "..." },
      { request: "Software Access", type: "Access", requestedBy: "Neha Verma", department: "Marketing", status: { text: "Pending", tone: "warning" }, priority: { text: "Medium", tone: "warning" }, requestedOn: "May 16, 2024", actions: "..." },
      { request: "Leave Request", type: "Leave", requestedBy: "Ayesha Khan", department: "HR", status: { text: "Approved", tone: "success" }, priority: { text: "Low", tone: "success" }, requestedOn: "May 15, 2024", actions: "..." },
      { request: "Travel Approval", type: "Travel", requestedBy: "Arjun Sharma", department: "Sales", status: { text: "Pending", tone: "warning" }, priority: { text: "Medium", tone: "warning" }, requestedOn: "May 14, 2024", actions: "..." },
      { request: "Budget Approval", type: "Finance", requestedBy: "Priya Mehta", department: "Finance", status: { text: "Approved", tone: "success" }, priority: { text: "High", tone: "danger" }, requestedOn: "May 13, 2024", actions: "..." },
      { request: "Training Request", type: "Training", requestedBy: "Karan Malhotra", department: "Development", status: { text: "Rejected", tone: "danger" }, priority: { text: "Low", tone: "success" }, requestedOn: "May 12, 2024", actions: "..." },
      { request: "ID Card Request", type: "General", requestedBy: "Rahul Verma", department: "Operations", status: { text: "In Progress", tone: "info" }, priority: { text: "Low", tone: "success" }, requestedOn: "May 11, 2024", actions: "..." },
    ],
  },
  projects: {
    title: "Projects",
    subtitle: "Track and manage projects across workspaces.",
    searchPlaceholder: "Search projects...",
    primaryAction: "New Project",
    showing: "Showing 1 to 7 of 16 projects",
    metrics: [
      { label: "Total Projects", value: "16", helper: "+ 10% this month", tone: "primary", icon: "users" },
      { label: "In Progress", value: "7", helper: "43.8% of total", tone: "info", icon: "file" },
      { label: "Completed", value: "6", helper: "37.5% of total", tone: "success", icon: "check" },
      { label: "On Hold", value: "2", helper: "12.5% of total", tone: "warning", icon: "clock" },
      { label: "Not Started", value: "1", helper: "6.2% of total", tone: "danger", icon: "clock" },
    ],
    filters: ["Workspace", "Status", "Owner"],
    columns: [
      { key: "project", label: "Project" },
      { key: "workspace", label: "Workspace" },
      { key: "owner", label: "Owner" },
      { key: "status", label: "Status" },
      { key: "progress", label: "Progress" },
      { key: "due", label: "Due Date" },
      { key: "actions", label: "Actions" },
    ],
    rows: [
      { project: "Website Redesign", workspace: "Marketing Workspace", owner: "Neha Verma", status: { text: "In Progress", tone: "info" }, progress: 75, due: "May 30, 2024", actions: "..." },
      { project: "Mobile App Development", workspace: "Development Workspace", owner: "Karan Malhotra", status: { text: "In Progress", tone: "info" }, progress: 60, due: "Jun 15, 2024", actions: "..." },
      { project: "Q2 Marketing Campaign", workspace: "Marketing Workspace", owner: "Rohit Singh", status: { text: "Completed", tone: "success" }, progress: 100, due: "May 10, 2024", actions: "..." },
      { project: "HR Policy Update", workspace: "HR Workspace", owner: "Ayesha Khan", status: { text: "In Progress", tone: "info" }, progress: 40, due: "May 25, 2024", actions: "..." },
      { project: "Sales Dashboard", workspace: "Sales Workspace", owner: "Arjun Sharma", status: { text: "On Hold", tone: "warning" }, progress: 30, due: "Jun 01, 2024", actions: "..." },
      { project: "Budget Planning Q2", workspace: "Finance Workspace", owner: "Priya Mehta", status: { text: "Completed", tone: "success" }, progress: 100, due: "May 05, 2024", actions: "..." },
      { project: "IT Infrastructure Upgrade", workspace: "IT Workspace", owner: "Rahul Verma", status: { text: "Not Started", tone: "neutral" }, progress: 0, due: "Jun 20, 2024", actions: "..." },
    ],
  },
  meetings: {
    title: "Meetings",
    subtitle: "Schedule and manage meetings.",
    searchPlaceholder: "Search meetings...",
    primaryAction: "Schedule Meeting",
    showing: "Showing 1 to 5 of 24 meetings",
    tabs: ["Upcoming", "Today", "This Week", "This Month", "Completed"],
    metrics: [
      { label: "Meetings Today", value: "8", helper: "+ 3 from yesterday", tone: "primary", icon: "users" },
      { label: "Upcoming", value: "24", helper: "This week", tone: "info", icon: "file" },
      { label: "This Month", value: "56", helper: "+ 12.5% vs last month", tone: "primary", icon: "chart" },
      { label: "Completed", value: "32", helper: "This week", tone: "success", icon: "check" },
      { label: "Canceled", value: "4", helper: "This week", tone: "danger", icon: "clock" },
    ],
    filters: [],
    columns: [
      { key: "meeting", label: "Meeting" },
      { key: "dateTime", label: "Date & Time" },
      { key: "workspace", label: "Workspace" },
      { key: "organizer", label: "Organizer" },
      { key: "participants", label: "Participants" },
      { key: "status", label: "Status" },
      { key: "actions", label: "Actions" },
    ],
    rows: [
      { meeting: "Marketing Weekly Sync", dateTime: "May 18, 2024\n10:00 AM - 11:00 AM", workspace: "Marketing Workspace", organizer: "Neha Verma", participants: people.slice(0, 5), status: { text: "Upcoming", tone: "info" }, actions: "..." },
      { meeting: "Product Roadmap Discussion", dateTime: "May 18, 2024\n01:00 PM - 02:30 PM", workspace: "Product Workspace", organizer: "Rohit Singh", participants: people.slice(1, 6), status: { text: "Upcoming", tone: "info" }, actions: "..." },
      { meeting: "Design Review Meeting", dateTime: "May 19, 2024\n11:00 AM - 12:00 PM", workspace: "Design Workspace", organizer: "Priya Mehta", participants: people.slice(2, 7), status: { text: "Upcoming", tone: "info" }, actions: "..." },
      { meeting: "Client Presentation", dateTime: "May 20, 2024\n03:00 PM - 04:00 PM", workspace: "Sales Workspace", organizer: "Arjun Sharma", participants: people.slice(0, 4), status: { text: "Upcoming", tone: "info" }, actions: "..." },
      { meeting: "HR Policy Discussion", dateTime: "May 21, 2024\n02:00 PM - 03:00 PM", workspace: "HR Workspace", organizer: "Ayesha Khan", participants: people.slice(1, 5), status: { text: "Upcoming", tone: "info" }, actions: "..." },
    ],
  },
};

export function AdminDataPage({ type }: { type: keyof typeof datasets }) {
  const dataset = datasets[type];
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeTab, setActiveTab] = useState(dataset.tabs?.[0] ?? "");

  useEffect(() => {
    getProfile().then(setProfile);
  }, []);

  const actionIcon = useMemo(
    () => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
      </svg>
    ),
    []
  );

  return (
    <AppShell
      profile={profile}
      variant="admin"
      title={dataset.title}
      subtitle={dataset.subtitle}
      actions={
        <div className="hidden items-center gap-3 xl:flex">
          <Button variant="ghost" className="border border-[#dfe4ef] bg-white text-[#253152] hover:bg-[#f7f8fd]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v12m0 0 4-4m-4 4-4-4M4.5 21h15" />
            </svg>
            Export
          </Button>
          <Button>
            {actionIcon}
            {dataset.primaryAction}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {dataset.metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </div>

        <Card className="p-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-[#eef1f7] p-4">
            <Input
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
                </svg>
              }
              placeholder={dataset.searchPlaceholder}
              className="h-10 w-full sm:w-72"
            />
            {dataset.filters.map((filter) => (
              <div key={filter} className="flex items-center gap-2 text-xs font-semibold text-[#5f6b8a]">
                <span>{filter}</span>
                <Select className="h-10 w-32 text-xs">
                  <option>All</option>
                </Select>
              </div>
            ))}
            <Button variant="ghost" className="ml-auto border border-[#dfe4ef] bg-white text-[#253152]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M6 12h12M10 19h4" />
              </svg>
              Filters
            </Button>
          </div>

          {dataset.tabs && (
            <div className="flex gap-7 border-b border-[#eef1f7] px-5 pt-4">
              {dataset.tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "border-b-2 px-1 pb-3 text-sm font-bold transition",
                    activeTab === tab ? "border-primary text-primary" : "border-transparent text-[#526080] hover:text-primary"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-[#f8f9fd]">
                <tr>
                  {dataset.columns.map((column) => (
                    <th key={column.key} className="px-5 py-4 text-xs font-black text-[#6c789a]">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataset.rows.map((row, index) => (
                  <tr key={index} className="border-t border-[#eef1f7] text-sm text-[#26304e]">
                    {dataset.columns.map((column) => (
                      <td key={column.key} className="px-5 py-4">
                        <CellValue value={row[column.key]} column={column.key} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-[#526080]">
          <span>{dataset.showing}</span>
          <div className="flex items-center gap-2">
            {["<", "1", "2", "3", "4", "5", "...", type === "requests" ? "19" : type === "tasks" ? "49" : "3", ">"].map((page, index) => (
              <button
                key={`${page}-${index}`}
                className={cn(
                  "grid h-8 min-w-8 place-items-center rounded-lg border border-[#dfe4ef] bg-white px-2 text-xs font-bold",
                  page === "1" && "border-primary bg-primary text-white"
                )}
              >
                {page}
              </button>
            ))}
          </div>
          <Select className="h-9 w-28 text-xs">
            <option>10 / page</option>
          </Select>
        </div>
      </div>
    </AppShell>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  return (
    <Card className="min-h-[104px] p-5">
      <div className="flex items-start gap-4">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-lg", iconTone[metric.tone])}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPaths[metric.icon]} />
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-[#6c789a]">{metric.label}</p>
          <p className="mt-1 text-2xl font-black text-[#101936]">{metric.value}</p>
          <p className={cn("mt-1 text-xs font-semibold", metric.tone === "danger" ? "text-danger" : metric.tone === "success" ? "text-success" : "text-[#6c789a]")}>
            {metric.helper}
          </p>
        </div>
      </div>
    </Card>
  );
}

function CellValue({ value, column }: { value: Row[string]; column: string }) {
  if (Array.isArray(value)) {
    return <AvatarGroup people={value.map((name) => ({ name }))} max={5} size="sm" />;
  }

  if (typeof value === "object" && value !== null) {
    return <Badge tone={value.tone}>{value.text}</Badge>;
  }

  if (column === "assignee" || column === "owner" || column === "requestedBy" || column === "organizer") {
    return (
      <span className="inline-flex items-center gap-2 font-semibold">
        <Avatar name={String(value)} size="sm" />
        {String(value)}
      </span>
    );
  }

  if (column === "progress" && typeof value === "number") {
    return (
      <span className="flex items-center gap-3">
        <span className="h-2 w-28 overflow-hidden rounded-full bg-[#e8ecf5]">
          <span className="block h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
        </span>
        <span className="text-xs font-bold">{value}%</span>
      </span>
    );
  }

  if (column === "dateTime") {
    return <span className="whitespace-pre-line text-xs font-semibold leading-5">{String(value)}</span>;
  }

  if (column === "actions") {
    return <button className="rounded-md px-2 text-lg leading-none text-[#526080] hover:bg-[#f2f4fb]">{String(value)}</button>;
  }

  return <span className={column === "task" || column === "request" || column === "project" || column === "meeting" ? "font-bold text-[#17213f]" : ""}>{String(value)}</span>;
}
