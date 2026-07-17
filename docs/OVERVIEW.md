# FlowDesk Overview

## Objective

FlowDesk is a multi-tenant company operations system for managing daily work, task accountability, attendance, meetings, approvals, and team administration. The main objective is to give each company a controlled workspace where users can create, assign, review, complete, and audit work while keeping company data isolated through Supabase row-level security and secure database functions.

The application is designed so that the frontend is only an interaction layer. Sensitive business rules, tenant isolation, role checks, workflow transitions, attendance records, and approval actions are enforced by the database through RLS policies, constraints, triggers, and RPC functions.

## Technology Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase PostgreSQL
- Supabase Storage
- Supabase Row-Level Security
- PostgreSQL RPC functions and triggers

## Main User Roles

- Admin: controls registration approvals, audit access, people permissions, company setup, attendance, reports, meetings, and task management.
- Owner: company-level management role with broad operational access.
- Manager: manages team work, reviews, attendance, meetings, reports, and organization data.
- Reviewer: can review submitted work when review permission is enabled.
- Executive: expanded business role available through registration approval.
- Member: works on assigned tasks, comments, submits work, views own attendance, and can create tasks only when permission is enabled.

## Core Functional Areas

### Authentication And Registration

FlowDesk supports email/password registration requests and login. A new user registers with name, email, password, and phone number. Supabase Auth creates the auth user, and a database trigger captures the registration request into `registration_requests`.

Admins review pending requests and approve or reject them. Approval creates or updates a profile, assigns company, department, team, role, and permissions. Rejection records a review note. Rejected users can resubmit their request.

Related functions:

- `capture_registration_request`
- `approve_registration_request`
- `reject_registration_request`
- `resubmit_registration_request`
- `get_my_registration_status`

### Account And Password Management

Users can view their registration/access status and update their password. Password updates use Supabase Auth. Registration status is read through a secure RPC so applicants only see their own request.

Related pages:

- `/account`
- `/reset-password`

### Profile Management

Users can update personal profile information such as display name, birthday, gender, job title, bio, timezone, avatar URL, availability, and visibility preferences.

Profile updates use the `update_my_profile` RPC so users can edit only allowed personal fields. Sensitive fields such as role, company, and permissions are protected separately.

Related functions:

- `update_my_profile`
- `guard_profile_sensitive_fields`

### Company And Organization Management

Managers and admins can manage company-level organization data. This includes company name and slug, brands, sales channels, teams, departments, and task tags.

Brands can be shared across companies through `company_brands`. Channels, teams, and tags belong to one company. RLS policies restrict visibility and management by company.

Related functions:

- `update_company_settings`
- `create_or_link_brand`

Related tables:

- `companies`
- `departments`
- `brands`
- `company_brands`
- `channels`
- `teams`
- `team_members`
- `task_tags`

### People And Permissions

Managers and admins can view company people and update selected operational permissions. Permissions include task creation and task review capability.

Permission changes are performed through `update_profile_permissions`, which checks the acting user's role and company before changing another profile.

Related function:

- `update_profile_permissions`

Related fields:

- `can_create_tasks`
- `can_review_tasks`
- `can_manage_people`
- `can_manage_organization`
- `can_view_reports`
- `can_manage_meetings`

### Task Management

Tasks are company-owned work records. A task may include title, description, priority, assignee, creator, department, brand, channel, team, task type, dates, tags, attachments, comments, approvals, and activity history.

Task creation is performed through secure RPC functions. The database validates the actor's profile, company, permission, assignee, department, brand, channel, team, tags, priority, and task type before creating the record.

Supported task types:

- `one_time`
- `daily_recurring`
- `continuous`

Supported priorities:

- `low`
- `medium`
- `high`
- `urgent`

Related functions:

- `create_task_secure`
- `create_task_secure_v2`
- `create_next_daily_occurrence`

Related tables:

- `tasks`
- `task_comments`
- `task_activity`
- `task_approvals`
- `task_status_history`
- `task_tag_assignments`
- `task_files`

### Task Workflow

Task status changes must go through `transition_task`. Direct client updates to task status are blocked by the `guard_task_status_update` trigger unless the workflow RPC sets the internal workflow flag.

Every status transition requires a written comment. The transition RPC validates the current task, company, actor, assignee, role, review permission, requested next status, and transition rules. It then updates the task, inserts a comment, writes status history, writes task activity, and records approval decisions when relevant.

Canonical workflow:

`draft/pending -> assigned -> in_progress -> waiting/blocked -> under_review -> approved -> completed`

