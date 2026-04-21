import { useState, useRef, useEffect, useMemo } from 'react'
import { useLazyLoad } from '@/hooks/useLazyLoad'
import { useNavigate, Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, Post, Comment, getCanonicalDiscipline, Profile } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import { getFriends } from '@/lib/friends'
import BottomSheet, { SheetRow, SheetCancel } from '@/components/BottomSheet'
import ConfirmSheet from '@/components/ConfirmSheet'
import ReportSheet from '@/components/ReportSheet'

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
  const [showMenu, setShowMenu] = useState(false)
  const [showMenuSheet, setShowMenuSheet] = useState(false)
  const [showConfirmDelete, setShowConfirmDelete] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [bookmarked, setBookmarked] = useState(false)
  const [mediaLightbox, setMediaLightbox] = useState<{ url: string; type: 'photo' | 'video' } | null>(null)
  const commentRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const isOwnPost = profile?.id === post.user_id
  const author = post.profiles
  const authorDiscipline = getCanonicalDiscipline(author?.profession)
  const [canProUpvote, setCanProUpvote] = useState(false)
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true })

  const { ref: mediaRef, isVisible: mediaVisible } = useLazyLoad<HTMLDivElement>()
  const thumbSrc = useMemo(() => post.thumb_url || post.media_url || '', [post.thumb_url, post.media_url])
  const displaySrc = useMemo(() => post.display_url || post.media_url || '', [post.display_url, post.media_url])
  const authorAvatarSrc = useMemo(() => author?.avatar_url || '', [author?.avatar_url])

  useEffect(() => {
    if (!showMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  // Load bookmark state
  useEffect(() => {
    if (!profile) return
    supabase.from('bookmarks').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('post_id', post.id)
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

  useEffect(() => {
    if (!mentionQuery || mentionStart === -1 || !profile) { setMentionResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id,username,full_name,avatar_url').ilike('username', mentionQuery + '%').neq('id', profile.id).limit(5)
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

  async function toggleLike() {
    if (!profile) return toast.error('Sign in to like posts')
    const was = liked; setLiked(!was); setLikeCount(c => was ? c - 1 : c + 1)
    if (was) { await supabase.from('likes').delete().match({ user_id: profile.id, post_id: post.id }) }
    else {
      await supabase.from('likes').insert({ user_id: profile.id, post_id: post.id })
      if (post.user_id !== profile.id) await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: profile.id, type: 'like', post_id: post.id })
      if (authorDiscipline) supabase.rpc('increment_discipline_score', { p_user_id: profile.id, p_discipline: authorDiscipline, p_delta: 1 })
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
      if (post.user_id !== profile.id) {
        await supabase.from('notifications').insert({
          user_id: post.user_id, actor_id: profile.id,
          type: 'pro_upvote', post_id: post.id,
        })
      }
      toast.success('Pro Vote cast!')
    }
  }

  async function loadComments() {
    if (showComments) { setShowComments(false); return }
    setShowComments(true)
    if (comments.length > 0) return
    setLoadingComments(true)
    const { data } = await supabase.from('comments').select('*, profiles(id,username,full_name,avatar_url)').eq('post_id', post.id).order('created_at', { ascending: true })
    const loaded = (data || []) as Comment[]
    setComments(loaded)
    if (post.post_type === 'pro' && post.persona_discipline && loaded.length > 0) {
      const commenterIds = [...new Set(loaded.map(c => c.user_id))]
      const { data: pd } = await supabase.from('discipline_personas').select('user_id').eq('discipline', post.persona_discipline).in('user_id', commenterIds)
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
      if (!afterAt.includes(' ') && afterAt.length <= 20) { setMentionStart(atIdx); setMentionQuery(afterAt); setMentionIndex(0); return }
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
    const { data, error } = await supabase.from('comments').insert({ post_id: post.id, user_id: profile.id, body: commentText.trim() }).select('*, profiles(id,username,full_name,avatar_url)').single()
    if (!error && data) {
      setComments(c => [...c, data as Comment]); setCommentText(''); setMentionResults([])
      if (post.user_id !== profile.id) await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: profile.id, type: 'comment', post_id: post.id })
      if (authorDiscipline) supabase.rpc('increment_discipline_score', { p_user_id: profile.id, p_discipline: authorDiscipline, p_delta: 2 })
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

  return (
    <div
      id={'post-' + post.id}
      className="apple-card mb-4 overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5 px-4 pt-3.5 pb-2.5">
        <button
          onClick={goToAuthor}
          className="w-9 h-9 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[12px] font-semibold text-blue-700 dark:text-blue-300 shrink-0"
        >
          {authorAvatarSrc ? <img src={authorAvatarSrc} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : initials(author?.full_name || '?')}
        </button>

        <div className="flex-1 min-w-0">
          <button onClick={goToAuthor} className="flex items-center gap-1.5 hover:text-brand-600 transition-colors group">
            <span className="text-[15px] font-semibold text-gray-900 dark:text-white group-hover:text-brand-600 transition-colors">{author?.full_name}</span>
          </button>
          <div className="text-[13px] text-gray-400 dark:text-gray-500">
            @{author?.username} · {timeAgo}
          </div>
        </div>

        {/* 3-dot menu button */}
        <button
          onClick={() => setShowMenuSheet(true)}
          className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: '#6B7280' }}
          title="More options"
        >
          <span className="flex w-5 h-5"><Icon.MoreHorizontal /></span>
        </button>
      </div>

      {/* ── Media ── */}
      {post.content_type === 'photo' && post.media_url && (
        <div
          ref={mediaRef}
          className="cursor-zoom-in bg-gray-50 dark:bg-gray-800 border-y border-gray-100 dark:border-gray-800 flex items-center justify-center min-h-[200px]"
          onClick={() => setMediaLightbox({ url: displaySrc, type: 'photo' })}
        >
          {mediaVisible && <img src={thumbSrc} alt="post" className="w-full max-h-[480px] object-cover block" loading="lazy" decoding="async" />}
        </div>
      )}
      {post.content_type === 'video' && post.media_url && (
        <div className="aspect-video bg-gray-900 border-y border-gray-100 dark:border-gray-800 overflow-hidden">
          <video controls src={post.media_url} className="w-full h-full object-contain" />
        </div>
      )}
      {post.content_type === 'audio' && post.media_url && (
        <div className="px-4 py-3.5 border-y border-gray-100 dark:border-gray-800 bg-brand-50 dark:bg-brand-950/30">
          <div className="flex items-center gap-2 text-[13px] font-medium text-brand-600 dark:text-brand-400 mb-2">
            <span className="flex w-3.5 h-3.5"><Icon.Music /></span>
            {post.caption || 'Audio'}
          </div>
          <audio controls src={post.media_url} className="w-full accent-brand-600" />
        </div>
      )}
      {post.content_type === 'poem' && post.poem_text && (
        <div className="px-6 py-5 border-y border-gray-100 dark:border-gray-800 bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-gray-900">
          <div className="text-4xl text-amber-400 opacity-40 leading-none mb-1 font-serif">"</div>
          <p className="font-serif italic text-[15px] leading-8 text-gray-700 dark:text-gray-300 whitespace-pre-line">{post.poem_text}</p>
        </div>
      )}
      {post.content_type === 'document' && post.media_url && (
        <div className="flex items-center gap-3 px-4 py-3.5 border-y border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
          <div className="w-10 h-10 bg-brand-50 dark:bg-brand-950/50 rounded-xl flex items-center justify-center shrink-0">
            <span className="flex w-5 h-5 text-brand-600 dark:text-brand-400"><Icon.FileText /></span>
          </div>
          <div>
            <div className="text-[13.5px] font-medium text-gray-900 dark:text-white">{post.caption || 'Document'}</div>
            <a href={post.media_url} target="_blank" rel="noreferrer" className="text-[12px] text-brand-600 dark:text-brand-400 hover:underline">
              Open document
            </a>
          </div>
        </div>
      )}

      {/* ── Caption ── */}
      {post.caption && post.content_type !== 'audio' && (
        <div className="px-4 py-2.5 text-[15px] leading-[1.65] text-gray-800 dark:text-gray-200">
          {post.caption.split(' ').map((word, i) =>
            word.startsWith('#')
              ? <span key={i} className="text-brand-600 dark:text-brand-400 cursor-pointer hover:underline">{word} </span>
              : word.startsWith('@')
              ? <span key={i} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline" onClick={() => navigate('/profile/' + word.slice(1))}>{word} </span>
              : <span key={i}>{word} </span>
          )}
        </div>
      )}

      {/* ── Group chip ── */}
      {post.group && (
        <div className="px-4 pb-2">
          <Link
            to={'/groups/' + post.group.slug}
            className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full px-3 py-1 transition-colors"
          >
            {post.group.name}
          </Link>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center px-2.5 py-1.5 border-t border-[#E5E7EB] gap-0.5">
        {/* Like */}
        <button
          onClick={toggleLike}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-[8px] text-[13px] transition-colors"
          style={{ color: liked ? '#EF4444' : '#6B7280' }}
          onMouseEnter={e => { if (!liked) (e.currentTarget as HTMLButtonElement).style.background = '#F8F8F6' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <span className="flex w-4 h-4"><Icon.Heart filled={liked} /></span>
          <span className="tabular-nums">{likeCount}</span>
        </button>

        {/* Comment */}
        <button
          onClick={loadComments}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-[8px] text-[13px] transition-colors"
          style={{ color: '#6B7280' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F8F8F6' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <span className="flex w-4 h-4"><Icon.MessageCircle /></span>
          <span className="tabular-nums">{post.comment_count}</span>
        </button>

        {/* Share */}
        <button
          onClick={openShare}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-[8px] text-[13px] transition-colors"
          style={{ color: '#6B7280' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F8F8F6' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <span className="flex w-4 h-4"><Icon.Share /></span>
        </button>

        {/* Bookmark */}
        <button
          onClick={toggleBookmark}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-[8px] text-[13px] transition-colors"
          style={{ color: bookmarked ? '#2563EB' : '#6B7280' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F8F8F6' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <span className="flex w-4 h-4">{bookmarked ? <Icon.BookmarkFill /> : <Icon.Bookmark />}</span>
        </button>

        {/* Pro upvote */}
        <div
          className="relative ml-auto"
          onMouseEnter={() => {
            if (proCount === 0) return
            upvoterTimerRef.current = setTimeout(async () => {
              setUpvoterLoading(true); setShowUpvoterTooltip(true)
              const { data } = await supabase.from('pro_upvotes').select('profiles:user_id(id,username,full_name,avatar_url)').eq('post_id', post.id).limit(5)
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
            onClick={canProUpvote ? toggleProUpvote : () => toast('Only verified creators in the same field can give Pro Upvotes')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition-colors ${
              proUpvoted
                ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                : canProUpvote
                ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/50'
                : 'text-gray-400 dark:text-gray-600 border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
            }`}
          >
            <span className="flex w-3.5 h-3.5"><Icon.Award /></span>
            <span>{proCount} Pro</span>
          </button>

          {/* Upvoter tooltip */}
          <AnimatePresence>
            {showUpvoterTooltip && proCount > 0 && (
              <motion.div
                className="absolute bottom-full right-0 mb-2 w-52 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-modal py-1.5 z-30"
                initial={{ opacity: 0, y: 4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.1 }}
              >
                {upvoterLoading ? (
                  <div className="flex justify-center py-3">
                    <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    {upvoterPreview.map(u => (
                      <div key={u.id} className="flex items-center gap-2 px-3 py-1.5">
                        <div className="w-6 h-6 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[9px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
                          {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : initials(u.full_name)}
                        </div>
                        <span className="text-[12.5px] font-medium text-gray-900 dark:text-white truncate">{u.full_name}</span>
                      </div>
                    ))}
                    {proCount > 5 && (
                      <button
                        onMouseDown={async e => {
                          e.preventDefault(); setShowUpvoterTooltip(false); setShowUpvoterDialog(true)
                          const { data } = await supabase.from('pro_upvotes').select('profiles:user_id(id,username,full_name,avatar_url,profession)').eq('post_id', post.id)
                          setAllUpvoters((data || []).map((r: any) => r.profiles).filter(Boolean) as Profile[])
                        }}
                        className="w-full text-left px-3 py-1.5 text-[12px] text-brand-600 dark:text-brand-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-t border-gray-100 dark:border-gray-700 mt-1"
                      >
                        View all {proCount} Pro Upvoters →
                      </button>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Comments ── */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/60 px-4 py-3"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
          >
            {loadingComments ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-2.5 mb-3">
                {[...comments]
                  .sort((a, b) => {
                    if (post.post_type !== 'pro') return 0
                    return (proCommenters.has(b.user_id) ? 1 : 0) - (proCommenters.has(a.user_id) ? 1 : 0)
                  })
                  .map((c: Comment) => {
                    const isPro = proCommenters.has(c.user_id)
                    return (
                      <div key={c.id} className="flex items-start gap-2 group">
                        <button
                          onClick={() => c.profiles?.username && navigate('/profile/' + c.profiles.username)}
                          className="w-7 h-7 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[9px] font-semibold text-blue-700 dark:text-blue-300 shrink-0 mt-0.5"
                        >
                          {c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : initials(c.profiles?.full_name || '?')}
                        </button>
                        <div className={`flex-1 min-w-0 px-3 py-2 rounded-xl rounded-tl-sm text-[13px] border ${
                          isPro
                            ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
                            : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
                        }`}>
                          <button
                            onClick={() => c.profiles?.username && navigate('/profile/' + c.profiles.username)}
                            className={`text-[12px] font-semibold mb-0.5 block hover:text-brand-600 transition-colors ${isPro ? 'text-amber-700 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}
                          >
                            @{c.profiles?.username}
                            {isPro && <span className="ml-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">PRO</span>}
                          </button>
                          <p className="text-gray-600 dark:text-gray-300 leading-snug">
                            {c.body.split(' ').map((w: string, i: number) =>
                              w.startsWith('@')
                                ? <span key={i} className="text-blue-600 dark:text-blue-400 cursor-pointer hover:underline" onClick={() => navigate('/profile/' + w.slice(1))}>{w} </span>
                                : <span key={i}>{w} </span>
                            )}
                          </p>
                        </div>
                        {profile && c.user_id === profile.id && (
                          <button
                            onClick={() => deleteComment(c.id)}
                            className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-all shrink-0 mt-0.5"
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
                <div className="absolute bottom-full left-0 mb-1 w-56 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-modal py-1 z-20">
                  {mentionResults.map((r, i) => (
                    <button
                      key={r.id}
                      onMouseDown={e => { e.preventDefault(); pickMention(r.username) }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${i === mentionIndex ? 'bg-gray-50 dark:bg-gray-700' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    >
                      <div className="w-6 h-6 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[9px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
                        {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : initials(r.full_name)}
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white text-[13px]">{r.full_name}</span>
                      <span className="text-[12px] text-gray-400 dark:text-gray-500 ml-auto">@{r.username}</span>
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
                  className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-4 py-2 text-[13px] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-brand-400 dark:focus:border-brand-500 transition-colors"
                />
                <button
                  onClick={submitComment}
                  disabled={submitting || !commentText.trim()}
                  className="w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0 transition-colors disabled:opacity-40"
                  style={{ background: commentText.trim() ? '#1A1A1A' : '#D1D5DB' }}
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

      {/* ── Pro Upvoter Dialog ── */}
      <AnimatePresence>
        {showUpvoterDialog && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[1000] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowUpvoterDialog(false)}
          >
            <motion.div
              className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col shadow-2xl overflow-hidden"
              initial={{ scale: 0.97, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 8 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                  <span className="flex w-4 h-4 text-amber-500"><Icon.Award /></span>
                  Pro Upvoters · {proCount}
                </div>
                <button onClick={() => setShowUpvoterDialog(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <span className="flex w-3.5 h-3.5 text-gray-500"><Icon.X /></span>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-5 py-2">
                {allUpvoters.length === 0 ? (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : allUpvoters.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setShowUpvoterDialog(false); navigate('/profile/' + u.username) }}
                    className="w-full flex items-center gap-3 py-2.5 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800 -mx-1 px-1 rounded-lg transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[12px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
                      {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : initials(u.full_name)}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="text-[13.5px] font-semibold text-gray-900 dark:text-white">{u.full_name}</div>
                      <div className="text-[12px] text-gray-400 dark:text-gray-500">@{u.username}</div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Media Lightbox ── */}
      <AnimatePresence>
        {mediaLightbox && (
          <motion.div
            className="fixed inset-0 z-[2000] flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={() => setMediaLightbox(null)}
            style={{
              backdropFilter: 'blur(28px) saturate(160%) brightness(0.45)',
              WebkitBackdropFilter: 'blur(28px) saturate(160%) brightness(0.45)',
              background: 'rgba(0, 0, 0, 0.55)',
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setMediaLightbox(null)}
              className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center transition-all z-10"
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: '0.5px solid rgba(255,255,255,0.18)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <span className="flex w-[18px] h-[18px] text-white"><Icon.X /></span>
            </button>

            {/* Media container */}
            <motion.div
              initial={{ scale: 0.88, opacity: 0, y: 24 }}
              animate={{ scale: 1,    opacity: 1, y: 0  }}
              exit={{    scale: 0.92, opacity: 0, y: 12 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              onClick={e => e.stopPropagation()}
              className="relative max-w-[90vw] max-h-[88vh] overflow-hidden"
              style={{
                boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.12)',
              }}
            >
              {mediaLightbox.type === 'photo' ? (
                <img
                  src={mediaLightbox.url}
                  alt=""
                  className="max-w-full max-h-[88vh] object-contain block"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <video
                  src={mediaLightbox.url}
                  controls
                  autoPlay
                  className="max-w-full max-h-[88vh] block"
                />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 3-dot Bottom Sheet ── */}
      <BottomSheet open={showMenuSheet} onClose={() => setShowMenuSheet(false)}>
        {isOwnPost ? (
          <>
            <SheetRow
              icon={<Icon.CopyLink />}
              label="Copy link"
              onClick={copyPostLink}
            />
            <SheetRow
              icon={<Icon.Trash />}
              label="Delete post"
              danger
              onClick={() => { setShowMenuSheet(false); setShowConfirmDelete(true) }}
            />
          </>
        ) : (
          <>
            <SheetRow
              icon={<Icon.EyeSlash />}
              label="Not interested"
              onClick={() => { toast.success("Got it. We'll show fewer posts like this."); setShowMenuSheet(false) }}
            />
            <SheetRow
              icon={<Icon.CopyLink />}
              label="Copy link"
              onClick={copyPostLink}
            />
            <SheetRow
              icon={<Icon.Flag />}
              label="Report post"
              danger
              onClick={() => { setShowMenuSheet(false); setShowReport(true) }}
            />
          </>
        )}
        <SheetCancel onClose={() => setShowMenuSheet(false)} />
      </BottomSheet>

      {/* ── Delete Confirmation ── */}
      <ConfirmSheet
        open={showConfirmDelete}
        onClose={() => setShowConfirmDelete(false)}
        onConfirm={deletePost}
        title="Delete this post?"
        description="This cannot be undone."
        confirmLabel="Delete"
        loading={deleting}
      />

      {/* ── Report Sheet ── */}
      <ReportSheet
        open={showReport}
        onClose={() => setShowReport(false)}
        targetType="post"
        targetId={post.id}
      />

      {/* ── Share Bottom Sheet ── */}
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
              className="fixed bottom-0 left-0 right-0 z-[801]"
              style={{ background: '#FFFFFF', borderRadius: '16px 16px 0 0', boxShadow: '0 -4px 24px rgba(0,0,0,0.08)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            >
              <div className="flex justify-center pt-3 pb-1"><div className="w-9 h-1 rounded-full bg-[#E5E7EB]" /></div>
              <div className="px-4 pb-2">
                <p className="text-[17px] font-semibold text-[#111111] pb-2 pt-1">Share</p>

                {/* Copy link */}
                <button
                  onClick={() => { copyPostLink(); setShowShare(false) }}
                  className="w-full flex items-center gap-3 px-4 h-12 rounded-[8px] text-[15px] text-[#1A1A1A] hover:bg-[#F8F8F6] transition-colors"
                >
                  <span className="flex w-5 h-5 text-[#6B7280]"><Icon.CopyLink /></span>
                  Copy link
                </button>

                {/* Send via DM */}
                {friends.length > 0 && (
                  <>
                    <p className="text-[12px] font-semibold text-[#9CA3AF] uppercase tracking-widest px-4 pt-3 pb-1">Send to a friend</p>
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                      {friends.map(f => (
                        <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 rounded-[8px] hover:bg-[#F8F8F6]">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-[#DBEAFE] flex items-center justify-center text-[11px] font-semibold text-[#1D4ED8] shrink-0">
                            {f.avatar_url ? <img src={f.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : initials(f.full_name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-semibold text-[#111111] truncate">{f.full_name}</div>
                            <div className="text-[12px] text-[#9CA3AF]">@{f.username}</div>
                          </div>
                          <button
                            onClick={() => shareToFriend(f)}
                            disabled={sharing === f.id}
                            className="px-3 py-1.5 text-white text-[12px] font-semibold rounded-full transition-colors disabled:opacity-50 flex items-center gap-1"
                            style={{ background: '#1A1A1A' }}
                          >
                            {sharing === f.id ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : 'Send'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="h-px bg-[#E5E7EB] mx-2 my-1" />
                <button
                  onClick={() => setShowShare(false)}
                  className="w-full flex items-center justify-center h-12 rounded-[8px] text-[15px] font-semibold text-[#1A1A1A] hover:bg-[#F8F8F6] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
