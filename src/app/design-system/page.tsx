"use client";

import { useState } from "react";
import {
  Button,
  Card,
  Input,
  Select,
  Checkbox,
  Radio,
  Toggle,
  Badge,
  Chip,
  Avatar,
  AvatarGroup,
  Tabs,
  Modal,
  Alert,
  ProgressBar,
  ProgressCircle,
} from "@/components/ui";

const primary = [
  { name: "Indigo", hex: "#4F46E5", className: "bg-primary" },
  { name: "Indigo Light", hex: "#EEF2FF", className: "bg-primary-light border border-slate-200" },
  { name: "Indigo Dark", hex: "#4338CA", className: "bg-primary-dark" },
];

const semantic = [
  { name: "Success", hex: "#10B981", className: "bg-success" },
  { name: "Warning", hex: "#F59E0B", className: "bg-warning" },
  { name: "Danger", hex: "#EF4444", className: "bg-danger" },
  { name: "Info", hex: "#3B82F6", className: "bg-info" },
];

const neutral = [
  { name: "N900", hex: "#0F172A", className: "bg-slate-900" },
  { name: "N800", hex: "#1E293B", className: "bg-slate-800" },
  { name: "N700", hex: "#334155", className: "bg-slate-700" },
  { name: "N500", hex: "#64748B", className: "bg-slate-500" },
  { name: "N300", hex: "#CBD5E1", className: "bg-slate-300" },
  { name: "N200", hex: "#E2E8F0", className: "bg-slate-200" },
  { name: "N100", hex: "#F1F5F9", className: "bg-slate-100" },
  { name: "N50", hex: "#F8FAFC", className: "bg-slate-50 border border-slate-200" },
];

const typography = [
  { style: "H1", cls: "text-h1", meta: "32 / 700 / 40" },
  { style: "H2", cls: "text-h2", meta: "24 / 600 / 32" },
  { style: "H3", cls: "text-h3", meta: "20 / 600 / 28" },
  { style: "H4", cls: "text-h4", meta: "18 / 500 / 26" },
  { style: "Body Large", cls: "text-base", meta: "16 / 400 / 24" },
  { style: "Body Default", cls: "text-sm", meta: "14 / 400 / 20" },
  { style: "Caption", cls: "text-caption text-slate-500", meta: "11 / 400 / 14" },
];

const spacing = [0, 4, 8, 12, 16, 20, 24, 32, 40, 64];

const people = [
  { name: "Arjun Sharma" },
  { name: "Neha Verma" },
  { name: "Rohit Singh" },
  { name: "Ayesha Khan" },
  { name: "Karan Mehta" },
  { name: "Priya Nair" },
];

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-h3 text-primary">{title}</h2>
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-ds-sm">{children}</div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{children}</p>;
}

