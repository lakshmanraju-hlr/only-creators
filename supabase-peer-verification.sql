-- ─────────────────────────────────────────────────────────────────
-- Peer verification system
-- ─────────────────────────────────────────────────────────────────

-- 1. peer_verifications table
create table if not exists public.peer_verifications (
  id          uuid default gen_random_uuid() primary key,
  verifier_id uuid not null references public.profiles(id) on delete cascade,
  verified_id uuid not null references public.profiles(id) on delete cascade,
  discipline  text not null,
  created_at  timestamptz default now(),
  unique (verifier_id, verified_id)
);

alter table public.peer_verifications enable row level security;

create policy "pv_select" on public.peer_verifications for select using (true);
create policy "pv_insert" on public.peer_verifications for insert
  with check (auth.uid() = verifier_id and verifier_id <> verified_id);
create policy "pv_delete" on public.peer_verifications for delete
  using (auth.uid() = verifier_id);

grant select, insert, delete on public.peer_verifications to authenticated;

-- 2. verification_count column on profiles
alter table public.profiles
  add column if not exists verification_count int not null default 0;

-- 3. Trigger to keep verification_count in sync
create or replace function public.update_verification_count()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' then
    update public.profiles
      set verification_count = verification_count + 1
      where id = NEW.verified_id;
  elsif TG_OP = 'DELETE' then
    update public.profiles
      set verification_count = greatest(0, verification_count - 1)
      where id = OLD.verified_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_verification_count on public.peer_verifications;
create trigger trg_verification_count
  after insert or delete on public.peer_verifications
  for each row execute function public.update_verification_count();

-- 4. Add peer_verify to the notifications type enum (if using enum)
-- If your notifications.type is a plain text column this is not needed.
-- alter type notification_type add value if not exists 'peer_verify';
