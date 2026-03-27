-- =====================================================
-- FRIENDS SYSTEM — Run in Supabase SQL Editor
-- Adds friend requests + mutual friendship on top of
-- the existing follows system
-- =====================================================

-- ── FRIEND REQUESTS TABLE ──
create table if not exists public.friend_requests (
  id          uuid not null default uuid_generate_v4() primary key,
  sender_id   uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (sender_id, receiver_id)
);

-- ── RLS ──
alter table public.friend_requests enable row level security;

create policy "fr_select" on public.friend_requests for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "fr_insert" on public.friend_requests for insert
  with check (auth.uid() = sender_id);
create policy "fr_update" on public.friend_requests for update
  using (auth.uid() = receiver_id or auth.uid() = sender_id);
create policy "fr_delete" on public.friend_requests for delete
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- ── GRANTS ──
grant select, insert, update, delete on public.friend_requests to authenticated;

-- ── ADD friend_count TO PROFILES ──
alter table public.profiles
  add column if not exists friend_count integer not null default 0;

-- ── NOTIFICATION TYPE: friend_request, friend_accepted ──
-- (The notifications table already allows any text for 'type' so no change needed)

-- ── VIEW: easy friend lookup ──
-- Returns all accepted friendships as flat pairs
create or replace view public.friendships as
  select sender_id as user_id, receiver_id as friend_id
  from public.friend_requests where status = 'accepted'
  union all
  select receiver_id as user_id, sender_id as friend_id
  from public.friend_requests where status = 'accepted';

grant select on public.friendships to authenticated, anon;

-- ── RPC FUNCTIONS for friend counts ──
create or replace function public.increment_friend_counts(uid1 uuid, uid2 uuid)
returns void language plpgsql security definer as $$
begin
  update public.profiles set friend_count = friend_count + 1 where id = uid1;
  update public.profiles set friend_count = friend_count + 1 where id = uid2;
end;
$$;

create or replace function public.decrement_friend_counts(uid1 uuid, uid2 uuid)
returns void language plpgsql security definer as $$
begin
  update public.profiles set friend_count = greatest(friend_count - 1, 0) where id = uid1;
  update public.profiles set friend_count = greatest(friend_count - 1, 0) where id = uid2;
end;
$$;

grant execute on function public.increment_friend_counts to authenticated;
grant execute on function public.decrement_friend_counts to authenticated;
