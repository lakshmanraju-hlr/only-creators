import { useState, useRef, useEffect, useMemo } from 'react'
import { useLazyLoad } from '@/hooks/useLazyLoad'
import { useNavigate, Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, Post, Comment, getProfMeta, Profile, Group } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import { getFriends } from '@/lib/friends'
import ConfirmSheet from '@/components/ConfirmSheet'
import ReportSheet from '@/components/ReportSheet'
import CommunityPickerModal from '@/components/CommunityPickerModal'

interface Props { post: Post; onUpdated?: () => void }

export default function PostCard({ post, onUpdated }: Props) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [liked, setLiked] = useState(post.user_liked || false)
  const [likeCount, setLikeCount] = useState(post.like_count)
  const [proUpvoted, setProUpvoted] = useState(post.user_pro_upvoted || false)
  const [proCount, setProCount] = useState(post.pro_upvote_count)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [friends, setFriends] = useState<Profile[]>([])
  const [sharing, setSharing] = useState<string | null>(null)
  const [proCommenters, setProCommenters] = useState<Set<string>>(new Set())
  const [upvoterPreview, setUpvoterPreview] = useState<Profile[]>([])
  const [upvoterTotal, setUpvoterTotal] = useState(0)
  const [upvoterLoading, setUpvoterLoading] = useState(false)
  const [showUpvoterTooltip, setShowUpvoterTooltip] = useState(false)
  const [showUpvoterDialog, setShowUpvoterDialog] = useState(false)
  const [allUpvoters, setAllUpvoters] = useState<Profile[]>([])
  const upvoterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<Profile[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionStart, setMentionStart] = useState(-1)
  const [showMenuSheet, setShowMenuSheet] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [pinning, setPinning] = useState(false)
  const [showCommunityEditor, setShowCommunityEditor] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [bookmarked, setBookmarked] = useState(false)
  const [mediaLightbox, setMediaLightbox] = useState<{ url: string; type: 'photo' | 'video' } | null>(null)
  const [canProUpvote, setCanProUpvote] = useState(false)
  const commentRef = useRef<HTMLInputElement>(null)

  const isOwnPost = profile?.id === post.user_id
  const author = post.profiles
  const fieldMeta = useMemo(() => getProfMeta(post.persona_discipline), [post.persona_discipline])
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true })

  const { ref: mediaRef, isVisible: mediaVisible } = useLazyLoad<HTMLDivElement>()
  const thumbSrc = useMemo(() => post.thumb_url || post.media_url || '', [post.thumb_url, post.media_url])
  const displaySrc = useMemo(() => post.display_url || post.media_url || '', [post.display_url, post.media_url])
  const authorAvatarSrc = useMemo(() => author?.avatar_url || '', [author?.avatar_url])

  useEffect(() => {
    if (!profile) return
    supabase.from('bookmarks').select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id).eq('post_id', post.id)
      .then(({ count }) => setBookmarked((count ?? 0) > 0))
  }, [profile?.id, post.id])

  useEffect(() => {
    if (!profile || !post.persona_discipline || post.user_id === profile.id || post.post_type !== 'pro') {
      setCanProUpvote(false); return
    }
    supabase.from('discipline_personas').select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id).eq('discipline', post.persona_discipline)
      .then(res => setCanProUpvote((res.count ?? 0) > 0))
  }, [profile?.id, post.persona_discipline, post.user_id, post.post_type])

  // Fetch pin state for own posts
  useEffect(() => {
    if (!profile || !isOwnPost) return
    supabase.from('pinned_posts').select('post_id', { count: 'exact', head: true })
      .eq('user_id', profile.id).eq('post_id', post.id)
      .then(({ count }) => setIsPinned((count ?? 0) > 0))
  }, [profile?.id, post.id, isOwnPost])

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenuSheet) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenuSheet(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenuSheet])

  useEffect(() => {
    if (!mentionQuery || mentionStart === -1 || !profile) { setMentionResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles')
        .select('id,username,full_name,avatar_url')
        .ilike('username', mentionQuery + '%')
        .neq('id', profile.id).limit(5)
      setMentionResults((data || []) as Profile[])
    }, 180)
    return () => clearTimeout(t)
  }, [mentionQuery, mentionStart])

  function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }
  function goToAuthor() { if (author?.username) navigate('/profile/' + author.username) }

  async function deletePost() {
    if (!profile || !isOwnPost) return
    setDeleting(true)
    const { error } = await supabase.from('posts').delete().eq('id', post.id)
    if (error) { toast.error('Failed to delete: ' + error.message); setDeleting(false); return }
    if (post.media_path) await supabase.storage.from('posts').remove([post.media_path])
    toast.success('Post deleted'); setShowConfirmDelete(false); onUpdated?.()
  }

  async function toggleBookmark() {
    if (!profile) return toast.error('Sign in to bookmark posts')
    const was = bookmarked; setBookmarked(!was)
    if (was) {
      await supabase.from('bookmarks').delete().match({ user_id: profile.id, post_id: post.id })
      toast.success('Removed from bookmarks')
    } else {
      await supabase.from('bookmarks').insert({ user_id: profile.id, post_id: post.id })
      toast.success('Saved to bookmarks')
    }
  }

  function copyPostLink() {
    const url = `${window.location.origin}/profile/${author?.username}#post-${post.id}`
    navigator.clipboard.writeText(url)
    toast.success('Link copied!')
    setShowMenuSheet(false)
  }

  async function handlePinPost() {
    if (!profile || !isOwnPost) return
    setShowMenuSheet(false)
    setPinning(true)
    if (isPinned) {
      await supabase.from('pinned_posts').delete().match({ user_id: profile.id, post_id: post.id })
      setIsPinned(false)
      toast('Unpinned from profile')
    } else {
      const { count } = await supabase.from('pinned_posts')
        .select('*', { count: 'exact', head: true }).eq('user_id', profile.id)
      if ((count ?? 0) >= 3) {
        toast.error('You can only pin 3 posts — unpin one first.')
        setPinning(false); return
      }
      const { data: existing } = await supabase.from('pinned_posts')
        .select('pin_order').eq('user_id', profile.id)
      const usedOrders = new Set((existing || []).map((p: any) => p.pin_order as number))
      const nextOrder = ([1, 2, 3] as const).find(n => !usedOrders.has(n)) ?? 1
      await supabase.from('pinned_posts').insert({ user_id: profile.id, post_id: post.id, pin_order: nextOrder })
      setIsPinned(true)
      toast.success('Pinned to your profile')
    }
    setPinning(false)
  }

  async function toggleLike() {
    if (!profile) return toast.error('Sign in to like posts')
    const was = liked; setLiked(!was); setLikeCount(c => was ? c - 1 : c + 1)
    if (was) {
      await supabase.from('likes').delete().match({ user_id: profile.id, post_id: post.id })
    } else {
      await supabase.from('likes').insert({ user_id: profile.id, post_id: post.id })
      if (post.user_id !== profile.id)
        await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: profile.id, type: 'like', post_id: post.id })
      const disc = fieldMeta ? post.persona_discipline : null
      if (disc) supabase.rpc('increment_discipline_score', { p_user_id: profile.id, p_discipline: disc, p_delta: 1 })
    }
  }

  async function toggleProUpvote() {
    if (!canProUpvote || !profile) return
    const was = proUpvoted; setProUpvoted(!was); setProCount(c => was ? c - 1 : c + 1)
    if (was) {
      const { data, error } = await supabase.rpc('remove_pro_vote', { p_post_id: post.id })
      if (error || data?.error) {
        setProUpvoted(true); setProCount(c => c + 1)
        toast.error('Failed to remove vote')
      }
    } else {
      const { data, error } = await supabase.rpc('cast_pro_vote', { p_post_id: post.id })
      if (error || data?.error) {
        setProUpvoted(false); setProCount(c => c - 1)
        const msg = data?.detail ?? data?.error ?? 'Failed to Pro Vote'
        toast.error(msg === 'insufficient_tier' ? 'Expert or Authority tier required' : msg)
        return
      }
      if (data?.new_vote_count !== undefined) setProCount(data.new_vote_count)
      if (post.user_id !== profile.id)
        await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: profile.id, type: 'pro_upvote', post_id: post.id })
      toast.success('Pro Vote cast!')
    }
  }

  async function loadComments() {
    if (showComments) { setShowComments(false); return }
    setShowComments(true)
    if (comments.length > 0) return
    setLoadingComments(true)
    const { data } = await supabase.from('comments')
      .select('*, profiles(id,username,full_name,avatar_url)')
      .eq('post_id', post.id).order('created_at', { ascending: true })
    const loaded = (data || []) as Comment[]
    setComments(loaded)
    if (post.post_type === 'pro' && post.persona_discipline && loaded.length > 0) {
      const ids = [...new Set(loaded.map(c => c.user_id))]
      const { data: pd } = await supabase.from('discipline_personas')
        .select('user_id').eq('discipline', post.persona_discipline).in('user_id', ids)
      setProCommenters(new Set((pd || []).map((r: any) => r.user_id as string)))
    }
    setLoadingComments(false)
  }

  function handleCommentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value; setCommentText(val)
    const cursor = e.target.selectionStart ?? val.length
    const before = val.slice(0, cursor)
    const atIdx = before.lastIndexOf('@')
    if (atIdx !== -1) {
      const afterAt = before.slice(atIdx + 1)
      if (!afterAt.includes(' ') && afterAt.length <= 20) {
        setMentionStart(atIdx); setMentionQuery(afterAt); setMentionIndex(0); return
      }
    }
    setMentionStart(-1); setMentionQuery(''); setMentionResults([])
  }

  function pickMention(username: string) {
    const before = commentText.slice(0, mentionStart)
    const after = commentText.slice(mentionStart + 1 + mentionQuery.length)
    setCommentText(before + '@' + username + ' ' + after)
    setMentionStart(-1); setMentionQuery(''); setMentionResults([])
    commentRef.current?.focus()
  }

  function handleCommentKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (mentionResults.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionResults.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionResults[mentionIndex].username); return }
      if (e.key === 'Escape') { setMentionResults([]); return }
    }
    if (e.key === 'Enter' && mentionResults.length === 0) submitComment()
  }

  async function submitComment() {
    if (!profile || !commentText.trim()) return
    setSubmitting(true)
    const { data, error } = await supabase.from('comments')
      .insert({ post_id: post.id, user_id: profile.id, body: commentText.trim() })
      .select('*, profiles(id,username,full_name,avatar_url)').single()
    if (!error && data) {
      setComments(c => [...c, data as Comment]); setCommentText(''); setMentionResults([])
      if (post.user_id !== profile.id)
        await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: profile.id, type: 'comment', post_id: post.id })
      if (post.persona_discipline)
        supabase.rpc('increment_discipline_score', { p_user_id: profile.id, p_discipline: post.persona_discipline, p_delta: 2 })
    }
    setSubmitting(false)
  }

  async function deleteComment(commentId: string) {
    await supabase.from('comments').delete().eq('id', commentId)
    setComments(c => c.filter(x => x.id !== commentId))
  }

  async function openShare() {
    setShowShare(true)
    if (!profile) return
    const ids = await getFriends(profile.id)
    if (!ids.length) return
    const { data } = await supabase.from('profiles').select('*').in('id', ids)
    setFriends((data || []) as Profile[])
  }

  async function shareToFriend(friend: Profile) {
    if (!profile) return
    setSharing(friend.id)
    const { data: convData } = await supabase.rpc('get_or_create_conversation', { other_user_id: friend.id })
    await supabase.from('messages').insert({ conversation_id: convData, sender_id: profile.id, post_id: post.id, body: null })
    setSharing(null)
    toast.success('Shared with ' + friend.full_name + '!')
    setShowShare(false)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <article
      id={'post-' + post.id}
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--divider)' }}
    >

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2.5">
        {/* Avatar */}
        <button
          onClick={goToAuthor}
          className="shrink-0 w-8 h-8 rounded-full overflow-hidden ring-1 ring-border bg-surface-elevated flex items-center justify-center"
        >
          {authorAvatarSrc
            ? <img src={authorAvatarSrc} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
            : <span className="text-[11px] font-semibold text-text-secondary">{initials(author?.full_name || '?')}</span>
          }
        </button>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={goToAuthor}
              className="text-[14px] font-bold text-text-primary leading-snug hover:underline"
            >
              {author?.full_name}
            </button>
            {/* Endorsement badge */}
            {(author?.verification_count ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-badge bg-accent-subtle text-text-primary shrink-0">
                ✓ {author!.verification_count}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-[12px] text-text-secondary leading-none flex-wrap">
            <span>@{author?.username}</span>
            {fieldMeta && (
              <>
                <span className="shrink-0">·</span>
                <span className="shrink-0">{fieldMeta.icon} {fieldMeta.label}</span>
              </>
            )}
          </div>
        </div>

        {/* ··· more */}
        <div ref={menuRef} className="more-wrap shrink-0">
          <button
            onClick={() => setShowMenuSheet(v => !v)}
            className="icon-btn"
            style={{ width: 36, height: 36 }}
            title="More options"
            aria-label="More options"
          >
            <span className="flex w-[18px] h-[18px]"><Icon.MoreHorizontal /></span>
          </button>
          <AnimatePresence>
            {showMenuSheet && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -4 }}
                transition={{ duration: 0.12 }}
                className="options-dropdown open"
              >
                {isOwnPost ? (
                  <>
                    <button
                      className="opt-item"
                      onClick={handlePinPost}
                      disabled={pinning}
                    >
                      <span className="flex w-[18px] h-[18px] shrink-0 text-text-secondary"><Icon.Pin /></span>
                      {pinning ? '…' : isPinned ? 'Unpin from profile' : 'Pin to profile'}
                    </button>
                    {post.post_type === 'pro' && (
                      <button
                        className="opt-item"
                        onClick={() => { setShowMenuSheet(false); setShowCommunityEditor(true) }}
                      >
                        <span className="flex w-[18px] h-[18px] shrink-0 text-text-secondary"><Icon.MapPin /></span>
                        Edit community
                      </button>
                    )}
                    <button className="opt-item" onClick={copyPostLink}>
                      <span className="flex w-[18px] h-[18px] shrink-0 text-text-secondary"><Icon.CopyLink /></span>
                      Copy link
                    </button>
                    <div className="opt-divider" />
                    <button
                      className="opt-item destructive"
                      onClick={() => { setShowMenuSheet(false); setShowConfirmDelete(true) }}
                    >
                      <span className="flex w-[18px] h-[18px] shrink-0"><Icon.Trash /></span>
                      Delete post
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="opt-item"
                      onClick={() => { toast.success("Got it. We'll show fewer posts like this."); setShowMenuSheet(false) }}
                    >
                      <span className="flex w-[18px] h-[18px] shrink-0 text-text-secondary"><Icon.EyeSlash /></span>
                      Not interested
                    </button>
                    <button className="opt-item" onClick={copyPostLink}>
                      <span className="flex w-[18px] h-[18px] shrink-0 text-text-secondary"><Icon.CopyLink /></span>
                      Copy link
                    </button>
                    <div className="opt-divider" />
                    <button
                      className="opt-item destructive"
                      onClick={() => { setShowMenuSheet(false); setShowReport(true) }}
                    >
                      <span className="flex w-[18px] h-[18px] shrink-0"><Icon.Flag /></span>
                      Report post
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Media ───────────────────────────────────────────── */}
      {post.content_type === 'photo' && post.media_url && (
        <div
          ref={mediaRef}
          className="relative aspect-[4/5] bg-surface-elevated cursor-zoom-in overflow-hidden"
          onClick={() => setMediaLightbox({ url: displaySrc, type: 'photo' })}
        >
          {mediaVisible && (
            <img
              src={displaySrc}
              alt="post"
              className="w-full h-full object-cover block"
              loading="lazy"
              decoding="async"
              style={{ opacity: 0, transition: 'opacity 0.2s ease' }}
              onLoad={e => { (e.currentTarget as HTMLImageElement).style.opacity = '1' }}
            />
          )}
          {/* Community / field pill overlay — top-left */}
          {fieldMeta && (
            <div className="absolute top-3 left-3 z-10 pointer-events-none">
              <span style={{
                display: 'inline-block',
                background: 'rgba(0,0,0,0.52)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
              }}>
                {fieldMeta.label}
              </span>
            </div>
          )}
        </div>
      )}

      {post.content_type === 'video' && post.media_url && (
        <div className="aspect-[4/5] bg-[#111111] overflow-hidden">
          <video controls src={post.media_url} className="w-full h-full object-cover" />
        </div>
      )}

      {post.content_type === 'audio' && post.media_url && (
        <div className="mx-4 my-2 px-4 py-3 rounded-[8px] bg-surface-elevated border border-border">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary mb-2.5">
            <span className="flex w-3.5 h-3.5 shrink-0"><Icon.Music /></span>
            <span className="truncate">{post.caption || 'Audio recording'}</span>
          </div>
          <audio controls src={post.media_url} className="w-full" />
        </div>
      )}

      {post.content_type === 'poem' && post.poem_text && (
        <div className="mx-4 my-2 px-5 py-5 rounded-[8px] bg-surface-elevated border border-border">
          <p className="font-serif italic text-[15px] leading-8 text-text-primary whitespace-pre-line">
            {post.poem_text}
          </p>
          {post.caption && (
            <p className="mt-3 text-[12px] text-text-secondary">— {author?.full_name}</p>
          )}
        </div>
      )}

      {post.content_type === 'document' && post.media_url && (
        <div className="mx-4 my-2 flex items-center gap-3 px-4 py-3 rounded-[8px] bg-surface-elevated border border-border">
          <div className="w-9 h-9 rounded-[6px] bg-accent-subtle flex items-center justify-center shrink-0">
            <span className="flex w-4 h-4 text-text-primary"><Icon.FileText /></span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-text-primary truncate">{post.caption || 'Document'}</div>
            <a
              href={post.media_url}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-text-secondary hover:text-text-primary hover:underline"
            >
              Open document
            </a>
          </div>
        </div>
      )}

      {/* ── Action bar ──────────────────────────────────────── */}
      <div className="post-actions px-3">
        {/* Left: Like · Comment · Share */}
        <div className="actions-left">
          <button
            onClick={toggleLike}
            className={`action-btn${liked ? ' liked' : ''}`}
            style={{ color: liked ? 'var(--color-like, #EF4444)' : undefined }}
            title={liked ? 'Unlike' : 'Like'}
            aria-label={`${liked ? 'Unlike' : 'Like'} post, ${likeCount} likes`}
          >
            <span className="flex w-[20px] h-[20px]"><Icon.Heart filled={liked} /></span>
            {likeCount > 0 && (
              <span>{likeCount >= 1000 ? (likeCount / 1000).toFixed(1) + 'k' : likeCount}</span>
            )}
          </button>

          <button
            onClick={loadComments}
            className="action-btn"
            title="Comment"
            aria-label={`${post.comment_count} comments`}
          >
            <span className="flex w-[20px] h-[20px]"><Icon.MessageCircle /></span>
            {post.comment_count > 0 && <span>{post.comment_count}</span>}
          </button>

          <button
            onClick={openShare}
            className="action-btn"
            title="Share"
            aria-label="Share post"
          >
            <span className="flex w-[20px] h-[20px]"><Icon.Share /></span>
          </button>
        </div>

        {/* Right: Pro Vote + Bookmark */}
        <div className="flex items-center gap-1">
          {/* Pro Vote — only on pro posts */}
          {post.post_type === 'pro' && (
            <div style={{ position: 'relative' }}
              onMouseEnter={() => {
                if (proCount === 0) return
                upvoterTimerRef.current = setTimeout(async () => {
                  setUpvoterLoading(true); setShowUpvoterTooltip(true)
                  const { data } = await supabase.from('pro_upvotes')
                    .select('profiles:user_id(id,username,full_name,avatar_url)')
                    .eq('post_id', post.id).limit(5)
                  setUpvoterPreview((data || []).map((r: any) => r.profiles).filter(Boolean) as Profile[])
                  setUpvoterTotal(proCount); setUpvoterLoading(false)
                }, 300)
              }}
              onMouseLeave={() => {
                if (upvoterTimerRef.current) clearTimeout(upvoterTimerRef.current)
                setShowUpvoterTooltip(false)
              }}
            >
              <button
                onClick={canProUpvote
                  ? toggleProUpvote
                  : () => toast('Only verified creators in the same field can give Pro Votes')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 'var(--radius-full)',
                  border: `1.5px solid ${proUpvoted ? 'var(--brand)' : 'var(--border)'}`,
                  background: proUpvoted ? 'var(--brand)' : 'transparent',
                  color: proUpvoted ? '#fff' : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  cursor: canProUpvote ? 'pointer' : 'default',
                  opacity: !canProUpvote && !proUpvoted ? 0.5 : 1,
                  transition: 'background var(--transition), border-color var(--transition), color var(--transition)',
                  fontFamily: 'var(--font)',
                }}
                title="Pro Vote"
                aria-label="Pro Vote"
              >
                Pro
                <span className="flex w-3 h-3"><Icon.Star /></span>
                {proCount > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600 }}>
                    {proCount >= 1000 ? (proCount / 1000).toFixed(1) + 'k' : proCount}
                  </span>
                )}
              </button>

              {/* Upvoter tooltip */}
              <AnimatePresence>
                {showUpvoterTooltip && proCount > 0 && (
                  <motion.div
                    className="absolute bottom-full right-0 mb-2 w-52 rounded-[8px] py-1.5 z-30"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
                    initial={{ opacity: 0, y: 4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    transition={{ duration: 0.1 }}
                  >
                    {upvoterLoading ? (
                      <div className="flex justify-center py-3">
                        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--divider)', borderTopColor: 'var(--brand)' }} />
                      </div>
                    ) : (
                      <>
                        {upvoterPreview.map(u => (
                          <div key={u.id} className="flex items-center gap-2 px-3 py-1.5">
                            <div className="w-6 h-6 rounded-full overflow-hidden flex items-center justify-center text-[9px] font-semibold shrink-0" style={{ background: 'var(--surface-off)', color: 'var(--text-muted)' }}>
                              {u.avatar_url
                                ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                                : initials(u.full_name)}
                            </div>
                            <span className="text-[12.5px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{u.full_name}</span>
                          </div>
                        ))}
                        {proCount > 5 && (
                          <button
                            onMouseDown={async e => {
                              e.preventDefault(); setShowUpvoterTooltip(false); setShowUpvoterDialog(true)
                              const { data } = await supabase.from('pro_upvotes')
                                .select('profiles:user_id(id,username,full_name,avatar_url,profession)')
                                .eq('post_id', post.id)
                              setAllUpvoters((data || []).map((r: any) => r.profiles).filter(Boolean) as Profile[])
                            }}
                            className="w-full text-left px-3 py-1.5 text-[12px] font-medium transition-colors border-t mt-1"
                            style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                          >
                            View all {proCount} Pro Voters →
                          </button>
                        )}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Bookmark */}
          <button
            onClick={toggleBookmark}
            className={`save-btn${bookmarked ? ' saved' : ''}`}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark'}
            aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark post'}
          >
            <span className="flex w-[20px] h-[20px]">{bookmarked ? <Icon.BookmarkFill /> : <Icon.Bookmark />}</span>
          </button>
        </div>
      </div>

      {/* ── Caption (Instagram-style: bold username inline) ─── */}
      {post.caption && post.content_type !== 'audio' && post.content_type !== 'poem' && (
        <div className="px-4 pb-1.5 text-[14px] leading-[1.5] text-text-primary">
          <button
            onClick={goToAuthor}
            className="font-bold mr-1.5 hover:underline shrink-0"
          >
            {author?.full_name}
          </button>
          {post.caption.split(' ').map((word, i) =>
            word.startsWith('#')
              ? <span key={i} className="font-medium cursor-pointer hover:underline text-text-primary">{word} </span>
              : word.startsWith('@')
              ? <span
                  key={i}
                  className="font-semibold cursor-pointer hover:underline"
                  onClick={() => navigate('/profile/' + word.slice(1))}
                >{word} </span>
              : <span key={i}>{word} </span>
          )}
        </div>
      )}

      {/* ── Skill / Field tags ──────────────────────────────── */}
      {(post.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {post.tags.map((tag, i) => (
            <span
              key={i}
              className="text-[11px] font-semibold px-2 py-0.5 rounded-badge bg-accent-subtle text-text-primary"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* ── Group chip ──────────────────────────────────────── */}
      {post.group && (
        <div className="px-4 pb-1.5">
          <Link
            to={'/groups/' + post.group.slug}
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-badge bg-accent-subtle text-text-primary hover:bg-border transition-colors"
          >
            {post.group.name}
          </Link>
        </div>
      )}

      {/* ── Comments summary ────────────────────────────────── */}
      {post.comment_count > 0 && !showComments && (
        <button
          onClick={loadComments}
          className="block px-4 pb-1 text-[13px] text-text-secondary hover:text-text-primary transition-colors text-left w-full"
        >
          View all {post.comment_count} comment{post.comment_count !== 1 ? 's' : ''}
        </button>
      )}

      {/* ── Timestamp ───────────────────────────────────────── */}
      <p className="px-4 pb-3 text-[11px] text-text-secondary uppercase tracking-wide">
        {timeAgo}
      </p>

      {/* ── Expanded comments ───────────────────────────────── */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            className="border-t border-border bg-surface px-4 py-3"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
          >
            {loadingComments ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-border-strong border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-3 mb-3">
                {[...comments]
                  .sort((a, b) => {
                    if (post.post_type !== 'pro') return 0
                    return (proCommenters.has(b.user_id) ? 1 : 0) - (proCommenters.has(a.user_id) ? 1 : 0)
                  })
                  .map((c: Comment) => {
                    const isPro = proCommenters.has(c.user_id)
                    return (
                      <div key={c.id} className="flex items-start gap-2.5 group">
                        <button
                          onClick={() => c.profiles?.username && navigate('/profile/' + c.profiles.username)}
                          className="w-7 h-7 rounded-full overflow-hidden bg-surface-elevated ring-1 ring-border flex items-center justify-center text-[9px] font-semibold text-text-secondary shrink-0 mt-0.5"
                        >
                          {c.profiles?.avatar_url
                            ? <img src={c.profiles.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                            : initials(c.profiles?.full_name || '?')}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span
                            className={`text-[13px] font-bold cursor-pointer hover:underline`}
                            style={isPro ? { color: 'var(--gold-dark, #D97706)' } : undefined}
                            onClick={() => c.profiles?.username && navigate('/profile/' + c.profiles.username)}
                          >
                            {c.profiles?.username}
                          </span>
                          {isPro && (
                            <span className="ml-1.5 text-[10px] font-bold" style={{ color: 'var(--gold)' }}>PRO</span>
                          )}
                          <span className="text-[13px] text-text-primary ml-1.5">
                            {c.body.split(' ').map((w: string, i: number) =>
                              w.startsWith('@')
                                ? <span key={i} className="font-semibold cursor-pointer hover:underline" onClick={() => navigate('/profile/' + w.slice(1))}>{w} </span>
                                : <span key={i}>{w} </span>
                            )}
                          </span>
                        </div>
                        {profile && c.user_id === profile.id && (
                          <button
                            onClick={() => deleteComment(c.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-full text-text-disabled hover:text-error hover:bg-error-subtle opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5"
                          >
                            <span className="flex w-3 h-3"><Icon.Trash /></span>
                          </button>
                        )}
                      </div>
                    )
                  })}
              </div>
            )}

            {/* Comment input */}
            <div className="relative">
              {mentionResults.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-56 bg-surface rounded-[8px] border border-border shadow-modal py-1 z-20">
                  {mentionResults.map((r, i) => (
                    <button
                      key={r.id}
                      onMouseDown={e => { e.preventDefault(); pickMention(r.username) }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                        i === mentionIndex ? 'bg-surface-elevated' : 'hover:bg-surface-elevated'
                      }`}
                    >
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-surface-elevated flex items-center justify-center text-[9px] font-semibold text-text-secondary shrink-0">
                        {r.avatar_url
                          ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          : initials(r.full_name)}
                      </div>
                      <span className="font-semibold text-text-primary text-[13px]">{r.full_name}</span>
                      <span className="text-[12px] text-text-secondary ml-auto">@{r.username}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={commentRef}
                  value={commentText}
                  onChange={handleCommentChange}
                  onKeyDown={handleCommentKey}
                  placeholder="Add a comment… (@ to mention)"
                  className="flex-1 bg-surface-elevated border border-border rounded-badge px-4 py-2 text-[13px] text-text-primary placeholder:text-text-hint outline-none focus:border-border-strong transition-colors"
                />
                <button
                  onClick={submitComment}
                  disabled={submitting || !commentText.trim()}
                  className="w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0 transition-colors disabled:opacity-40"
                  style={{ background: commentText.trim() ? 'var(--brand)' : 'var(--text-faint)' }}
                >
                  {submitting
                    ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <span className="flex w-3.5 h-3.5"><Icon.Send /></span>
                  }
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pro Upvoter Dialog ──────────────────────────────── */}
      <AnimatePresence>
        {showUpvoterDialog && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-[1000] p-4"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowUpvoterDialog(false)}
          >
            <motion.div
              className="bg-surface rounded-modal w-full max-w-sm max-h-[70vh] flex flex-col shadow-modal overflow-hidden"
              initial={{ scale: 0.97, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 8 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2 font-bold text-text-primary text-[15px]">
                  <span className="flex w-4 h-4" style={{ color: '#F59E0B' }}><Icon.Star /></span>
                  Pro Voters · {proCount}
                </div>
                <button
                  onClick={() => setShowUpvoterDialog(false)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-surface-elevated transition-colors"
                >
                  <span className="flex w-3.5 h-3.5 text-text-secondary"><Icon.X /></span>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-2">
                {allUpvoters.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-2 border-[#F59E0B] border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : allUpvoters.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setShowUpvoterDialog(false); navigate('/profile/' + u.username) }}
                    className="w-full flex items-center gap-3 py-2.5 border-b border-border last:border-0 hover:bg-surface-elevated -mx-1 px-1 rounded-[8px] transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-surface-elevated ring-1 ring-border flex items-center justify-center text-[12px] font-semibold text-text-secondary shrink-0">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        : initials(u.full_name)}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-[13.5px] font-bold text-text-primary">{u.full_name}</div>
                      <div className="text-[12px] text-text-secondary">@{u.username}</div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Media Lightbox ──────────────────────────────────── */}
      <AnimatePresence>
        {mediaLightbox && (
          <motion.div
            className="fixed inset-0 z-[2000] flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => setMediaLightbox(null)}
            style={{ background: 'rgba(0,0,0,0.88)' }}
          >
            <button
              onClick={() => setMediaLightbox(null)}
              className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center z-10 text-white hover:bg-white/10 transition-colors"
            >
              <span className="flex w-[18px] h-[18px]"><Icon.X /></span>
            </button>
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.93, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
              className="relative max-w-[90vw] max-h-[88vh] overflow-hidden"
            >
              {mediaLightbox.type === 'photo' ? (
                <img src={mediaLightbox.url} alt="" className="max-w-full max-h-[88vh] object-contain block" loading="lazy" decoding="async" />
              ) : (
                <video src={mediaLightbox.url} controls autoPlay className="max-w-full max-h-[88vh] block" />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* ── Delete Confirmation ─────────────────────────────── */}
      <ConfirmSheet
        open={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={deletePost}
        title="Delete this post?"
        description="This cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
      />

      {/* ── Report Sheet ────────────────────────────────────── */}
      <ReportSheet
        open={showReport}
        onClose={() => setShowReport(false)}
        targetType="post"
        targetId={post.id}
      />

      {/* ── Community editor ─────────────────────────────────── */}
      {showCommunityEditor && (
        <CommunityPickerModal
          postId={post.id}
          postDiscipline={post.persona_discipline ?? null}
          onClose={() => setShowCommunityEditor(false)}
          onSaved={() => onUpdated?.()}
        />
      )}

      {/* ── Share Bottom Sheet ──────────────────────────────── */}
      <AnimatePresence>
        {showShare && (
          <>
            <motion.div
              className="fixed inset-0 z-[800]"
              style={{ background: 'rgba(0,0,0,0.4)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setShowShare(false)}
            />
            <motion.div
              className="fixed bottom-0 left-0 right-0 z-[801] bg-surface"
              style={{
                borderRadius: '16px 16px 0 0',
                boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 rounded-full bg-border" />
              </div>
              <div className="px-4 pb-2">
                <p className="text-[17px] font-bold text-text-primary pb-2 pt-1">Share</p>

                <button
                  onClick={() => { copyPostLink(); setShowShare(false) }}
                  className="w-full flex items-center gap-3 px-4 h-12 rounded-[8px] text-[15px] text-text-primary hover:bg-surface-elevated transition-colors"
                >
                  <span className="flex w-5 h-5 text-text-secondary"><Icon.CopyLink /></span>
                  Copy link
                </button>

                {friends.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-widest px-4 pt-3 pb-1">
                      Send to a friend
                    </p>
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                      {friends.map(f => (
                        <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 rounded-[8px] hover:bg-surface-elevated">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-elevated ring-1 ring-border flex items-center justify-center text-[11px] font-semibold text-text-secondary shrink-0">
                            {f.avatar_url
                              ? <img src={f.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                              : initials(f.full_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-bold text-text-primary truncate">{f.full_name}</div>
                            <div className="text-[12px] text-text-secondary">@{f.username}</div>
                          </div>
                          <button
                            onClick={() => shareToFriend(f)}
                            disabled={sharing === f.id}
                            className="px-3 py-1.5 text-white text-[12px] font-bold rounded-badge transition-colors disabled:opacity-50 flex items-center gap-1 bg-accent hover:bg-accent-hover"
                          >
                            {sharing === f.id
                              ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                              : 'Send'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="h-px bg-border mx-2 my-1" />
                <button
                  onClick={() => setShowShare(false)}
                  className="w-full flex items-center justify-center h-12 rounded-[8px] text-[15px] font-semibold text-text-primary hover:bg-surface-elevated transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </article>
  )
}
