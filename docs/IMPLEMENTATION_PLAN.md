# FlowDesk Implementation Plan

## Current state (2026-07-15)

Authentication, company/profile lookup, departments, dashboard metrics, task create/list/detail, comments, approval actions and activity display exist. The current UI performs sensitive task updates directly from the browser. There is no repository migration history, no documented RLS baseline, no enforced transition comment, and no attendance model.

## Batch 1 — daily-use foundation

- [x] Establish PRD, architecture, plan and changelog.
- [x] Add an additive Supabase migration for role permissions, canonical workflow metadata, atomic transition RPCs, immutable history and attendance sessions.
- [x] Move task status actions to the secure transition RPC and require comments.
- [x] Enforce task creation permission through a secure RPC.
- [x] Record authenticated login attendance with best-available IP.
- [x] Show personal timer/history and manager/admin company attendance.
- [x] Preserve existing task routes and legacy statuses during migration.
- [x] Run lint, TypeScript/production build and migration static checks.

Migration required: `supabase/migrations/202607150001_batch1_workflow_attendance.sql`. Apply it to Supabase before deploying the Batch 1 interface.

## Batch 2 — organization and richer tasks

Editable companies/brands/channels/teams, many-to-many company-brand mapping, task tags, attachments, daily recurrence and continuous-task behavior.

Migration required: `supabase/migrations/202607150002_batch2_organization_richer_tasks.sql`. This is additive and introduces a private `task-files` storage bucket. Recurring-task occurrence generation is manager-triggered in this batch; a scheduled invocation can be added once the operating cadence is confirmed.

## Batch 3 — role dashboards and reporting

Role-specific task/attendance dashboards, review queue, workload and department/brand/channel performance, escalations and notifications.

## Batch 4 — meetings

Meetings, attendees, agenda, notes, decisions, reminders and action-item-to-task conversion.

## Risks and controls

- **Unknown live schema/RLS:** use additive, idempotent migration statements and document pre-deploy backup/testing.
- **Legacy task statuses:** map existing `submitted` to review and preserve compatible transitions.
- **Client-side authorization:** database RPCs/RLS are authoritative; UI permissions are only affordances.
- **IP privacy/accuracy:** restrict reads, disclose purpose, use trusted proxy headers, define retention before payroll use.
- **No automated test harness:** keep pure workflow helpers testable and require lint/build plus staging database smoke tests.
