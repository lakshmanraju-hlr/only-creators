-- =====================================================
-- GROUPS / COMMUNITIES — Run in Supabase SQL Editor
-- =====================================================

-- ── GROUPS TABLE ──
create table if not exists public.groups (
  id           uuid default uuid_generate_v4() primary key,
  discipline   text not null,
  name         text not null,
  slug         text not null unique,
  description  text not null default '',
  is_seeded    boolean not null default false,
  created_by   uuid references public.profiles(id) on delete set null,
  member_count integer not null default 0,
  post_count   integer not null default 0,
  created_at   timestamptz not null default now(),
  constraint groups_discipline_name_unique unique (discipline, name)
);

-- ── ADD group_id TO POSTS ──
alter table public.posts
  add column if not exists group_id uuid references public.groups(id) on delete set null;

-- ── INDEXES ──
create index if not exists idx_groups_discipline on public.groups (discipline);
create index if not exists idx_groups_slug       on public.groups (slug);
create index if not exists idx_posts_group_id    on public.posts (group_id) where group_id is not null;

-- ── RLS ──
alter table public.groups enable row level security;

drop policy if exists "groups_select" on public.groups;
drop policy if exists "groups_insert" on public.groups;
drop policy if exists "groups_update" on public.groups;
drop policy if exists "groups_delete" on public.groups;

create policy "groups_select" on public.groups for select using (true);
create policy "groups_insert" on public.groups for insert
  with check (
    auth.uid() = created_by and
    exists (select 1 from public.profiles where id = auth.uid() and profession is not null)
  );
create policy "groups_update" on public.groups for update using (auth.uid() = created_by);
-- Only the creator can delete, and only user-created (non-seeded) groups
create policy "groups_delete" on public.groups for delete
  using (auth.uid() = created_by and is_seeded = false);

grant select, insert, update, delete on public.groups to authenticated;

-- ── TRIGGER: keep post_count in sync ──
create or replace function public.handle_group_post_count()
returns trigger language plpgsql security definer as $$
begin
  if TG_OP = 'INSERT' and new.group_id is not null then
    update public.groups set post_count = post_count + 1 where id = new.group_id;
  elsif TG_OP = 'DELETE' and old.group_id is not null then
    update public.groups set post_count = greatest(post_count - 1, 0) where id = old.group_id;
  elsif TG_OP = 'UPDATE' and old.group_id is distinct from new.group_id then
    if old.group_id is not null then
      update public.groups set post_count = greatest(post_count - 1, 0) where id = old.group_id;
    end if;
    if new.group_id is not null then
      update public.groups set post_count = post_count + 1 where id = new.group_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists on_group_post_change on public.posts;
create trigger on_group_post_change
  after insert or update or delete on public.posts
  for each row execute procedure public.handle_group_post_count();

-- =====================================================
-- SEED DATA
-- =====================================================
insert into public.groups (discipline, name, slug, description, is_seeded) values

-- PHOTOGRAPHY
('photography','Portrait',           'portrait',              'The human face and form — character, emotion, and identity',         true),
('photography','Wildlife',           'wildlife',              'Untamed moments — animals, birds, and fauna in their element',       true),
('photography','Street Photography', 'street-photography',    'Life in public spaces — candid, raw, urban',                         true),
('photography','Fine Art',           'fine-art',              'Photography as expressive, gallery-ready art',                       true),
('photography','Travel',             'travel-photography',    'Landscapes, cultures, and moments from around the world',            true),
('photography','Sports Photography', 'sports-photography',    'Action, athletes, and the peak moment in sport',                     true),
('photography','Documentary',        'documentary-photography','Storytelling, reportage, and photojournalism',                      true),

-- MUSIC
('music','Vocals',            'vocals',            'Singing, vocal technique, and the human voice as instrument',        true),
('music','String Instruments','string-instruments','Guitar, violin, cello, bass, and all stringed instruments',          true),
('music','Wind Instruments',  'wind-instruments',  'Flute, saxophone, trumpet, clarinet, and wind instruments',          true),
('music','Music Production',  'music-production',  'Beats, DAW work, mixing, mastering, and production craft',           true),
('music','Live Performance',  'live-performance',  'Stage moments, concerts, gigs, and live show energy',                true),
('music','Music Theory',      'music-theory',      'Harmony, rhythm, composition, and the language of music',            true),

-- DANCE
('dance','Classical Dance',  'classical-dance',   'Ballet, bharatanatyam, and traditional classical forms',             true),
('dance','Contemporary',     'contemporary-dance','Contemporary and modern dance — floor work, release, and form',       true),
('dance','Street Dance',     'street-dance',      'Hip hop, breaking, popping, locking, krump, and street styles',      true),
('dance','Ballet',           'ballet',            'Classical and neoclassical ballet technique and performance',         true),
('dance','Folk Dance',       'folk-dance',        'Traditional and cultural dance forms from around the world',         true),
('dance','Choreography',     'choreography',      'Original routines and choreographic compositions',                   true),

-- ART
('art','Illustration',  'illustration',  'Digital and traditional illustration — characters, narrative, detail',  true),
('art','Oil Painting',  'oil-painting',  'Traditional oil on canvas — texture, colour, and technique',            true),
('art','Digital Art',   'digital-art',   'Digital painting, concept art, and pixel work',                         true),
('art','Sculpture',     'sculpture',     'Three-dimensional art — clay, stone, metal, and installation',           true),
('art','Mixed Media',   'mixed-media',   'Cross-medium work combining materials, textures, and approaches',        true),
('art','Street Art',    'street-art',    'Murals, graffiti, stencil, and public art',                              true),

