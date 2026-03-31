import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import { supabase, Post, Comment, getCanonicalDiscipline, Profile } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import { getFriends } from '@/lib/friends'


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
  const [deleting, setDeleting] = useState(false)
  const [mediaLightbox, setMediaLightbox] = useState<{ url: string; type: 'photo' | 'video' } | null>(null)
  const commentRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const isOwnPost = profile?.id === post.user_id

  useEffect(() => {
    if (!showMenu) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  async function deletePost() {
    if (!profile || !isOwnPost) return
    setDeleting(true)
    setShowMenu(false)
    const { error } = await supabase.from('posts').delete().eq('id', post.id)
    if (error) { toast.error('Failed to delete: ' + error.message); setDeleting(false); return }
    if (post.media_path) await supabase.storage.from('posts').remove([post.media_path])
    toast.success('Post deleted')
    onUpdated?.()
  }

  const author = post.profiles
  const authorDiscipline = getCanonicalDiscipline(author?.profession)
  const [canProUpvote, setCanProUpvote] = useState(false)

  useEffect(() => {
    if (!profile || !post.persona_discipline || post.user_id === profile.id || post.post_type !== 'pro') {
      setCanProUpvote(false)
      return
    }
    supabase
      .from('discipline_personas')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('discipline', post.persona_discipline)
      .then((res) => setCanProUpvote((res.count ?? 0) > 0))
  }, [profile?.id, post.persona_discipline, post.user_id, post.post_type])

  function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }
  function goToAuthor() { if (author?.username) navigate('/profile/' + author.username) }

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
    if (was) { await supabase.from('pro_upvotes').delete().match({ user_id: profile.id, post_id: post.id }) }
    else {
      await supabase.from('pro_upvotes').insert({ user_id: profile.id, post_id: post.id, profession: profile.profession })
      if (post.user_id !== profile.id) await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: profile.id, type: 'pro_upvote', post_id: post.id })
      if (authorDiscipline) supabase.rpc('increment_discipline_score', { p_user_id: profile.id, p_discipline: authorDiscipline, p_delta: 5 })
      toast.success('Pro Upvote given!')
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
    // For Pro posts: find which commenters have a persona in this discipline
    if (post.post_type === 'pro' && post.persona_discipline && loaded.length > 0) {
      const commenterIds = [...new Set(loaded.map(c => c.user_id))]
      const { data: pd } = await supabase.from('discipline_personas')
        .select('user_id')
        .eq('discipline', post.persona_discipline)
        .in('user_id', commenterIds)
      setProCommenters(new Set((pd || []).map((r: any) => r.user_id as string)))
    }
    setLoadingComments(false)
  }

  function handleCommentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setCommentText(val)
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

  useEffect(() => {
    if (!mentionQuery || mentionStart === -1 || !profile) { setMentionResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id,username,full_name,avatar_url').ilike('username', mentionQuery + '%').neq('id', profile.id).limit(5)
      setMentionResults((data || []) as Profile[])
    }, 180)
    return () => clearTimeout(t)
  }, [mentionQuery, mentionStart])

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

  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true })

  return (
    <div className="post-card" id={'post-' + post.id}>
      <div className="post-header">
        <div className="post-avatar" onClick={goToAuthor}>
          {author?.avatar_url ? <img src={author.avatar_url} alt="" /> : initials(author?.full_name || '?')}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="post-author" onClick={goToAuthor}>
            <span className="post-author-name">{author?.full_name}</span>
          </div>
          <div className="post-time" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>@{author?.username} · {timeAgo}</span>
          </div>
        </div>
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button className="post-more" style={{ background:'none', border:'none', cursor:'pointer' }} onClick={() => setShowMenu(v => !v)}>···</button>
          {showMenu && (
            <div className="post-menu-dropdown">
              {isOwnPost && (
                <button className="post-menu-item post-menu-item-danger" onClick={deletePost} disabled={deleting}>
                  <span style={{ display:'flex', width:13, height:13 }}><Icon.Trash /></span>
                  {deleting ? 'Deleting…' : 'Delete post'}
                </button>
              )}
              {!isOwnPost && (
                <button className="post-menu-item" onClick={() => setShowMenu(false)}>
                  Report
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {post.content_type === 'photo' && post.media_url && (
        <div className="media-photo" style={{ cursor: 'zoom-in' }} onClick={() => setMediaLightbox({ url: post.media_url!, type: 'photo' })}>
          <img src={post.media_url} alt="post" />
        </div>
      )}
      {post.content_type === 'video' && post.media_url && (
        <div className="media-video" onClick={e => { if ((e.target as HTMLElement).tagName !== 'VIDEO') setMediaLightbox({ url: post.media_url!, type: 'video' }) }}>
          <video controls src={post.media_url} />
        </div>
      )}
      {post.content_type === 'audio' && post.media_url && (
        <div className="media-audio">
          <div className="audio-title"><span style={{ display:'flex', width:14, height:14 }}><Icon.Music /></span>{post.caption || 'Audio'}</div>
          <audio controls src={post.media_url} style={{ width:'100%' }} />
        </div>
      )}
      {post.content_type === 'poem' && post.poem_text && (
        <div className="media-poem"><div className="poem-quote">"</div>{post.poem_text}</div>
      )}
      {post.content_type === 'document' && post.media_url && (
        <div className="media-doc">
          <div className="doc-icon-wrap"><Icon.FileText /></div>
          <div><div className="doc-name">{post.caption || 'Document'}</div><a href={post.media_url} target="_blank" rel="noreferrer" style={{ color:'var(--color-primary)', fontSize:12 }}>Open document</a></div>
        </div>
      )}

      {post.caption && post.content_type !== 'audio' && (
        <div className="post-caption">
          {post.caption.split(' ').map((word, i) =>
            word.startsWith('#') ? <span key={i} className="tag">{word} </span> :
            word.startsWith('@') ? <span key={i} className="mention" onClick={() => navigate('/profile/' + word.slice(1))}>{word} </span> :
            <span key={i}>{word} </span>
          )}
        </div>
      )}
      {post.group && (
        <Link to={'/groups/' + post.group.slug} className="post-group-chip">
          {post.group.name}
        </Link>
      )}

      <div className="post-actions">
        <button className={'act-btn ' + (liked ? 'liked' : '')} onClick={toggleLike}>
          <span style={{ display:'flex', width:16, height:16 }}>{liked ? <Icon.Heart filled /> : <Icon.Heart />}</span>
          <span className="act-count">{likeCount}</span>
        </button>
        <button className="act-btn" onClick={loadComments}>
          <span style={{ display:'flex', width:16, height:16 }}><Icon.MessageCircle /></span>
          <span className="act-count">{post.comment_count}</span>
        </button>
        <button className="act-btn" onClick={openShare}>
          <span style={{ display:'flex', width:16, height:16 }}><Icon.Share /></span>
        </button>
        <div
          className="pro-btn-wrap"
          onMouseEnter={() => {
            if (proCount === 0) return
            upvoterTimerRef.current = setTimeout(async () => {
              setUpvoterLoading(true)
              setShowUpvoterTooltip(true)
              const { data } = await supabase
                .from('pro_upvotes')
                .select('profiles:user_id(id,username,full_name,avatar_url)')
                .eq('post_id', post.id)
                .limit(5)
              const profiles = (data || []).map((r: any) => r.profiles).filter(Boolean) as Profile[]
              setUpvoterPreview(profiles)
              setUpvoterTotal(proCount)
              setUpvoterLoading(false)
            }, 300)
          }}
          onMouseLeave={() => {
            if (upvoterTimerRef.current) clearTimeout(upvoterTimerRef.current)
            setShowUpvoterTooltip(false)
          }}
          style={{ position:'relative' }}
        >
          <button
            className={'pro-btn ' + (proUpvoted ? 'active' : '') + ' ' + (!canProUpvote ? 'locked' : '')}
            onClick={canProUpvote ? toggleProUpvote : () => toast('Only verified creators in the same field can give Pro Upvotes')}
          >
            <span style={{ display:'flex', width:13, height:13 }}><Icon.Award /></span>
            <span>{proCount} Pro</span>
          </button>

          {showUpvoterTooltip && proCount > 0 && (
            <div className="pro-upvoter-tooltip">
              {upvoterLoading ? (
                <div style={{ padding:'8px 12px' }}><div className="spinner" style={{ width:12, height:12 }} /></div>
              ) : upvoterPreview.length === 0 ? null : (
                <>
                  <div className="pro-upvoter-list">
                    {upvoterPreview.map(u => (
                      <div key={u.id} className="pro-upvoter-row">
                        <div className="pro-upvoter-av">
                          {u.avatar_url ? <img src={u.avatar_url} alt="" /> : initials(u.full_name)}
                        </div>
                        <span className="pro-upvoter-name">{u.full_name}</span>
                      </div>
                    ))}
                    {proCount > 5 && (
                      <div className="pro-upvoter-row pro-upvoter-more">
                        ···  {proCount - 5} more
                      </div>
                    )}
                  </div>
                  {proCount > 5 && (
                    <button
                      className="pro-upvoter-view-all"
                      onMouseDown={async e => {
                        e.preventDefault()
                        setShowUpvoterTooltip(false)
                        setShowUpvoterDialog(true)
                        const { data } = await supabase
                          .from('pro_upvotes')
                          .select('profiles:user_id(id,username,full_name,avatar_url,profession)')
                          .eq('post_id', post.id)
                        const all = (data || []).map((r: any) => r.profiles).filter(Boolean) as Profile[]
                        setAllUpvoters(all)
                      }}
                    >
                      View all {proCount} Pro Upvoters
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showUpvoterDialog && (
        <div className="modal-overlay" onClick={() => setShowUpvoterDialog(false)}>
          <div className="modal" style={{ width:380, maxHeight:'70vh', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <span style={{ display:'flex', width:14, height:14, color:'var(--color-pro)', marginRight:6 }}><Icon.Award /></span>
                Pro Upvoters · {proCount}
              </div>
              <button className="modal-close" onClick={() => setShowUpvoterDialog(false)}><Icon.X /></button>
            </div>
            <div style={{ overflowY:'auto', flex:1 }}>
              {allUpvoters.length === 0 ? (
                <div style={{ padding:'20px 0', textAlign:'center' }}><div className="spinner" /></div>
              ) : allUpvoters.map(u => {
                return (
                  <div key={u.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--color-border)' }}>
                    <div className="post-avatar" style={{ width:38, height:38, fontSize:13, flexShrink:0, cursor:'pointer' }}
                      onClick={() => { setShowUpvoterDialog(false); navigate('/profile/' + u.username) }}>
                      {u.avatar_url ? <img src={u.avatar_url} alt="" /> : initials(u.full_name)}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:13.5, cursor:'pointer' }} onClick={() => { setShowUpvoterDialog(false); navigate('/profile/' + u.username) }}>{u.full_name}</div>
                      <div style={{ fontSize:12, color:'var(--color-text-3)' }}>@{u.username}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {showComments && (
        <div className="comments-wrap">
          {loadingComments
            ? <div style={{ display:'flex', justifyContent:'center', padding:12 }}><div className="spinner" /></div>
            : [...comments]
                // Pro posts: Pro commenters float to top, then chronological
                .sort((a, b) => {
                  if (post.post_type !== 'pro') return 0
                  const aPro = proCommenters.has(a.user_id) ? 1 : 0
                  const bPro = proCommenters.has(b.user_id) ? 1 : 0
                  return bPro - aPro
                })
                .map((c: Comment) => {
                  const isPro = proCommenters.has(c.user_id)
                  return (
              <div key={c.id} className={'comment-item' + (isPro ? ' comment-item-pro' : '')}>
                <div className="post-avatar" style={{ width:28, height:28, fontSize:10, flexShrink:0, cursor:'pointer' }} onClick={() => c.profiles?.username && navigate('/profile/' + c.profiles.username)}>
                  {c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} alt="" /> : initials(c.profiles?.full_name || '?')}
                </div>
                <div className="comment-bubble" style={{ flex:1, minWidth:0 }}>
                  <div className="comment-author" onClick={() => c.profiles?.username && navigate('/profile/' + c.profiles.username)}>
                    @{c.profiles?.username}
                  </div>
                  <div className="comment-text">
                    {c.body.split(' ').map((w: string, i: number) =>
                      w.startsWith('@') ? <span key={i} className="mention" onClick={() => navigate('/profile/' + w.slice(1))}>{w} </span> : <span key={i}>{w} </span>
                    )}
                  </div>
                </div>
                {profile && c.user_id === profile.id && (
                  <button
                    className="comment-delete-btn"
                    onClick={() => deleteComment(c.id)}
                    title="Delete comment"
                  >
                    <span style={{ display:'flex', width:12, height:12 }}><Icon.Trash /></span>
                  </button>
                )}
              </div>
                  )
                })
          }
          <div style={{ position:'relative', marginTop:10 }}>
            {mentionResults.length > 0 && (
              <div className="mention-dropdown">
                {mentionResults.map((r, i) => (
                  <button key={r.id} className={'mention-option ' + (i === mentionIndex ? 'active' : '')} onMouseDown={e => { e.preventDefault(); pickMention(r.username) }}>
                    <div className="post-avatar" style={{ width:24, height:24, fontSize:8, flexShrink:0 }}>
                      {r.avatar_url ? <img src={r.avatar_url} alt="" /> : initials(r.full_name)}
                    </div>
                    <span style={{ fontWeight:500, fontSize:13 }}>{r.full_name}</span>
                    <span style={{ fontSize:12, color:'var(--color-text-3)' }}>@{r.username}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="comment-input-row">
              <input ref={commentRef} className="comment-input" placeholder="Add a comment… (@ to mention)" value={commentText} onChange={handleCommentChange} onKeyDown={handleCommentKey} />
              <button className="comment-submit" onClick={submitComment} disabled={submitting}>
                {submitting ? <div className="spinner" style={{ width:12, height:12 }} /> : <span style={{ display:'flex', width:14, height:14 }}><Icon.Send /></span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {mediaLightbox && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.92)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={() => setMediaLightbox(null)}
        >
          <button
            onClick={() => setMediaLightbox(null)}
            style={{ position:'absolute', top:16, right:16, background:'rgba(255,255,255,0.12)', border:'none', borderRadius:'50%', width:40, height:40, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#fff', zIndex:1 }}
          >
            <span style={{ display:'flex', width:18, height:18 }}><Icon.X /></span>
          </button>
          {mediaLightbox.type === 'photo' ? (
            <img
              src={mediaLightbox.url}
              alt=""
              onClick={e => e.stopPropagation()}
              style={{ maxWidth:'100%', maxHeight:'90vh', objectFit:'contain', borderRadius:8 }}
            />
          ) : (
            <video
              src={mediaLightbox.url}
              controls
              autoPlay
              onClick={e => e.stopPropagation()}
              style={{ maxWidth:'100%', maxHeight:'90vh', borderRadius:8 }}
            />
          )}
        </div>
      )}

      {showShare && (
        <div className="modal-overlay" onClick={() => setShowShare(false)}>
          <div className="modal" style={{ width:380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Share post</div>
              <button className="modal-close" onClick={() => setShowShare(false)}><Icon.X /></button>
            </div>
            <div style={{ marginBottom:12 }}>
              <button className="btn btn-ghost btn-sm btn-full" style={{ gap:8 }} onClick={() => { navigator.clipboard.writeText(window.location.origin + '/profile/' + author?.username); toast.success('Link copied!'); setShowShare(false) }}>
                <span style={{ display:'flex', width:14, height:14 }}><Icon.Link /></span> Copy link
              </button>
            </div>
            {friends.length > 0 && (
              <>
                <div style={{ fontSize:11, fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase', color:'var(--color-text-3)', marginBottom:8 }}>Send to a friend</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {friends.map(f => (
                    <div key={f.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:'var(--r-md)', background:'var(--gray-50)', border:'1px solid var(--color-border)' }}>
                      <div className="post-avatar" style={{ width:32, height:32, fontSize:11, flexShrink:0 }}>
                        {f.avatar_url ? <img src={f.avatar_url} alt="" /> : initials(f.full_name)}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:500, fontSize:13 }}>{f.full_name}</div>
                        <div style={{ fontSize:11.5, color:'var(--color-text-3)' }}>@{f.username}</div>
                      </div>
                      <button className="btn btn-primary btn-xs" disabled={sharing === f.id} onClick={() => shareToFriend(f)}>
                        {sharing === f.id ? <div className="spinner" style={{ width:10, height:10 }} /> : 'Send'}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
            {friends.length === 0 && <div style={{ textAlign:'center', color:'var(--color-text-3)', fontSize:13, padding:'12px 0' }}>Add friends to share posts with them</div>}
          </div>
        </div>
      )}
    </div>
  )
}
