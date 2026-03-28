-- =====================================================
-- MULTI-PROFESSION SUPPORT — Run in Supabase SQL Editor
-- =====================================================

-- Add professions array to profiles (primary profession stays in `profession`)
alter table public.profiles
  add column if not exists professions text[] not null default '{}';

-- Index for querying by discipline membership
create index if not exists idx_profiles_professions on public.profiles using gin (professions);