-- FILM
('film','Cinematography', 'cinematography', 'Lighting, framing, camera movement, and visual language',            true),
('film','Film Editing',   'film-editing',   'Editing, color grading, VFX, and post-production craft',             true),
('film','Direction',      'direction',      'Directing, vision, storytelling, and the director''s craft',          true),
('film','Documentary',    'documentary',    'Non-fiction and documentary filmmaking',                               true),
('film','Short Film',     'short-film',     'Narrative short films — story, character, and craft',                 true),
('film','Animation',      'animation',      'Animated films, 2D, 3D, and motion graphics',                        true),

-- DESIGN
('design','Graphic Design',   'graphic-design',   'Visual communication, typography, and print/digital design',      true),
('design','Motion Design',    'motion-design',    'Animation, motion graphics, and kinetic typography',              true),
('design','UI Design',        'ui-design',        'Interface design, UX, and digital product design',               true),
('design','Interior Design',  'interior-design',  'Spatial design, architecture of interiors, and decor',           true),
('design','Fashion Design',   'fashion-design',   'Garment design, textiles, and fashion creation',                 true),
('design','Brand Identity',   'brand-identity',   'Logos, brand systems, and visual identity design',               true),

-- WRITING
('writing','Fiction',             'fiction',             'Novels, short stories, and narrative fiction',               true),
('writing','Poetry',              'poetry',              'Verse, spoken word, and poetic forms',                       true),
('writing','Journalism',          'journalism',          'Reporting, investigative writing, and news',                 true),
('writing','Screenwriting',       'screenwriting',       'Scripts, story structure, dialogue, and the written word',  true),
('writing','Creative Nonfiction', 'creative-nonfiction', 'Essays, memoirs, and narrative nonfiction',                 true),
('writing','Technical Writing',   'technical-writing',   'Documentation, instructional writing, and clarity',         true),

-- FITNESS
('fitness','Strength Training', 'strength-training', 'Weightlifting, powerlifting, and resistance training',          true),
('fitness','Yoga',              'yoga',              'Asana, breathwork, and the full spectrum of yoga practice',      true),
('fitness','Martial Arts',      'martial-arts',      'Combat sports, self-defence, and martial disciplines',           true),
('fitness','Cardio',            'cardio',            'Running, cycling, HIIT, and cardiovascular training',           true),
('fitness','Sports Rehab',      'sports-rehab',      'Injury recovery, physiotherapy, and athletic rehabilitation',   true),
('fitness','Nutrition',         'nutrition',         'Diet, fuelling, supplements, and sports nutrition',             true),

-- CULINARY
('culinary','Baking',          'baking',          'Bread, pastry, cakes, and the craft of baking',                   true),
('culinary','Plating',         'plating',         'Presentation, garnish, and the art of the plate',                 true),
('culinary','World Cuisine',   'world-cuisine',   'Global flavours, regional traditions, and cross-cultural cooking', true),
('culinary','Fermentation',    'fermentation',    'Sourdough, kimchi, koji, and the craft of fermentation',           true),
('culinary','Pastry',          'pastry',          'Fine pastry, confections, chocolate, and sugar work',              true),
('culinary','Beverage Arts',   'beverage-arts',   'Coffee, cocktails, wine, tea, and the art of the drink',          true),

-- TECHNOLOGY
('technology','Web Development', 'web-development', 'Frontend, backend, and full-stack web development',              true),
('technology','Mobile Dev',      'mobile-dev',      'iOS, Android, and cross-platform mobile development',            true),
('technology','AI Research',     'ai-research',     'Machine learning, LLMs, and artificial intelligence research',   true),
('technology','Open Source',     'open-source',     'Open source projects, contributions, and community',             true),
('technology','Hardware',        'hardware',        'Electronics, embedded systems, and hardware hacking',             true),
('technology','Cybersecurity',   'cybersecurity',   'Security research, ethical hacking, and digital defence',        true),

-- FASHION
('fashion','Personal Styling',    'personal-styling',    'Outfit curation, styling advice, and personal expression',  true),
('fashion','Tailoring',           'tailoring',           'Bespoke garments, alterations, and the craft of tailoring',  true),
('fashion','Accessories',         'accessories',         'Jewellery, bags, shoes, and accessory design',               true),
('fashion','Streetwear',          'streetwear',          'Street style, hype culture, and urban fashion',               true),
('fashion','Sustainable Fashion', 'sustainable-fashion', 'Ethical fashion, upcycling, and conscious style',            true),

-- SPORTS
('sports','Football',      'football',      'Football — tactics, skills, and the beautiful game',                    true),
('sports','Basketball',    'basketball',    'Basketball — the court, the game, and the culture',                     true),
('sports','Cricket',       'cricket',       'Cricket — batting, bowling, fielding, and the spirit of the game',      true),
('sports','Athletics',     'athletics',     'Track, field, and competitive athletics',                               true),
('sports','Swimming',      'swimming',      'Pool and open water swimming — technique, training, and competition',   true),
('sports','Combat Sports', 'combat-sports', 'Boxing, MMA, wrestling, and all combat disciplines',                   true)

on conflict (discipline, name) do nothing;
