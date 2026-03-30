-- ─────────────────────────────────────────────────────────────────
-- V2 Architecture Migration
-- Run this in Supabase SQL editor
-- ─────────────────────────────────────────────────────────────────

-- 1. Discipline Personas
--    Each user can activate multiple professional personas.
--    One identity, many disciplines.
-- ─────────────────────────────────────────────────────────────────
create table if not exists public.discipline_personas (
  id            uuid         default gen_random_uuid() primary key,
  user_id       uuid         not null references public.profiles(id) on delete cascade,
  discipline    text         not null,   -- canonical discipline key e.g. 'photography', 'medicine'
  role_title    text,                    -- e.g. 'Street Photographer', 'Cardiologist'
  years_exp     int,
  bio           text,
  credentials   text,                    -- free text: degrees, certs, portfolio link
  level         text         not null default 'newcomer',  -- newcomer | contributor | expert | authority
  post_count    int          not null default 0,
  created_at    timestamptz  not null default now(),
  unique(user_id, discipline)
);

alter table public.discipline_personas enable row level security;

drop policy if exists "dp_select_public" on public.discipline_personas;
drop policy if exists "dp_insert_own"    on public.discipline_personas;
drop policy if exists "dp_update_own"    on public.discipline_personas;
drop policy if exists "dp_delete_own"    on public.discipline_personas;

create policy "dp_select_public"   on public.discipline_personas for select using (true);
create policy "dp_insert_own"      on public.discipline_personas for insert with check (auth.uid() = user_id);
create policy "dp_update_own"      on public.discipline_personas for update using (auth.uid() = user_id);
create policy "dp_delete_own"      on public.discipline_personas for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.discipline_personas to authenticated;

-- ─────────────────────────────────────────────────────────────────
-- 2. Add post_type + persona_discipline to posts
--    post_type: 'general' (everyone) or 'pro' (tagged to a discipline)
-- ─────────────────────────────────────────────────────────────────
alter table public.posts
  add column if not exists post_type          text not null default 'general',
  add column if not exists persona_discipline text;               -- only set on pro posts

-- ─────────────────────────────────────────────────────────────────
-- 3. Backfill: existing is_pro_post = true → post_type = 'pro'
-- ─────────────────────────────────────────────────────────────────
update public.posts
  set post_type = 'pro'
  where is_pro_post = true;

-- For pro posts, set persona_discipline from the author's profession
update public.posts p
  set persona_discipline = pr.profession
  from public.profiles pr
  where p.user_id = pr.id
    and p.post_type = 'pro'
    and pr.profession is not null
    and p.persona_discipline is null;

-- ─────────────────────────────────────────────────────────────────
-- 4. Backfill discipline_personas from existing profiles.profession
--    Any user who already has a profession gets a persona record
-- ─────────────────────────────────────────────────────────────────
insert into public.discipline_personas (user_id, discipline, level)
  select id, profession, 'newcomer'
  from public.profiles
  where profession is not null
on conflict (user_id, discipline) do nothing;

-- ─────────────────────────────────────────────────────────────────
-- 5. Trigger: keep discipline_personas.post_count in sync
-- ─────────────────────────────────────────────────────────────────
create or replace function public.handle_persona_post_count()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' and new.post_type = 'pro' and new.persona_discipline is not null then
    update public.discipline_personas
      set post_count = post_count + 1
      where user_id = new.user_id and discipline = new.persona_discipline;
  elsif TG_OP = 'DELETE' and old.post_type = 'pro' and old.persona_discipline is not null then
    update public.discipline_personas
      set post_count = greatest(post_count - 1, 0)
      where user_id = old.user_id and discipline = old.persona_discipline;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists on_post_persona_count on public.posts;
create trigger on_post_persona_count
  after insert or delete on public.posts
  for each row execute procedure public.handle_persona_post_count();

-- ─────────────────────────────────────────────────────────────────
-- 6. Level thresholds function
--    Automatically promote persona level based on post_count + engagement
-- ─────────────────────────────────────────────────────────────────
create or replace function public.get_persona_level(p_post_count int, p_pro_upvotes int)
returns text language plpgsql as $$
begin
  if p_post_count >= 50 and p_pro_upvotes >= 100 then return 'authority';
  elsif p_post_count >= 20 and p_pro_upvotes >= 30  then return 'expert';
  elsif p_post_count >= 5  and p_pro_upvotes >= 5   then return 'contributor';
  else return 'newcomer';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 7. Add role_title to profiles
--    Optional job title shown next to name (e.g. "Cardiologist", "Street Photographer")
-- ─────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists role_title text;
