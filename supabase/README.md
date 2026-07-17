# DeskCulture — database

## Why the schema was rebuilt

The previous migration history (now in `legacy_migrations/`) was **incomplete**. It
altered core tables that no migration ever created:

| Table | Created by | Referenced by |
| --- | --- | --- |
| `profiles` | 0 migrations | 11 |
| `companies` | 0 migrations | 8 |
| `tasks` | 0 migrations | 4 |
| `departments` | 0 migrations | 3 |

The base schema had been built by hand in the original Supabase project's dashboard
and was never version-controlled, so those migrations could not recreate a database
from scratch — `supabase db push` against an empty project failed on the first
`alter table public.tasks`.

`migrations/20260717000000_init_deskculture.sql` is a fresh, self-contained baseline.
The legacy files are kept for reference only and are **not** applied.

## Applying the schema to a new project

### Option A — Supabase CLI (recommended)

Run these yourself (they're interactive and need credentials — don't paste secrets into chat):

```bash
npx supabase login                                  # opens a browser, stores a token
npx supabase link --project-ref <your-project-ref>  # prompts for the DB password
npx supabase db push                                # applies migrations/
```

### Option B — Dashboard SQL editor

Paste the contents of each file in `migrations/` (in filename order) into the
Supabase SQL editor and run them.

## Bootstrapping the first company

Every signup lands as `status = 'pending'` with `company_id = null`, and RLS only
lets an existing admin assign a company — so the first one must be created manually.

1. Sign up through the app with your email.
2. In the Supabase SQL editor, run:

```sql
select public.bootstrap_company('Your Company', 'you@company.com');
```

That creates the company and promotes you to `super_admin` / `active`.

After that, approve further signups from the app (or via SQL) with:

```sql
select public.approve_member('<profile-uuid>', 'member');
```

`bootstrap_company` has EXECUTE revoked from `anon`/`authenticated` — it is
SECURITY DEFINER, so if it were callable over RPC any signed-in user could create a
company and make themselves super_admin. Only run it from the SQL editor.

## Schema overview

Multi-tenant: every row carries a `company_id`. RLS isolates tenants via
`public.current_company_id()`, a SECURITY DEFINER helper (it bypasses RLS
internally, so `profiles`' own policy cannot recurse through it).

- **Tenancy** — `companies`, `departments`, `profiles`
- **Work** — `workspaces`, `workspace_members`, `tasks`, `task_checklist_items`,
  `task_comments`, `requests`
- **Meetings** — `meetings`, `meeting_attendees`
- **HR** — `attendance_sessions`, `leave_requests`
- **Comms** — `announcements`, `activity_log`, `notifications`
- **Chat** — `chat_channels`, `chat_channel_members`, `chat_messages`
- **Drive** — `drive_folders`, `drive_files` + a private `drive` storage bucket

Roles (`user_role`): `super_admin`, `admin`, `manager`, `member`, `guest`.
Helpers `is_admin()` / `is_manager()` back the policies.

## Local verification

With Docker running you can validate migrations before pushing:

```bash
npx supabase start   # boots local Postgres and applies migrations/
npx supabase stop
```
