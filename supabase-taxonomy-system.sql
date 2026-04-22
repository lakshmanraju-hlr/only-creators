-- ─────────────────────────────────────────────────────────────────────────────
-- OnlyCreators — Taxonomy System Migration
-- Run after: supabase-community-system.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Extend groups table for user-created communities ───────────────────────
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS parent_group_id uuid REFERENCES public.groups ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_user_created  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review     boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_groups_parent ON public.groups (parent_group_id) WHERE parent_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_groups_needs_review ON public.groups (needs_review) WHERE needs_review = true;

-- ── 2. post_tags table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_tags (
  post_id uuid NOT NULL REFERENCES public.posts ON DELETE CASCADE,
  tag     text NOT NULL CHECK (char_length(tag) BETWEEN 1 AND 80),
  PRIMARY KEY (post_id, tag)
);

CREATE INDEX IF NOT EXISTS idx_post_tags_tag ON public.post_tags (tag);

-- ── 3. post_features table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_features (
  post_id          uuid NOT NULL REFERENCES public.posts    ON DELETE CASCADE,
  featured_user_id uuid NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, featured_user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_features_featured_user ON public.post_features (featured_user_id, status);

-- ── 4. Update notifications type CHECK constraint ────────────────────────────
-- Drop the old constraint and re-add with 'feature_tag' included.
-- (constraint name may differ — use DO block to drop by pattern safely)
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', con_name);
  END IF;
END;
$$;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like', 'comment', 'follow', 'friend_request', 'friend_accept',
    'pro_upvote', 'mention', 'feature_tag'
  ));

-- ── 5. Admin-flag trigger: mark user-created community for review after 10 posts ──
CREATE OR REPLACE FUNCTION public.handle_community_review_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  g public.groups%ROWTYPE;
BEGIN
  -- Only for post_subgroups inserts
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;

  SELECT * INTO g FROM public.groups WHERE id = NEW.subgroup_id;

  -- Only flag user-created communities not already flagged
  IF g.is_user_created AND NOT g.needs_review AND g.post_count >= 10 THEN
    UPDATE public.groups SET needs_review = true WHERE id = NEW.subgroup_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_review_flag ON public.post_subgroups;
CREATE TRIGGER trg_community_review_flag
  AFTER INSERT ON public.post_subgroups
  FOR EACH ROW EXECUTE FUNCTION public.handle_community_review_flag();

-- ── 6. RLS policies — post_tags ───────────────────────────────────────────────
ALTER TABLE public.post_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_tags_select_public" ON public.post_tags
  FOR SELECT USING (true);

CREATE POLICY "post_tags_insert_owner" ON public.post_tags
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT user_id FROM public.posts WHERE id = post_id)
  );

CREATE POLICY "post_tags_delete_owner" ON public.post_tags
  FOR DELETE USING (
    auth.uid() = (SELECT user_id FROM public.posts WHERE id = post_id)
  );

-- ── 7. RLS policies — post_features ──────────────────────────────────────────
ALTER TABLE public.post_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_features_select_involved" ON public.post_features
  FOR SELECT USING (
    auth.uid() = featured_user_id OR
    auth.uid() = (SELECT user_id FROM public.posts WHERE id = post_id)
  );

CREATE POLICY "post_features_insert_owner" ON public.post_features
  FOR INSERT WITH CHECK (
    auth.uid() = (SELECT user_id FROM public.posts WHERE id = post_id)
  );

CREATE POLICY "post_features_update_featured" ON public.post_features
  FOR UPDATE USING (auth.uid() = featured_user_id)
  WITH CHECK (auth.uid() = featured_user_id AND status IN ('accepted', 'declined'));

-- ── 8. Grants ─────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, DELETE ON public.post_tags     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.post_features TO authenticated;
GRANT SELECT                  ON public.post_tags     TO anon;