export default function DesignSystemPage() {
  const [tab, setTab] = useState("tab1");
  const [toggle, setToggle] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [chips, setChips] = useState(["Design", "Urgent", "Marketing"]);

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1400px] items-center gap-4 px-6 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-[10px] bg-gradient-to-br from-primary to-violet-500 text-sm font-bold text-white">
            DC
          </div>
          <span className="text-lg font-extrabold tracking-tight">DeskCulture</span>
          <span className="text-lg font-bold text-primary">Design System</span>
          <span className="hidden text-sm text-slate-400 sm:inline">Consistent. Simple. Powerful.</span>
          <Badge tone="primary" className="ml-auto">
            v1.0.0
          </Badge>
        </div>
      </header>

      <div className="mx-auto max-w-[1400px] space-y-12 px-6 py-10">
        {/* Colors */}
        <Section id="colors" title="01. Colors">
          <div className="grid gap-8 lg:grid-cols-3">
            <div>
              <Label>Primary</Label>
              <div className="grid grid-cols-3 gap-3">
                {primary.map((c) => (
                  <Swatch key={c.name} {...c} />
                ))}
              </div>
            </div>
            <div>
              <Label>Semantic</Label>
              <div className="grid grid-cols-4 gap-3">
                {semantic.map((c) => (
                  <Swatch key={c.name} {...c} />
                ))}
              </div>
            </div>
            <div>
              <Label>Neutral</Label>
              <div className="grid grid-cols-4 gap-3">
                {neutral.map((c) => (
                  <Swatch key={c.name} {...c} small />
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Typography + Spacing */}
        <div className="grid gap-12 lg:grid-cols-2">
          <Section id="typography" title="02. Typography">
            <div className="mb-6 flex items-center gap-5 border-b border-slate-100 pb-6">
              <span className="text-[64px] font-black leading-none">Aa</span>
              <div>
                <p className="text-h3">Inter</p>
                <p className="text-sm text-slate-500">Clean, modern and highly readable</p>
              </div>
            </div>
            <div className="space-y-4">
              {typography.map((t) => (
                <div key={t.style} className="flex items-baseline justify-between gap-4">
                  <span className="w-28 shrink-0 text-xs font-semibold text-slate-400">{t.style}</span>
                  <span className={`${t.cls} flex-1 truncate text-slate-900`}>The quick brown fox</span>
                  <span className="shrink-0 text-xs text-slate-400">{t.meta}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section id="spacing" title="03. Spacing System (8px base)">
            <div className="flex flex-wrap items-end gap-4">
              {spacing.map((s) => (
                <div key={s} className="flex flex-col items-center gap-2">
                  <div className="rounded-md bg-primary/15" style={{ width: Math.max(s, 4), height: Math.max(s, 4) }} />
                  <span className="text-xs text-slate-500">{s}px</span>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* Components */}
        <Section id="components" title="04. Components">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <Label>Buttons — Variants</Label>
              <div className="flex flex-wrap gap-3">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="primary" disabled>
                  Disabled
                </Button>
              </div>

              <Label>
                <span className="mt-6 block">Sizes</span>
              </Label>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg">Large</Button>
                <Button size="md">Medium</Button>
                <Button size="sm">Small</Button>
              </div>

              <Label>
                <span className="mt-6 block">Badges &amp; Avatars</span>
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="primary">Primary</Badge>
                <Badge tone="success">Success</Badge>
                <Badge tone="warning">Warning</Badge>
                <Badge tone="danger">Danger</Badge>
                <Badge tone="info">Info</Badge>
                <Badge tone="neutral">Neutral</Badge>
              </div>
              <div className="mt-4">
                <AvatarGroup people={people} max={4} />
              </div>
            </div>

            <div>
              <Label>Cards</Label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <h4 className="text-h4 text-slate-900">Default Card</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    A default card used to display information in a structured way.
                  </p>
                  <button className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    View Details →
                  </button>
                </Card>
                <Card hover>
                  <h4 className="text-h4 text-slate-900">Hover Card</h4>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Cards elevate on hover to indicate interactivity.
                  </p>
                  <button className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    View Details →
                  </button>
                </Card>
              </div>
            </div>
          </div>
        </Section>

        {/* Inputs & controls */}
        <Section id="inputs" title="05. Inputs & Controls">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-4">
              <div>
                <Label>Text Input</Label>
                <Input placeholder="Type something..." />
              </div>
              <div>
                <Label>Input with Icon</Label>
                <Input
                  placeholder="Search..."
                  icon={
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />
                    </svg>
                  }
                />
              </div>
              <div>
                <Label>Select Input</Label>
                <Select defaultValue="">
                  <option value="" disabled>
                    Select an option
                  </option>
                  <option>Marketing</option>
                  <option>Design</option>
                  <option>Engineering</option>
                </Select>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <Label>Checkbox</Label>
                <div className="flex flex-col gap-2">
                  <Checkbox label="Checked" defaultChecked />
                  <Checkbox label="Unchecked" />
                </div>
              </div>
              <div>
                <Label>Radio Button</Label>
                <div className="flex flex-col gap-2">
                  <Radio name="demo-radio" label="Selected" defaultChecked />
                  <Radio name="demo-radio" label="Unselected" />
                </div>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <Label>Toggle Switch</Label>
                <Toggle checked={toggle} onChange={setToggle} aria-label="Demo toggle" />
              </div>
              <div>
                <Label>Chips / Tags</Label>
                <div className="flex flex-wrap gap-2">
                  {chips.map((chip, index) => (
                    <Chip
                      key={chip}
                      tone={index === 1 ? "danger" : index === 2 ? "info" : "neutral"}
                      onRemove={() => setChips((prev) => prev.filter((c) => c !== chip))}
                    >
                      {chip}
                    </Chip>
                  ))}
                  {chips.length === 0 && <span className="text-sm text-slate-400">All removed</span>}
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Feedback + other */}
        <Section id="feedback" title="06. Feedback & Other UI">
          <div className="grid gap-8 lg:grid-cols-2">
            <div className="space-y-3">
              <Label>Alerts</Label>
              <Alert tone="success">Success! Your changes have been saved.</Alert>
              <Alert tone="warning">Warning! Please check the information.</Alert>
              <Alert tone="danger">Error! Something went wrong.</Alert>
              <Alert tone="info">Info: Here is some information for you.</Alert>
            </div>

            <div className="space-y-6">
              <div>
                <Label>Progress</Label>
                <ProgressBar value={72} showLabel />
                <div className="mt-6 flex items-center gap-8">
                  <ProgressCircle value={72} />
                  <ProgressCircle value={92} color="var(--color-success)" />
                </div>
              </div>

              <div>
                <Label>Tabs</Label>
                <Tabs
                  tabs={[
                    { id: "tab1", label: "Tab 1" },
                    { id: "tab2", label: "Tab 2" },
                    { id: "tab3", label: "Tab 3" },
                  ]}
                  value={tab}
                  onValueChange={setTab}
                />
                <p className="mt-3 text-sm text-slate-600">Active content for {tab}.</p>
              </div>

              <div>
                <Label>Modal</Label>
                <Button onClick={() => setModalOpen(true)}>Open Modal</Button>
              </div>
            </div>
          </div>
        </Section>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Modal Title"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setModalOpen(false)}>Confirm</Button>
          </>
        }
      >
        This is a modal dialog. It appears on top of the page and traps focus until dismissed.
      </Modal>
    </main>
  );
}

function Swatch({ name, hex, className, small }: { name: string; hex: string; className: string; small?: boolean }) {
  return (
    <div>
      <div className={`${className} ${small ? "h-12" : "h-16"} w-full rounded-xl shadow-ds-sm`} />
      <p className="mt-2 text-xs font-bold text-slate-800">{name}</p>
      <p className="text-[11px] uppercase text-slate-400">{hex}</p>
    </div>
  );
}