Additional supported paths:

- `under_review -> rejected/rework -> in_progress`
- `completed -> reopened -> in_progress`
- legacy `submitted` is supported alongside `under_review`

Related functions and triggers:

- `transition_task`
- `guard_task_status_update`

### Task Comments And Timeline

Users can add comments to tasks they can access. Timeline data is composed from task comments, task approvals, and task activity records. This produces an audit trail of status changes, comments, approvals, attachments, escalations, and meeting-created action items.

Related tables:

- `task_comments`
- `task_approvals`
- `task_activity`
- `task_status_history`

### Task Attachments

Task files are stored in the private Supabase Storage bucket `task-files`. Files are uploaded under a company/task path, then registered through `register_task_file`.

The database validates that the file belongs to the same company as the task. Users may attach files only when they are the assignee or have manager/admin authority. File access is controlled by storage policies and signed URLs.

Related function:

- `register_task_file`

Related storage bucket:

- `task-files`

### Daily Recurring Tasks

Daily recurring tasks act as templates. Managers can create the next due occurrence through `create_next_daily_occurrence`. The function validates recurrence status, prevents duplicate occurrences for the same date, creates a one-time task occurrence, copies task tags, advances `next_recurrence_on`, and records activity.

Related function:

- `create_next_daily_occurrence`

### Escalations And Notifications

Users assigned to a task, or managers/admins, can raise a task escalation with severity and reason. Escalations create records in `task_escalations`, notify active managers/admins through `notifications`, and write task activity.

Managers can resolve escalations with a resolution note.

Related functions:

- `create_task_escalation`
- `resolve_task_escalation`

Related tables:

- `task_escalations`
- `notifications`

### Review Queue

Reviewers, managers, owners, and admins can view tasks waiting for review. The queue reads tasks with statuses such as `under_review` and `submitted`. Final approve/reject/rework actions still go through `transition_task`.

Related route:

- `/reviews`

### Workload Reports

Managers and admins can view current workload distribution by department, brand, channel, assignee, blocked/rework count, and review count. Reports read company task data permitted by RLS and role policies.

Related route:

- `/reports`

### Attendance Recording

Attendance is recorded when an authenticated user logs in or sends a heartbeat to the attendance route. The browser calls `/api/attendance/login` with the user's bearer token. The server route extracts request IP and user agent from request headers, forwards the token to Supabase, and calls the attendance RPC.

The database derives the user from `auth.uid()` and never accepts arbitrary user IDs from the client.

Related API route:

- `/api/attendance/login`

Related functions:

- `record_attendance_login`
- `record_attendance_logout`
- `touch_attendance_session`
- `classify_attendance_session`

Related table:

- `attendance_sessions`

### Attendance Policies

Each company can define attendance policy settings such as timezone, workday start, workday end, late grace minutes, overtime grace minutes, and workdays.

Login sessions are classified using the policy. The system stores expected start/end times and attendance status such as present, late, overtime, or on leave.

Related table:

- `attendance_policies`

### Attendance Views And Export

Users can view their own attendance. Managers and admins can view company attendance. Attendance can be filtered by day and status, and exported as CSV from the browser.

Related route:

- `/attendance`

### Leave Requests And Attendance Corrections

Non-admin users can submit leave requests through `request_leave`. Managers can review leave requests and attendance correction requests using review RPCs.

Related functions:

- `request_leave`
- `request_attendance_correction`
- `review_attendance_correction`
- `review_leave_request`

Related tables:

- `leave_requests`
- `attendance_corrections`
- `leave_balances`

### Meetings

Managers and admins can create meetings with scheduled time, agenda, department, team, and attendees. They can record decisions, create linked action items, and send in-app reminders.

Action items are converted into tasks through `create_meeting_action_item`. Meeting reminders create notification records for attendees.

Related functions:

- `create_meeting_action_item`
- `send_meeting_reminders`

Related tables:

- `meetings`
- `meeting_attendees`
- `meeting_decisions`
- `meeting_action_items`

### Audit Logging

Registration approvals and rejections are written to `access_audit_log`. Admins can view the latest audit events for their company.

Related table:

- `access_audit_log`

### Notification Preferences And Outbox

The system includes notification preferences and an outbox for future email and WhatsApp delivery. In-app notifications are already used for escalations and meeting reminders. External delivery remains queued through `notification_outbox`.

Related functions:

- `queue_enabled_notification`

Related tables:

- `notification_preferences`
- `notification_outbox`

### SaaS Foundation

