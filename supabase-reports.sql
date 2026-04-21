-- ═══════════════════════════════════════════════
-- Only Creators — Reports Table
-- Run in Supabase SQL editor
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  target_type VARCHAR(20) NOT NULL
    CHECK (target_type IN ('post', 'comment', 'profile', 'group', 'field', 'conversation')),
  target_id   UUID NOT NULL,
  reason      VARCHAR(60) NOT NULL
    CHECK (reason IN (
      'spam_or_misleading',
      'inappropriate_content',
      'harassment_or_bullying',
      'off_topic',
      'intellectual_property',
      'other'
    )),
  status      VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS reports_reporter_idx    ON reports (reporter_id);
CREATE INDEX IF NOT EXISTS reports_target_idx      ON reports (target_type, target_id);
CREATE INDEX IF NOT EXISTS reports_status_idx      ON reports (status);
CREATE INDEX IF NOT EXISTS reports_created_at_idx  ON reports (created_at DESC);

-- Prevent duplicate reports from same user on same target
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_reporter_target
  ON reports (reporter_id, target_type, target_id);

-- RLS: users can insert their own reports, cannot read others'
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (reporter_id = auth.uid());

-- Reporters can see their own reports (read-only after submit)
CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT
  TO authenticated
  USING (reporter_id = auth.uid());

-- Admins: grant full access via service role (no policy needed — service role bypasses RLS)
