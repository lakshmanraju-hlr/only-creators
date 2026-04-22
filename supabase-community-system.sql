-- =====================================================
-- COMMUNITY SYSTEM MIGRATION
-- Run in Supabase SQL Editor
-- =====================================================

-- ── 1. Add is_pro column to posts ──────────────────────────────────────────
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pro boolean NOT NULL DEFAULT false;

-- Sync is_pro with existing is_pro_post column
UPDATE public.posts SET is_pro = true WHERE is_pro_post = true;

-- ── 2. Add follower_count to groups (community pages) ──────────────────────
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS follower_count integer NOT NULL DEFAULT 0;

-- ── 3. post_subgroups — tags a post to a community (group) ─────────────────
CREATE TABLE IF NOT EXISTS public.post_subgroups (
  post_id     uuid REFERENCES public.posts ON DELETE CASCADE,
  subgroup_id uuid REFERENCES public.groups ON DELETE CASCADE,
  added_at    timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, subgroup_id)
);

CREATE INDEX IF NOT EXISTS idx_post_subgroups_subgroup ON public.post_subgroups (subgroup_id);
CREATE INDEX IF NOT EXISTS idx_post_subgroups_post    ON public.post_subgroups (post_id);

-- Backfill from existing group_id on posts
INSERT INTO public.post_subgroups (post_id, subgroup_id)
SELECT id, group_id FROM public.posts WHERE group_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 4. subgroup_follows — user follows a community ─────────────────────────
CREATE TABLE IF NOT EXISTS public.subgroup_follows (
  user_id     uuid REFERENCES public.profiles ON DELETE CASCADE,
  subgroup_id uuid REFERENCES public.groups ON DELETE CASCADE,
  followed_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, subgroup_id)
);

CREATE INDEX IF NOT EXISTS idx_subgroup_follows_user     ON public.subgroup_follows (user_id);
CREATE INDEX IF NOT EXISTS idx_subgroup_follows_subgroup ON public.subgroup_follows (subgroup_id);

-- ── 5. user_subgroups — soft membership derived from post history ───────────
CREATE TABLE IF NOT EXISTS public.user_subgroups (
  user_id     uuid REFERENCES public.profiles ON DELETE CASCADE,
  subgroup_id uuid REFERENCES public.groups ON DELETE CASCADE,
  PRIMARY KEY (user_id, subgroup_id)
);

CREATE INDEX IF NOT EXISTS idx_user_subgroups_user     ON public.user_subgroups (user_id);
CREATE INDEX IF NOT EXISTS idx_user_subgroups_subgroup ON public.user_subgroups (subgroup_id);

-- Backfill from existing post history
INSERT INTO public.user_subgroups (user_id, subgroup_id)
SELECT DISTINCT p.user_id, p.group_id
FROM public.posts p
WHERE p.group_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 6. pinned_posts — up to 3 pinned posts per user, ordered ──────────────
CREATE TABLE IF NOT EXISTS public.pinned_posts (
  user_id   uuid REFERENCES public.profiles ON DELETE CASCADE,
  post_id   uuid REFERENCES public.posts ON DELETE CASCADE,
  pin_order smallint CHECK (pin_order BETWEEN 1 AND 3),
  pinned_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pinned_posts_user_order
  ON public.pinned_posts (user_id, pin_order);

-- ── 7. Trigger: sync follower_count on groups when subgroup_follows changes ─
CREATE OR REPLACE FUNCTION public.handle_subgroup_follower_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.groups SET follower_count = follower_count + 1 WHERE id = NEW.subgroup_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.groups SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = OLD.subgroup_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS on_subgroup_follow_change ON public.subgroup_follows;
CREATE TRIGGER on_subgroup_follow_change
  AFTER INSERT OR DELETE ON public.subgroup_follows
  FOR EACH ROW EXECUTE PROCEDURE public.handle_subgroup_follower_count();

-- ── 8. Trigger: upsert user_subgroups when a post is tagged to a community ─
CREATE OR REPLACE FUNCTION public.handle_user_subgroup_membership()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT user_id INTO v_user_id FROM public.posts WHERE id = NEW.post_id;
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.user_subgroups (user_id, subgroup_id)
      VALUES (v_user_id, NEW.subgroup_id)
      ON CONFLICT DO NOTHING;
    END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_post_subgroup_insert ON public.post_subgroups;
CREATE TRIGGER on_post_subgroup_insert
  AFTER INSERT ON public.post_subgroups
  FOR EACH ROW EXECUTE PROCEDURE public.handle_user_subgroup_membership();

-- ── 9. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.post_subgroups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "post_subgroups_select" ON public.post_subgroups;
DROP POLICY IF EXISTS "post_subgroups_insert" ON public.post_subgroups;
DROP POLICY IF EXISTS "post_subgroups_delete" ON public.post_subgroups;
CREATE POLICY "post_subgroups_select" ON public.post_subgroups FOR SELECT USING (true);
CREATE POLICY "post_subgroups_insert" ON public.post_subgroups FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND user_id = auth.uid()));
CREATE POLICY "post_subgroups_delete" ON public.post_subgroups FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.posts WHERE id = post_id AND user_id = auth.uid()));

ALTER TABLE public.subgroup_follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "subgroup_follows_select" ON public.subgroup_follows;
DROP POLICY IF EXISTS "subgroup_follows_insert" ON public.subgroup_follows;
DROP POLICY IF EXISTS "subgroup_follows_delete" ON public.subgroup_follows;
CREATE POLICY "subgroup_follows_select" ON public.subgroup_follows FOR SELECT USING (true);
CREATE POLICY "subgroup_follows_insert" ON public.subgroup_follows FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subgroup_follows_delete" ON public.subgroup_follows FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.user_subgroups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_subgroups_select" ON public.user_subgroups;
DROP POLICY IF EXISTS "user_subgroups_insert" ON public.user_subgroups;
CREATE POLICY "user_subgroups_select" ON public.user_subgroups FOR SELECT USING (true);
CREATE POLICY "user_subgroups_insert" ON public.user_subgroups FOR INSERT WITH CHECK (true);

ALTER TABLE public.pinned_posts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pinned_posts_select" ON public.pinned_posts;
DROP POLICY IF EXISTS "pinned_posts_insert" ON public.pinned_posts;
DROP POLICY IF EXISTS "pinned_posts_delete" ON public.pinned_posts;
CREATE POLICY "pinned_posts_select" ON public.pinned_posts FOR SELECT USING (true);
CREATE POLICY "pinned_posts_insert" ON public.pinned_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pinned_posts_delete" ON public.pinned_posts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "pinned_posts_update" ON public.pinned_posts FOR UPDATE USING (auth.uid() = user_id);

-- ── 10. Grants ──────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, DELETE ON public.post_subgroups TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.subgroup_follows TO authenticated;
GRANT SELECT, INSERT ON public.user_subgroups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinned_posts TO authenticated;
