# FlowDesk Architecture

## Current stack

- Next.js 16 App Router and React 19
- TypeScript and Tailwind CSS
- Supabase Auth and PostgreSQL
- Browser Supabase client for session-aware reads

## Boundaries

The UI is not a security boundary. Reads are limited by PostgreSQL RLS. Sensitive writes use authenticated PostgreSQL RPC functions that validate tenant, role, assignee, current state and required comments in one transaction. This prevents a modified browser request from bypassing workflow rules.

Attendance login capture uses a Next.js route handler because only the server can inspect trusted deployment forwarding headers. The route forwards the user's bearer token to Supabase; the database derives the user identity from that token and never accepts an arbitrary user ID.

## Data model direction

- Existing: `companies`, `profiles`, `departments`, `tasks`, `task_comments`, `task_approvals`, `task_activity`.
- Batch 1: profile permissions, expanded task status/type metadata, append-only status history, attendance sessions.
- Later: `brands`, `company_brands`, `channels`, `teams`, attachments, recurrence definitions, meetings and action items.

All tenant-owned tables include `company_id`. Foreign-key relationships and RLS prevent cross-company access. Role checks use a shared database helper based on `auth.uid()`.

## Workflow invariants

`transition_task(task_id, next_status, comment)` locks the task row, validates the transition and actor, updates timestamps, records the required comment, and appends status/activity history atomically. Direct client updates to workflow fields are not part of the supported architecture.

## Attendance security

Login rows are de-duplicated by Supabase authentication session. IP is sourced from deployment headers, normalized, and stored as `inet` when valid. RLS allows users to read their own attendance and managers/admins to read their company. Normal clients cannot forge attendance for another user.

The 8h30 target is a display and reporting default, not payroll calculation. Timezone reporting defaults to the user's browser while timestamps remain UTC.

## Operational assumptions

- Supabase migrations are applied before deploying UI that invokes new RPCs.
- Existing production tables match the fields already queried by the application.
- RLS remains enabled for all tenant data.
- Deployment provides `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
