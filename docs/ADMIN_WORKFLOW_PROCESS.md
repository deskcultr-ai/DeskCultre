# DeskCulture Admin And Employee Workflow

This document explains how admins and employees should register, sign in, get approved, use settings, and rely on the RPC-backed workflow system.

## Roles

- Admin: controls company setup, registration approvals, users, roles, permissions, departments, workspaces, attendance visibility, reports, meetings, audit logs, and system settings.
- Manager: can manage assigned team operations when granted permissions such as people, organization, reports, meetings, task creation, or review.
- Employee: works inside the assigned company, department, and workspace permissions. Employees can view their own dashboard, profile, attendance, tasks, meetings, files, requests, and notifications.
- Guest or pending user: can sign in only far enough to finish onboarding or view registration status until an admin approves access.

## Admin Registration And First Sign-In

1. Admin opens the register screen and creates an account with email/password or OAuth if enabled.
2. Supabase Auth creates the auth user.
3. The onboarding flow creates or links a company workspace.
4. A company record, join code, and admin profile are created through the company onboarding RPC flow.
5. After sign-in, `src/lib/auth-redirect.ts` sends admin roles to `/admin`.
6. Admin lands on the admin dashboard and can configure organization, departments, users, roles, and settings.

Important RPCs and helpers:

- `create_company`
- `bootstrap_company`
- `join_company`
- `approve_member`
- `current_company_id`
- `is_admin`

## Employee Registration And Sign-In

1. Employee opens register and creates an account.
2. Employee joins an existing workspace using the company join code, and may select a department if the flow asks for it.
3. The system creates a pending profile or registration request.
4. Employee can sign in, but active workspace access remains blocked until approval.
5. Employee sees onboarding or registration status while pending.
6. After admin approval, employee signs in again or refreshes, then lands on `/dashboard`.
7. The app loads the employee profile, company, role, department, and permission fields before showing work areas.

Important RPCs:

- `lookup_org_by_code`
- `get_departments_by_code`
- `join_company`
- `request_workspace_access`
- `get_my_registration_status`
- `resubmit_registration_request`

## Admin Approval Workflow

1. Admin opens registration or people management.
2. Admin reviews pending user details: name, email, phone, requested company, and created date.
3. Admin chooses company, department, team, and role.
4. Admin grants operational permissions:
   - create tasks
   - review work
   - manage people
   - manage organization
   - view reports
   - manage meetings
   - department senior manager
5. Admin clicks Approve or Reject.
6. Approval activates the profile and writes company/department/role/permission fields.
7. Rejection records the note and leaves the applicant outside the workspace.
8. Approval/rejection is written to audit history.

Important RPCs:

- `approve_registration_request`
- `reject_registration_request`
- `approve_member`
- `remove_member`
- `set_profile_access`
- `set_department_senior_manager`

## Admin Settings Controls

Admin settings currently cover these areas:

- General Settings: organization name, industry, website, company details, headquarters, address, timezone, currency, language, region, brand color, and accent color.
- Profile Settings: admin display name, username, designation, department label, employee ID, mobile number, emergency contact, recovery info, and password update.
- Notifications: user join/remove alerts, task alerts, leave alerts, meeting reminders, desktop/browser notifications, chat mentions, direct messages, and AI/automation alerts.
- Appearance: light/dark/system theme, sidebar style, dashboard layout, and accent shade.
- Account Deletion: temporary deactivation with grace period or immediate permanent removal.

Related routes:

- `/admin/settings`
- `/settings/organization`
- `/settings/people`
- `/settings/registrations`
- `/settings/attendance`
- `/settings/audit`

## Employee Settings Controls

Employees should only control personal and self-service settings:

- Profile: display name, birthday, gender, job title, bio, timezone, avatar, availability, and visibility preferences.
- Account: password and account recovery actions.
- Attendance: view personal attendance, login sessions, status, leave requests, and corrections.
- Requests: submit leave, attendance correction, or cross-team requests if permission allows.

Employees should not directly edit:

