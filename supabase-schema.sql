-- =====================================================
-- ONLY CREATORS — Complete Supabase Schema
-- Run this entire file in: Supabase Dashboard → SQL Editor
-- =====================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── PROFILES TABLE ──
-- Extends Supabase auth.users with creator-specific fields
create table public.profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  username      text unique not null,
  full_name     text not null,
  bio           text default '',
  avatar_url    text default '',
  website       text default '',
  profession    text default null, -- null = general account
  is_pro        boolean default false,
  follower_count  integer default 0,
  following_count integer default 0,
  post_count      integer default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ── POSTS TABLE ──
create table public.posts (
  id            uuid default uuid_generate_v4() primary key,
  user_id       uuid references public.profiles(id) on delete cascade not null,
  content_type  text not null check (content_type in ('text','photo','audio','video','poem','document')),
  caption       text default '',
  poem_text     text default '',
  media_url     text default '',  -- Supabase Storage URL
  media_path    text default '',  -- Storage bucket path for deletion
  tags          text[] default '{}',
  like_count        integer default 0,
  comment_count     integer default 0,
  share_count       integer default 0,
  pro_upvote_count  integer default 0,
  created_at    timestamptz default now()
);

-- ── FOLLOWS TABLE ──
create table public.follows (
  follower_id   uuid references public.profiles(id) on delete cascade,
  following_id  uuid references public.profiles(id) on delete cascade,
  created_at    timestamptz default now(),
  primary key (follower_id, following_id)
);

-- ── LIKES TABLE ──
create table public.likes (
  user_id     uuid references public.profiles(id) on delete cascade,
  post_id     uuid references public.posts(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (user_id, post_id)
);

-- ── PRO UPVOTES TABLE ──
-- A pro upvote can only be given if both users share the same profession
create table public.pro_upvotes (
  user_id     uuid references public.profiles(id) on delete cascade,
  post_id     uuid references public.posts(id) on delete cascade,
  profession  text not null, -- profession at time of upvote
  created_at  timestamptz default now(),
  primary key (user_id, post_id)
);

-- ── COMMENTS TABLE ──
create table public.comments (
  id          uuid default uuid_generate_v4() primary key,
  post_id     uuid references public.posts(id) on delete cascade not null,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  body        text not null,
  created_at  timestamptz default now()
);

-- ── NOTIFICATIONS TABLE ──
create table public.notifications (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null, -- recipient
  actor_id    uuid references public.profiles(id) on delete cascade,           -- who triggered it
  type        text not null check (type in ('like','pro_upvote','comment','follow','share','friend_request','friend_accepted','peer_verify','message')),
  post_id     uuid references public.posts(id) on delete cascade,
  is_read     boolean default false,
  created_at  timestamptz default now()
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

alter table public.profiles    enable row level security;
alter table public.posts        enable row level security;
alter table public.follows      enable row level security;
alter table public.likes        enable row level security;
alter table public.pro_upvotes  enable row level security;
alter table public.comments     enable row level security;
alter table public.notifications enable row level security;

-- Profiles: anyone can read, only owner can update
create policy "Profiles are viewable by everyone"
  on public.profiles for select using (true);
create policy "Users can insert their own profile"
  on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile"
  on public.profiles for update using (auth.uid() = id);

-- Posts: anyone can read, only owner can insert/update/delete
create policy "Posts are viewable by everyone"
  on public.posts for select using (true);
create policy "Users can create posts"
  on public.posts for insert with check (auth.uid() = user_id);
create policy "Users can update their own posts"
  on public.posts for update using (auth.uid() = user_id);
create policy "Users can delete their own posts"
  on public.posts for delete using (auth.uid() = user_id);

-- Follows: anyone can read, authenticated users can follow
create policy "Follows are viewable by everyone"
  on public.follows for select using (true);
create policy "Authenticated users can follow"
  on public.follows for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow"
  on public.follows for delete using (auth.uid() = follower_id);

-- Likes
create policy "Likes are viewable by everyone"
  on public.likes for select using (true);
create policy "Authenticated users can like"
  on public.likes for insert with check (auth.uid() = user_id);
create policy "Users can unlike"
  on public.likes for delete using (auth.uid() = user_id);

-- Pro upvotes
create policy "Pro upvotes are viewable by everyone"
  on public.pro_upvotes for select using (true);
create policy "Pro users can upvote"
  on public.pro_upvotes for insert with check (auth.uid() = user_id);
create policy "Pro users can remove upvote"
  on public.pro_upvotes for delete using (auth.uid() = user_id);

-- Comments
create policy "Comments are viewable by everyone"
  on public.comments for select using (true);
create policy "Authenticated users can comment"
  on public.comments for insert with check (auth.uid() = user_id);
create policy "Users can delete their own comments"
  on public.comments for delete using (auth.uid() = user_id);

-- Notifications: only recipient can see their notifications
create policy "Users can see their own notifications"
  on public.notifications for select using (auth.uid() = user_id);
create policy "System can insert notifications"
  on public.notifications for insert with check (true);
create policy "Users can mark notifications read"
  on public.notifications for update using (auth.uid() = user_id);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Update follower/following counts
create or replace function public.handle_follow()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.profiles set follower_count  = follower_count  + 1 where id = new.following_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  elsif TG_OP = 'DELETE' then
    update public.profiles set follower_count  = greatest(follower_count  - 1, 0) where id = old.following_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger on_follow_change
  after insert or delete on public.follows
  for each row execute procedure public.handle_follow();

-- Update like count on posts
create or replace function public.handle_like()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger on_like_change
  after insert or delete on public.likes
  for each row execute procedure public.handle_like();

-- Update pro_upvote count
create or replace function public.handle_pro_upvote()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set pro_upvote_count = pro_upvote_count + 1 where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set pro_upvote_count = greatest(pro_upvote_count - 1, 0) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger on_pro_upvote_change
  after insert or delete on public.pro_upvotes
  for each row execute procedure public.handle_pro_upvote();

-- Update comment count
create or replace function public.handle_comment()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger on_comment_change
  after insert or delete on public.comments
  for each row execute procedure public.handle_comment();

-- Update post count on profile
create or replace function public.handle_post_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.profiles set post_count = post_count + 1 where id = new.user_id;
  elsif TG_OP = 'DELETE' then
    update public.profiles set post_count = greatest(post_count - 1, 0) where id = old.user_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger on_post_count_change
  after insert or delete on public.posts
  for each row execute procedure public.handle_post_count();

-- =====================================================
-- STORAGE BUCKETS
-- Run these separately in SQL Editor if needed
-- =====================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',   'avatars',   true, 5242880,   array['image/jpeg','image/png','image/webp','image/gif']),
  ('posts',     'posts',     true, 524288000, array['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','audio/mpeg','audio/wav','audio/ogg','application/pdf'])
on conflict (id) do nothing;

-- Storage policies
create policy "Avatar images are publicly accessible"
  on storage.objects for select using (bucket_id = 'avatars');
create policy "Users can upload their own avatar"
  on storage.objects for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "Users can update their own avatar"
  on storage.objects for update using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Post media is publicly accessible"
  on storage.objects for select using (bucket_id = 'posts');
create policy "Authenticated users can upload post media"
  on storage.objects for insert with check (bucket_id = 'posts' and auth.uid() is not null);
create policy "Users can delete their own post media"
  on storage.objects for delete using (bucket_id = 'posts' and auth.uid()::text = (storage.foldername(name))[1]);
