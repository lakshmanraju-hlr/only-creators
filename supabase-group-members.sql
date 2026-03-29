-- ─────────────────────────────────────────────────────────────────
-- Group membership — lets users join / leave groups
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_members enable row level security;

create policy "gm_select" on public.group_members
  for select using (true);

create policy "gm_insert" on public.group_members
  for insert with check (auth.uid() = user_id);

create policy "gm_delete" on public.group_members
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.group_members to authenticated;

-- ── Trigger: maintain groups.member_count ──────────────────────
create or replace function public.handle_group_member_count()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update public.groups set member_count = member_count + 1 where id = new.group_id;
  elsif TG_OP = 'DELETE' then
    update public.groups set member_count = greatest(member_count - 1, 0) where id = old.group_id;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists on_group_member_change on public.group_members;
create trigger on_group_member_change
  after insert or delete on public.group_members
  for each row execute procedure public.handle_group_member_count();
