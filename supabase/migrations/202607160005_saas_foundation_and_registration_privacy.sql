begin;

-- Keeps commercial state separate from operational company data so FlowDesk can
-- move to a multi-workspace subscription product without a schema rewrite.
create table if not exists public.workspace_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  plan_key text not null default 'trial' check (plan_key in ('trial','starter','business','enterprise')),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled','suspended')),
  billing_provider text,
  provider_customer_id text,
  provider_subscription_id text,
  seats_included integer not null default 10 check (seats_included > 0),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspace_subscriptions_provider_customer_idx on public.workspace_subscriptions(provider_customer_id);
alter table public.workspace_subscriptions enable row level security;
create policy workspace_subscriptions_admin_select on public.workspace_subscriptions for select using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.company_id = workspace_subscriptions.company_id and p.role::text = 'admin')
);

-- A member can only read their own request through the status RPC; admins retain
-- queue access. The explicit policy avoids exposing other applicants' contact data.
create policy registration_requests_own_select on public.registration_requests for select using (auth_user_id = auth.uid());

create or replace function public.get_my_registration_status()
returns public.registration_requests language sql stable security definer set search_path=public as $$
 select * from public.registration_requests where auth_user_id = auth.uid();
$$;

grant select on public.workspace_subscriptions to authenticated;
commit;
