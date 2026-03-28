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

-- PHOTOGRAPHER
('photographer','Wildlife',         'wildlife-photography',     'Untamed moments — animals, birds, and fauna in their element',    true),
('photographer','Portrait',         'portrait-photography',     'The human face and form — character, emotion, and identity',      true),
('photographer','Street',           'street-photography',       'Life in public spaces — candid, raw, urban',                      true),
('photographer','Landscape',        'landscape-photography',    'Vistas, skies, golden hours, and the great outdoors',             true),
('photographer','Architecture',     'architecture-photography', 'Buildings, interiors, structure, and spatial design',             true),
('photographer','Black & White',    'bw-photography',           'Monochrome and grayscale — shadow, contrast, and form',           true),
('photographer','Macro',            'macro-photography',        'Extreme close-up and fine detail — the world made huge',          true),
('photographer','Astrophotography', 'astrophotography',         'Stars, galaxies, the Milky Way, and the night sky',               true),
('photographer','Documentary',      'documentary-photography',  'Storytelling, reportage, and photojournalism',                    true),

-- SINGER
('singer','Originals',        'singer-originals',       'Original songs and compositions',                                true),
('singer','Covers',           'singer-covers',          'Covers, tributes, and reinterpretations',                        true),
('singer','Acoustic Sessions','acoustic-sessions',       'Stripped-back, intimate acoustic performances',                  true),
('singer','Songwriting',      'singer-songwriting',      'Lyrics, melodies, hooks — the craft of writing songs',           true),
('singer','Live Performance', 'singer-live',             'Stage moments, concerts, and live show energy',                  true),
('singer','Vocal Technique',  'vocal-technique',         'Runs, melisma, range, exercises, and vocal development',         true),
('singer','Collaborations',   'singer-collabs',          'Duets, features, and multi-artist work',                         true),
('singer','Studio Sessions',  'studio-sessions-singer',  'Behind-the-scenes recording and booth moments',                  true),
('singer','A Cappella',       'a-cappella',              'Voice-only — harmonies, choirs, and no instrumentation',         true),

-- MUSICIAN
('musician','Guitar',            'guitar',              'Acoustic, electric, and classical guitar — all styles',          true),
('musician','Piano & Keys',      'piano-keys',          'Piano, keyboard, synth, and organ',                              true),
('musician','Drums & Percussion','drums-percussion',     'Rhythm, grooves, fills, and percussion of all kinds',            true),
('musician','Bass',              'bass',                'Bass guitar, upright bass, slap, and low-end groove',            true),
('musician','Composition',       'musician-composition', 'Original compositions, scores, and arrangements',               true),
('musician','Jazz',              'jazz',                'Jazz improvisation, standards, bebop, and swing',                true),
('musician','Production',        'music-production',    'Beats, DAW work, mixing, mastering, and music production',       true),
('musician','Classical',         'classical-music',     'Orchestra, chamber music, and classical repertoire',             true),
('musician','Improvisation',     'improvisation',       'Free improvisation, experimental, and unscripted music',         true),

-- POET
('poet','Spoken Word',    'spoken-word',       'Performed and spoken poetry — slam, open mic, and recital',       true),
('poet','Love & Romance', 'love-poetry',       'Romance, longing, desire, and the heart in verse',               true),
('poet','Haiku',          'haiku',             'Japanese short-form poetry — brevity, nature, and the moment',   true),
('poet','Political',      'political-poetry',  'Social justice, protest, and political commentary in verse',     true),
('poet','Nature',         'nature-poetry',     'The natural world — forests, rain, seasons, and the earth',      true),
('poet','Experimental',   'experimental-poetry','Form-breaking and avant-garde verse',                           true),
('poet','Prose Poetry',   'prose-poetry',      'The boundary between poetry and prose — lyric essays, vignettes',true),
('poet','Grief & Healing','grief-healing',     'Loss, trauma, recovery, and hope expressed through verse',       true),
('poet','Mythology',      'mythology-poetry',  'Folklore, myth, legend, and archetype in poetry',                true),

