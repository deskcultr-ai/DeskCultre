# FlowDesk Product Requirements

## Product goal

FlowDesk is a multi-tenant task and people operations system for Belle Lingeries and related companies. It must be simple enough for daily office use and safe enough to evolve into a SaaS product supporting roughly 50 users per company.

## Personas and roles

- **Admin / Owner:** company-wide configuration, task and attendance visibility, approvals, escalations.
- **Manager:** team task management, approvals, attendance and workload visibility.
- **Team Member:** assigned work, comments, submissions, personal attendance and performance.
- **Reviewer:** optional review authority when explicitly enabled.

## Tenant model

Every business record belongs to a company. Companies can have departments, teams, websites and sales channels. Brands can be associated with multiple companies. Tenant isolation is mandatory and must be enforced by database row-level security, not only by the interface.

## Task management

Tasks contain title, description, priority, assignee, creator, due date, company, optional brand, department and channel, task type, comments, attachments, approvals and an immutable activity history.

Task types are one-time, daily recurring and continuous multi-day. Priorities are low, medium, high and urgent.

The canonical workflow is:

`draft/pending -> assigned -> in_progress -> waiting/blocked -> under_review -> approved -> completed`

`under_review -> rejected/rework -> in_progress`, and completed tasks may be reopened by a manager or admin.

Hard rules:

- Every status transition requires a written comment.
- Only the assignee may progress their own work; managers/admins can manage company tasks.
- Only managers/admins (and enabled reviewers for review decisions) may approve or reject.
- Completion is only possible after approval.
- Important changes are appended to an immutable audit timeline.
- Team members may create tasks only when their profile permission is enabled.

## Attendance

Every role has attendance. A login records the user, company, timestamp, authentication session and best available request IP. The standard workday is 8 hours 30 minutes. Users see elapsed and remaining/extra time, plus their own history; managers/admins can see company attendance.

IP addresses are sensitive operational/security data. They are visible only to the employee concerned and authorized managers/admins, retained according to company policy, never exposed in public analytics, and may be inaccurate behind proxies or corporate NAT.

## Dashboards

Role-aware dashboards surface personal or team task load, overdue/blocked work, review queues and attendance. Later batches add performance, brand/channel reporting, workload distribution and escalation views.

## Meetings

Meetings support attendees, agenda, notes, decisions, reminders and action items convertible to tasks. This is planned after the workflow and attendance foundations.

## Quality and acceptance

- Responsive, accessible loading/empty/error/permission states.
- Supabase RLS and database functions enforce sensitive rules.
- Database changes are versioned migrations.
- TypeScript, lint and production build pass.
- No secret values are committed.

## Delivery phases

1. Safe task workflow, roles/permissions, audit trail and attendance foundation.
2. Company/brand/channel/team administration and task attachments/recurrence.
3. Role-specific dashboards, reporting and notifications.
4. Meetings and action-item workflows.
5. SaaS hardening, onboarding, retention controls and expanded automated tests.
