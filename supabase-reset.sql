-- =====================================================
-- FULL RESET — Run this in Supabase SQL Editor
-- This replaces the original schema entirely
-- =====================================================

-- Drop everything and start clean
drop table if exists public.notifications cascade;
drop table if exists public.comments cascade;
drop table if exists public.pro_upvotes cascade;
drop table if exists public.likes cascade;
drop table if exists public.follows cascade;
drop table if exists public.posts cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.handle_follow() cascade;
drop function if exists public.handle_like() cascade;
drop function if exists public.handle_pro_upvote() cascade;
drop function if exists public.handle_comment() cascade;
drop function if exists public.handle_post_count() cascade;

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── PROFILES ──
create table public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  username        text unique not null,
  full_name       text not null default '',
  bio             text not null default '',
  avatar_url      text not null default '',
  website         text not null default '',
  profession      text default null,
  is_pro          boolean not null default false,
  follower_count  integer not null default 0,
  following_count integer not null default 0,
  post_count      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── POSTS ──
create table public.posts (
  id               uuid not null default uuid_generate_v4() primary key,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  content_type     text not null default 'text',
  caption          text not null default '',
  poem_text        text not null default '',
  media_url        text not null default '',
  media_path       text not null default '',
  tags             text[] not null default '{}',
  like_count       integer not null default 0,
  comment_count    integer not null default 0,
  share_count      integer not null default 0,
  pro_upvote_count integer not null default 0,
  created_at       timestamptz not null default now()
);

-- ── FOLLOWS ──
create table public.follows (
  follower_id  uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id)
);

-- ── LIKES ──
create table public.likes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  post_id    uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ── PRO UPVOTES ──
create table public.pro_upvotes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  post_id    uuid not null references public.posts(id) on delete cascade,
  profession text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ── COMMENTS ──
create table public.comments (
  id         uuid not null default uuid_generate_v4() primary key,
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null default '',
  created_at timestamptz not null default now()
);

-- ── NOTIFICATIONS ──
create table public.notifications (
  id         uuid not null default uuid_generate_v4() primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  actor_id   uuid references public.profiles(id) on delete cascade,
  type       text not null default 'like',
  post_id    uuid references public.posts(id) on delete cascade,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── RLS ──
alter table public.profiles      enable row level security;
alter table public.posts          enable row level security;
alter table public.follows        enable row level security;
alter table public.likes          enable row level security;
alter table public.pro_upvotes    enable row level security;
alter table public.comments       enable row level security;
alter table public.notifications  enable row level security;

-- Profiles
create policy "profiles_select" on public.profiles for select using (true);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Posts
create policy "posts_select" on public.posts for select using (true);
create policy "posts_insert" on public.posts for insert with check (auth.uid() = user_id);
create policy "posts_update" on public.posts for update using (auth.uid() = user_id);
create policy "posts_delete" on public.posts for delete using (auth.uid() = user_id);

-- Follows
create policy "follows_select" on public.follows for select using (true);
create policy "follows_insert" on public.follows for insert with check (auth.uid() = follower_id);
create policy "follows_delete" on public.follows for delete using (auth.uid() = follower_id);

-- Likes
create policy "likes_select" on public.likes for select using (true);
create policy "likes_insert" on public.likes for insert with check (auth.uid() = user_id);
create policy "likes_delete" on public.likes for delete using (auth.uid() = user_id);

-- Pro upvotes
create policy "pro_upvotes_select" on public.pro_upvotes for select using (true);
create policy "pro_upvotes_insert" on public.pro_upvotes for insert with check (auth.uid() = user_id);
create policy "pro_upvotes_delete" on public.pro_upvotes for delete using (auth.uid() = user_id);

-- Comments
create policy "comments_select" on public.comments for select using (true);
create policy "comments_insert" on public.comments for insert with check (auth.uid() = user_id);
create policy "comments_delete" on public.comments for delete using (auth.uid() = user_id);

-- Notifications
create policy "notif_select" on public.notifications for select using (auth.uid() = user_id);
create policy "notif_insert" on public.notifications for insert with check (true);
create policy "notif_update" on public.notifications for update using (auth.uid() = user_id);

-- ── GRANTS ──
grant usage on schema public to anon, authenticated;
grant select on public.profiles     to anon, authenticated;
grant select on public.posts        to anon, authenticated;
grant select on public.follows      to anon, authenticated;
grant select on public.likes        to anon, authenticated;
grant select on public.pro_upvotes  to anon, authenticated;
grant select on public.comments     to anon, authenticated;
grant select on public.notifications to authenticated;

grant insert, update, delete on public.posts        to authenticated;
grant insert, update          on public.profiles     to authenticated;
grant insert, delete          on public.follows      to authenticated;
grant insert, delete          on public.likes        to authenticated;
grant insert, delete          on public.pro_upvotes  to authenticated;
grant insert, delete          on public.comments     to authenticated;
grant insert, update          on public.notifications to authenticated;

-- ── TRIGGERS ──
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.handle_follow()
returns trigger language plpgsql security definer as $$
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
$$;
create trigger on_follow_change after insert or delete on public.follows
  for each row execute procedure public.handle_follow();

create or replace function public.handle_like()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger on_like_change after insert or delete on public.likes
  for each row execute procedure public.handle_like();

create or replace function public.handle_pro_upvote()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set pro_upvote_count = pro_upvote_count + 1 where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set pro_upvote_count = greatest(pro_upvote_count - 1, 0) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger on_pro_upvote_change after insert or delete on public.pro_upvotes
  for each row execute procedure public.handle_pro_upvote();

create or replace function public.handle_comment()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger on_comment_change after insert or delete on public.comments
  for each row execute procedure public.handle_comment();

create or replace function public.handle_post_count()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update public.profiles set post_count = post_count + 1 where id = new.user_id;
  elsif TG_OP = 'DELETE' then
    update public.profiles set post_count = greatest(post_count - 1, 0) where id = old.user_id;
  end if;
  return coalesce(new, old);
end;
$$;
create trigger on_post_count_change after insert or delete on public.posts
  for each row execute procedure public.handle_post_count();

-- ── STORAGE BUCKETS ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880,   array['image/jpeg','image/png','image/webp','image/gif']),
  ('posts',   'posts',   true, 524288000, array['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime','audio/mpeg','audio/wav','audio/ogg','application/pdf'])
on conflict (id) do nothing;

-- Storage policies (drop first to avoid conflicts)
drop policy if exists "Avatar images are publicly accessible"    on storage.objects;
drop policy if exists "Users can upload their own avatar"        on storage.objects;
drop policy if exists "Users can update their own avatar"        on storage.objects;
drop policy if exists "Post media is publicly accessible"        on storage.objects;
drop policy if exists "Authenticated users can upload post media" on storage.objects;
drop policy if exists "Users can delete their own post media"    on storage.objects;

create policy "Avatar images are publicly accessible"
  on storage.objects for select using (bucket_id = 'avatars');
create policy "Users can upload their own avatar"
  on storage.objects for insert with check (bucket_id = 'avatars' and auth.uid() is not null);
create policy "Users can update their own avatar"
  on storage.objects for update using (bucket_id = 'avatars' and auth.uid() is not null);
create policy "Post media is publicly accessible"
  on storage.objects for select using (bucket_id = 'posts');
create policy "Authenticated users can upload post media"
  on storage.objects for insert with check (bucket_id = 'posts' and auth.uid() is not null);
create policy "Users can delete their own post media"
  on storage.objects for delete using (bucket_id = 'posts' and auth.uid() is not null);