-- VISUAL-ARTIST
('visual-artist','Digital Art',      'digital-art',       'Digital illustration, concept art, and painting',              true),
('visual-artist','Oil Painting',     'oil-painting',      'Traditional oil on canvas — texture, colour, and technique',   true),
('visual-artist','Watercolor',       'watercolor',        'Fluid, transparent watercolor work',                           true),
('visual-artist','Sketch & Drawing', 'sketch-drawing',    'Pencil, ink, charcoal, and line-based drawing',                true),
('visual-artist','Sculpture',        'sculpture',         'Three-dimensional and tactile art — clay, stone, metal',       true),
('visual-artist','Abstract',         'abstract-art',      'Non-representational visual expression',                       true),
('visual-artist','Character Design', 'character-design',  'Characters, creatures, OCs, and concept art',                  true),
('visual-artist','Printmaking',      'printmaking',       'Etching, lithograph, screen print, and linocut',               true),
('visual-artist','Street Art',       'street-art',        'Murals, graffiti, stencil, and public art',                    true),

-- FILMMAKER
('filmmaker','Short Film',       'short-film',         'Narrative short films — story, character, and craft',            true),
('filmmaker','Documentary',      'documentary-film',   'Non-fiction and documentary filmmaking',                         true),
('filmmaker','Cinematography',   'cinematography',     'Lighting, framing, camera movement, and visual language',        true),
('filmmaker','Editing & Post',   'editing-post',       'Editing, color grading, VFX, and post-production',              true),
('filmmaker','Animation',        'animation',          'Animated films, 2D, 3D, and motion graphics',                   true),
('filmmaker','Music Video',      'music-video',        'Music video production and visual storytelling',                 true),
('filmmaker','Experimental',     'experimental-film',  'Avant-garde and form-defying cinema',                           true),
('filmmaker','Behind the Scenes','behind-scenes',      'Process, making-of, and production diary content',              true),
('filmmaker','Screenwriting',    'screenwriting',      'Scripts, story structure, dialogue, and the written word',      true),

-- DANCER
('dancer','Contemporary',    'contemporary-dance',  'Contemporary and modern dance',                                  true),
('dancer','Hip Hop',         'hip-hop-dance',       'Hip hop, breaking, popping, locking, and street styles',         true),
('dancer','Ballet',          'ballet',              'Classical and neoclassical ballet',                              true),
('dancer','Latin',           'latin-dance',         'Salsa, bachata, samba, and Latin partner dance',                 true),
('dancer','Choreography',    'choreography',        'Original routines and choreographic compositions',               true),
('dancer','Improvisation',   'dance-improvisation', 'Unscripted and improvisational movement',                        true),
('dancer','Cultural Dance',  'cultural-dance',      'Traditional and cultural dance forms from around the world',     true),
('dancer','Fusion',          'dance-fusion',        'Cross-genre and fusion dance styles',                           true),
('dancer','Pointe & Classical','pointe-classical',  'Pointe work, variations, and classical technique',              true),

-- COMEDIAN
('comedian','Stand-Up',         'stand-up',           'Stand-up comedy sets and original bits',                       true),
('comedian','Sketches',         'comedy-sketches',    'Written and performed sketch comedy',                          true),
('comedian','Improv',           'improv-comedy',      'Improvised and unscripted comedy',                             true),
('comedian','Satire',           'satire',             'Satirical takes on current events and society',                true),
('comedian','Observational',    'observational-comedy','Everyday life, relatable humor, and slice-of-life comedy',    true),
('comedian','Dark Humor',       'dark-humor',         'Edgy, dark, and taboo comedy',                                 true),
('comedian','Character Comedy', 'character-comedy',   'Characters, impressions, and personas',                       true),
('comedian','Written Jokes',    'written-jokes',      'Tweets, one-liners, puns, and written comedy',                true),
('comedian','Physical Comedy',  'physical-comedy',    'Slapstick, mime, and physicality-based humor',                true)

on conflict (discipline, name) do nothing;
