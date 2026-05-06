-- Demo/preload creator research bundles.
--
-- These rows are public-source context keyed by Instagram handle, fetched
-- only by the Worker with the service role. They are deliberately not
-- exposed to anon/authenticated clients because source summaries may contain
-- editorial notes and should be mediated through generation prompts.

create table if not exists public.creator_research_profiles (
  ig_handle text primary key,
  display_name text not null,
  summary text not null,
  known_for text[] not null default '{}',
  audience_notes text[] not null default '{}',
  content_angles text[] not null default '{}',
  brand_safety_notes text[] not null default '{}',
  source_urls jsonb not null default '[]'::jsonb,
  source_summaries jsonb not null default '{}'::jsonb,
  confidence text not null default 'medium',
  is_active boolean not null default true,
  last_researched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.creator_research_profiles enable row level security;

revoke all on public.creator_research_profiles from anon, authenticated;
grant select, insert, update, delete on public.creator_research_profiles to service_role;

create index if not exists creator_research_profiles_active_idx
  on public.creator_research_profiles (is_active, last_researched_at desc);

