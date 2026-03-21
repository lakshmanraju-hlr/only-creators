-- =====================================================
-- RLS FIX — Run this in Supabase SQL Editor
-- Fixes "Failed to load posts" by ensuring the
-- profiles join works for the posts query
-- =====================================================

-- Drop and recreate the posts select policy to be explicit
drop policy if exists "Posts are viewable by everyone" on public.posts;
create policy "Posts are viewable by everyone"
  on public.posts for select using (true);

-- Ensure profiles are readable by everyone (needed for the join)
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);

-- Grant usage on the tables to the anon role (sometimes missing)
grant select on public.posts to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select on public.likes to anon, authenticated;
grant select on public.pro_upvotes to anon, authenticated;
grant select on public.comments to anon, authenticated;
grant select on public.follows to anon, authenticated;
grant select on public.notifications to authenticated;

grant insert on public.posts to authenticated;
grant insert on public.likes to authenticated;
grant insert on public.pro_upvotes to authenticated;
grant insert on public.comments to authenticated;
grant insert on public.follows to authenticated;
grant insert on public.notifications to authenticated;

grant delete on public.likes to authenticated;
grant delete on public.pro_upvotes to authenticated;
grant delete on public.comments to authenticated;
grant delete on public.follows to authenticated;

grant update on public.posts to authenticated;
grant update on public.profiles to authenticated;
grant update on public.notifications to authenticated;
