create table if not exists public.brand_intel (
  domain text primary key,
  brand_name text,
  creator_readiness_score integer not null default 0,
  marketing_activity_score integer not null default 0,
  outreach_priority_score integer not null default 0,
  creator_program_url text,
  creator_program_title text,
  creator_program_confidence text,
  ad_activity jsonb not null default '{}'::jsonb,
  ig_signal jsonb not null default '{}'::jsonb,
  signals jsonb not null default '[]'::jsonb,
  source_urls jsonb not null default '[]'::jsonb,
  raw_sources jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.brand_intel enable row level security;

revoke all on public.brand_intel from anon, authenticated;
grant select, insert, update, delete on public.brand_intel to service_role;

create index if not exists brand_intel_last_checked_at_idx
  on public.brand_intel (last_checked_at desc);

create index if not exists brand_intel_outreach_priority_score_idx
  on public.brand_intel (outreach_priority_score desc);