- role
- company assignment
- department assignment
- permission flags
- another user's profile
- attendance policy
- registration approvals
- audit records

Sensitive profile edits go through RPCs and database policies instead of trusting the browser.

Important RPCs:

- `update_my_profile`
- `request_leave`
- `request_attendance_correction`
- `record_attendance_login`
- `record_attendance_logout`

## Task Workflow

1. Admin, manager, or permitted employee creates a task.
2. The database validates company, actor, permission, assignee, department, priority, dates, task type, and tags.
3. Task is assigned and becomes visible to allowed users.
4. Assignee moves task into progress and adds comments or checklist updates.
5. If review is needed, task moves to review.
6. Reviewer, manager, or admin approves, rejects, or sends it back for rework.
7. Completion writes status history, task activity, and approval records.

Canonical flow:

`draft/pending -> assigned -> in_progress -> waiting/blocked -> under_review -> approved -> completed`

Important RPCs and triggers:

- `create_task_secure`
- `create_task_secure_v2`
- `transition_task`
- `guard_task_status_update`
- `create_next_daily_occurrence`
- `register_task_file`

## Request Workflow

1. Employee or admin creates a request such as hardware, access, travel, budget, leave, or training.
2. Request is assigned to a target department or reviewer.
3. Admin or manager reviews priority, reason, due date, and department.
4. Request moves through pending, in progress, approved, rejected, or completed.
5. Approved leave and attendance-related requests update attendance records through review RPCs.

Important RPCs:

- `request_leave`
- `review_leave_request`
- `request_attendance_correction`
- `review_attendance_correction`
- `resolve_leave_request`
- `resolve_attendance_correction`

## Meeting Workflow

1. Admin or manager schedules a meeting with title, time, agenda, department/team, and attendees.
2. Attendees are recorded and can receive in-app reminders.
3. During or after the meeting, decisions are recorded.
4. Follow-up action items are created from the meeting.
5. Action items become linked tasks assigned to employees.

Important RPCs:

- `create_meeting_action_item`
- `send_meeting_reminders`

## Attendance Workflow

1. User signs in.
2. Dashboard or attendance page calls `/api/attendance/login`.
3. The API route validates the bearer token.
4. The server extracts request IP, user agent, and context.
5. `record_attendance_login` records or updates the attendance session.
6. Attendance policy classifies the user as present, late, overtime, or on leave.
7. Heartbeats update `last_seen_at`.
8. Sign-out records logout through the attendance RPC.

Admin controls:

- view company attendance
- export attendance
- set attendance policy
- review leave requests
- review attendance corrections

Employee controls:

- view own attendance
- submit leave request
- request attendance correction

## RPC System Rules

RPC functions are the protected backend workflow layer. The UI is only an interaction layer.

- The browser should not directly update sensitive fields such as task status, role, company, permission flags, or approval state.
- RPCs derive the actor from Supabase Auth using `auth.uid()`.
- RPCs validate tenant/company ownership before writing data.
- RPCs check role and permission fields before allowing sensitive operations.
- RPCs write audit records, task activity, status history, and approval decisions in the same transaction where needed.
- RLS policies remain active on tables so direct reads/writes are still company-scoped.
- Database triggers protect sensitive fields when a client attempts direct updates.

Important security functions:

- `current_company_id`
- `my_company_id`
- `current_user_role`
- `is_admin`
- `is_manager`
- `can_manage_company_people`
- `can_manage_company_organization`
- `can_view_company_reports`
- `can_manage_company_meetings`
- `guard_profile_privileges`
- `guard_profile_sensitive_fields`

## Recommended Operating Process

1. Admin creates the company and configures organization settings.
2. Admin creates departments, teams, workspaces, roles, and attendance policy.
3. Employees register and request to join with the company code.
4. Admin approves employees with the correct role and permissions.
5. Employees complete profile and start using dashboard, tasks, attendance, requests, meetings, and files.
6. Admin monitors dashboard metrics, pending approvals, workload, attendance, meetings, and audit logs.
7. All sensitive actions use RPCs so approval, tenant, role, and workflow rules are enforced by the database.
