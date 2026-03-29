-- Add interests and post_formats columns to profiles
alter table public.profiles
  add column if not exists interests text[] not null default '{}',
  add column if not exists post_formats text[] not null default '{}';

-- Index for interest-based feed filtering (future use)
create index if not exists idx_profiles_interests on public.profiles using gin (interests);

-- Add medicine + new disciplines support (no DB changes needed — stored as strings in profession column)
-- Ensure the profiles table has the professions column (may already exist)
alter table public.profiles
  add column if not exists professions text[] not null default '{}';
