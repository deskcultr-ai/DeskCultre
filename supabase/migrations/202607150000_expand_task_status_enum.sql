-- Enum values must be committed before later migrations reference them.
alter type public.task_status add value if not exists 'draft';
alter type public.task_status add value if not exists 'assigned';
alter type public.task_status add value if not exists 'waiting';
alter type public.task_status add value if not exists 'blocked';
alter type public.task_status add value if not exists 'under_review';
alter type public.task_status add value if not exists 'rework';
alter type public.task_status add value if not exists 'reopened';
