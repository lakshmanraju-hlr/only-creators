-- =====================================================
-- STEP 1: Run this first to diagnose the problem
-- Paste into Supabase SQL Editor and click Run
-- =====================================================

-- Check if posts exist in the table
select id, user_id, content_type, caption, media_url, created_at 
from public.posts 
order by created_at desc 
limit 10;

-- Check if profiles exist
select id, username, full_name, post_count 
from public.profiles 
limit 10;

-- Check RLS is not blocking (run as service role)
select count(*) as total_posts from public.posts;
select count(*) as total_profiles from public.profiles;
