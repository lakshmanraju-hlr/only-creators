-- =====================================================
-- Fix: Expand notifications type CHECK constraint
-- The original schema only allowed: like, pro_upvote, comment, follow, share
-- Missing types cause silent insert failures for:
--   friend_request, friend_accepted, peer_verify, message
--
-- Paste into Supabase SQL Editor and click Run
-- =====================================================

-- Drop the old restrictive CHECK constraint
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

-- Add updated constraint with all notification types
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'like',
    'pro_upvote',
    'comment',
    'follow',
    'share',
    'friend_request',
    'friend_accepted',
    'peer_verify',
    'message'
  ));