The database includes `workspace_subscriptions` to separate subscription and billing state from company operational data. This prepares FlowDesk for future multi-company SaaS plans.

Related table:

- `workspace_subscriptions`

## Work Process

### New User Access Process

1. User registers with email, password, name, and phone number.
2. Supabase Auth creates the auth user.
3. Database trigger creates a pending registration request.
4. User verifies email.
5. Admin reviews the request.
6. Admin assigns company, department, team, role, and permissions.
7. Approval creates or updates the user's profile.
8. User can access the workspace based on assigned role and permissions.

### Daily Login And Attendance Process

1. User signs in.
2. Dashboard or attendance panel calls `/api/attendance/login`.
3. The route validates the bearer token.
4. The route extracts IP, user agent, and device context.
5. Supabase RPC records or updates the attendance session.
6. Attendance policy classifies the session as present or late.
7. Heartbeats update `last_seen_at`.
8. Sign-out calls the same route with logout action.
9. Logout records `logout_at` and may mark overtime.

### Task Creation Process

1. User opens task creation.
2. App loads company departments, active people, brands, channels, teams, and tags.
3. User submits task data.
4. `create_task_secure_v2` validates actor, company, permissions, references, priority, type, dates, and tags.
5. Database creates the task.
6. Database assigns initial status as `pending` or `assigned`.
7. Database writes task activity.
8. User returns to task list.

### Task Execution Process

1. User opens an accessible task.
2. App loads task details, people, organization labels, tags, files, comments, approvals, and activity.
3. Assignee or manager writes a transition comment.
4. User chooses the next workflow status.
5. `transition_task` validates transition rules.
6. Database updates task timestamps and status.
7. Database inserts comment, status history, activity, and approval records where applicable.
8. Timeline shows the updated history.

### Review Process

1. Assignee submits work for review.
2. Status becomes `under_review` or legacy `submitted`.
3. Reviewer, manager, owner, or admin opens review queue.
4. Reviewer approves, rejects, or sends to rework through `transition_task`.
5. Approved tasks can be completed by manager/admin.
6. Rejected or rework tasks return to progress.

### Attachment Process

1. User selects a file.
2. File is uploaded to Supabase Storage under company and task path.
3. `register_task_file` validates access and tenant ownership.
4. Database records file metadata.
5. Task activity records the attachment.
6. Files are retrieved later with signed URLs.

### Escalation Process

1. Assignee or manager enters escalation severity and reason.
2. `create_task_escalation` validates task access.
3. Database creates escalation.
4. Active managers/admins receive in-app notifications.
5. Task activity records escalation.
6. Manager may resolve escalation with a note.

### Meeting Process

1. Manager creates a meeting with agenda, time, team/department, and attendees.
2. Attendees are saved in `meeting_attendees`.
3. Manager selects the meeting.
4. Decisions are recorded in `meeting_decisions`.
5. Action items are created through `create_meeting_action_item`.
6. Each action item creates a linked task.
7. Meeting reminders create in-app notifications.

### Leave Request Process

1. Non-admin user submits leave type, date range, and optional reason.
2. `request_leave` validates role and dates.
3. Database stores the leave request as pending.
4. Manager reviews request.
5. `review_leave_request` marks it approved or rejected.

### Permission Management Process

1. Manager/admin opens people settings.
2. App loads people in the company.
3. Manager toggles task creation or review permissions.
4. `update_profile_permissions` validates manager/admin authority.
5. Profile permission fields are updated.

## Security And Data Rules

- Every tenant-owned table includes `company_id`.
- RLS restricts reads and writes by authenticated company context.
- Sensitive actions use security-definer RPC functions.
- Task status cannot be directly updated by the client.
- Task transitions require comments.
- Attendance identity comes from Supabase auth, not client-provided user IDs.
- Registration contact data is visible to admins and the applicant only.
- Managers/admins can access company attendance; members can access only their own.
- Storage paths include company/user ownership checks.
- Role and permission changes are guarded by database triggers and RPCs.

## Environment Requirements

The application requires these environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The Supabase migrations must be applied before deploying frontend code that calls newer RPCs or reads newer tables.

## Important Source Areas

- `src/app`: Next.js app routes and pages.
- `src/components`: shared operational panels.
- `src/lib/supabase.ts`: Supabase client setup.
- `src/app/api/attendance/login/route.ts`: attendance server route.
- `supabase/migrations`: database schema, policies, triggers, and RPC functions.
- `docs`: product, architecture, changelog, implementation plan, and this overview.

