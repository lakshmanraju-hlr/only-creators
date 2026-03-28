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

-- Drop existing policies so we can recreate them safely
drop policy if exists "conv_select" on public.conversations;
drop policy if exists "conv_insert" on public.conversations;
drop policy if exists "cp_select" on public.conversation_participants;
drop policy if exists "cp_insert" on public.conversation_participants;
drop policy if exists "cp_update" on public.conversation_participants;
drop policy if exists "msg_select" on public.messages;
drop policy if exists "msg_insert" on public.messages;

create policy "conv_select" on public.conversations for select
  using (exists (select 1 from public.conversation_participants cp where cp.conversation_id = id and cp.user_id = auth.uid()));
create policy "conv_insert" on public.conversations for insert with check (true);

create policy "cp_select" on public.conversation_participants for select using (auth.uid() = user_id);
create policy "cp_insert" on public.conversation_participants for insert with check (true);
create policy "cp_update" on public.conversation_participants for update using (auth.uid() = user_id);

create policy "msg_select" on public.messages for select
  using (exists (select 1 from public.conversation_participants cp where cp.conversation_id = messages.conversation_id and cp.user_id = auth.uid()));
create policy "msg_insert" on public.messages for insert with check (auth.uid() = sender_id);

grant select, insert on public.conversations to authenticated;
grant select, insert, update on public.conversation_participants to authenticated;
grant select, insert on public.messages to authenticated;

-- ── RPC: get or create a 1:1 conversation (security definer bypasses RLS) ──
create or replace function public.get_or_create_conversation(other_user_id uuid)
returns uuid language plpgsql security definer as $$
declare
  conv_id uuid;
begin
  select cp1.conversation_id into conv_id
  from public.conversation_participants cp1
  join public.conversation_participants cp2
    on cp1.conversation_id = cp2.conversation_id
  where cp1.user_id = auth.uid()
    and cp2.user_id = other_user_id
  limit 1;

  if conv_id is null then
    insert into public.conversations default values returning id into conv_id;
    insert into public.conversation_participants (conversation_id, user_id)
      values (conv_id, auth.uid()), (conv_id, other_user_id);
  end if;

  return conv_id;
end;
$$;

grant execute on function public.get_or_create_conversation to authenticated;
