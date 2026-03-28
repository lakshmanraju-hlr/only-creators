-- =====================================================
-- MESSAGES SYSTEM — Run in Supabase SQL Editor
-- =====================================================

-- ── CONVERSATIONS TABLE ──
create table if not exists public.conversations (
  id          uuid default uuid_generate_v4() primary key,
  created_at  timestamptz default now()
);

-- ── CONVERSATION PARTICIPANTS TABLE ──
create table if not exists public.conversation_participants (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete cascade,
  last_read_at    timestamptz default now(),
  primary key (conversation_id, user_id)
);

-- ── MESSAGES TABLE ──
create table if not exists public.messages (
  id              uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id       uuid references public.profiles(id) on delete cascade not null,
  body            text,
  post_id         uuid references public.posts(id) on delete set null,
  created_at      timestamptz default now()
);

-- ── RLS ──
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;

create policy "conv_select" on public.conversations for select
  using (exists (select 1 from public.conversation_participants cp where cp.conversation_id = id and cp.user_id = auth.uid()));
create policy "conv_insert" on public.conversations for insert with check (true);

-- Allow viewing all participants in conversations you belong to
-- (needed so client-side code can find shared conversations)
create policy "cp_select" on public.conversation_participants for select using (
  exists (
    select 1 from public.conversation_participants my_cp
    where my_cp.conversation_id = conversation_participants.conversation_id
      and my_cp.user_id = auth.uid()
  )
);
create policy "cp_insert" on public.conversation_participants for insert with check (true);
create policy "cp_update" on public.conversation_participants for update using (auth.uid() = user_id);

create policy "msg_select" on public.messages for select
  using (exists (select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()));
create policy "msg_insert" on public.messages for insert with check (auth.uid() = sender_id);

grant select, insert on public.conversations to authenticated;
grant select, insert, update on public.conversation_participants to authenticated;
grant select, insert on public.messages to authenticated;
