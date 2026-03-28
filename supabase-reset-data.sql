-- =====================================================
-- RESET ALL USER DATA — Supabase SQL Editor
-- ⚠️  IRREVERSIBLE. Deletes all users, posts, and
--     activity. Keeps seeded group definitions.
-- =====================================================

-- Disable triggers temporarily to speed up deletes
set session_replication_role = replica;

-- ── Activity / messaging ──
truncate table public.messages                  restart identity cascade;
truncate table public.conversation_participants restart identity cascade;
truncate table public.conversations             restart identity cascade;
truncate table public.notifications             restart identity cascade;

-- ── Social graph ──
truncate table public.friend_requests restart identity cascade;
truncate table public.follows         restart identity cascade;

-- ── Post interactions ──
truncate table public.pro_upvotes restart identity cascade;
truncate table public.likes       restart identity cascade;
truncate table public.comments    restart identity cascade;

-- ── Content ──
truncate table public.posts restart identity cascade;

-- ── User-created groups only (keep seeded discipline groups) ──
delete from public.groups where is_seeded = false;

-- Reset post_count on seeded groups back to zero
update public.groups set post_count = 0, member_count = 0;

-- ── Profiles ──
truncate table public.profiles restart identity cascade;

-- Re-enable triggers
set session_replication_role = default;

-- ── Auth users (runs last — profiles FK depends on this) ──
delete from auth.users;

-- =====================================================
-- DONE
-- After running this, also clear the storage bucket:
--   Supabase dashboard → Storage → posts → select all → delete
-- =====================================================
