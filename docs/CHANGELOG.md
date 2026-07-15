# Changelog

## Unreleased — Batch 2 (in progress)

### Implemented

- Organization administration for companies, brands, channels, teams and tags.
- Richer task classification, secure attachments, and daily recurrence occurrences.

### Verification

- ESLint and the Next.js production build pass.
- Batch 2 migration applied successfully to the linked Supabase project.
- Remote migration history, organization tables, and private attachment bucket verified.

## Unreleased — Batch 1

### Added

- Product requirements, architecture and phased implementation plan.
- Additive Supabase migration for task permissions, canonical statuses, immutable status history and attendance sessions.
- Atomic task creation and status-transition database functions with tenant, role and assignee validation.
- Mandatory transition comments, blocked/rework/reopen states and task types in the task interface.
- Attendance login capture, 8h30 workday timer, personal history and manager/admin company history.

### Changed

- Production builds no longer depend on downloading Google Fonts.
- Task list includes search and status/priority filters.

### Fixed

- Task detail dynamic-route deployment compatibility with Next.js 16.

### Verification

- ESLint passes.
- Next.js production build and TypeScript checks pass; dynamic task-detail and attendance routes are generated correctly.
- Migration is statically reviewed but still requires a staging Supabase apply/smoke test before production.
