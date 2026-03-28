-- =====================================================
-- PRO PROFILE & POST VISIBILITY — Run in Supabase SQL Editor
-- =====================================================

-- ── NEW COLUMNS ──

-- posts: mark as original work (Pro) and per-post visibility
alter table public.posts
  add column if not exists is_pro_post boolean not null default false,
  add column if not exists visibility  text    not null default 'public'
    check (visibility in ('public', 'friends'));

-- profiles: personal profile privacy setting
alter table public.profiles
  add column if not exists personal_profile_public boolean not null default true;

-- ── INDEXES ──
create index if not exists idx_posts_is_pro_post      on public.posts (is_pro_post) where is_pro_post = true;
create index if not exists idx_posts_user_visibility  on public.posts (user_id, visibility, is_pro_post);
