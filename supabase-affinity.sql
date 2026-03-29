-- ─────────────────────────────────────────────────────────────────
-- User discipline affinity — tracks engagement signals per discipline
-- Used to personalize the "For You" feed
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.user_discipline_scores (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  discipline text not null,
  score      int  not null default 0,
  updated_at timestamptz default now(),
  primary key (user_id, discipline)
);

alter table public.user_discipline_scores enable row level security;

create policy "uds_select" on public.user_discipline_scores
  for select using (auth.uid() = user_id);

create policy "uds_all" on public.user_discipline_scores
  for all using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_discipline_scores to authenticated;

-- ─────────────────────────────────────────────────────────────────
-- Atomic upsert RPC — call from client to avoid read-modify-write races
-- p_delta: +1 like, +2 comment, +1 share, +5 pro_upvote
-- ─────────────────────────────────────────────────────────────────
create or replace function public.increment_discipline_score(
  p_user_id    uuid,
  p_discipline text,
  p_delta      int default 1
) returns void language plpgsql security definer as $$
begin
  insert into public.user_discipline_scores (user_id, discipline, score, updated_at)
  values (p_user_id, p_discipline, greatest(0, p_delta), now())
  on conflict (user_id, discipline) do update
    set score      = greatest(0, user_discipline_scores.score + p_delta),
        updated_at = now();
end;
$$;
