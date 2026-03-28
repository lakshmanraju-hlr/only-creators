import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import { supabase, Post, Comment, PROFESSIONS } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'

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

  const author = post.profiles
  const profMeta = author?.profession ? PROFESSIONS[author.profession] : null
  const canProUpvote = !!(profile?.profession && author?.profession && profile.profession === author.profession && profile.id !== post.user_id)

  function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }
  function goToAuthor() { if (author?.username) navigate(`/profile/${author.username}`) }

  async function toggleLike() {
    if (!profile) return toast.error('Sign in to like posts')
    const was = liked; setLiked(!was); setLikeCount(c => was ? c - 1 : c + 1)
    if (was) {
      await supabase.from('likes').delete().match({ user_id: profile.id, post_id: post.id })
    } else {
      await supabase.from('likes').insert({ user_id: profile.id, post_id: post.id })
      if (post.user_id !== profile.id) await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: profile.id, type: 'like', post_id: post.id })
    }
  }

  async function toggleProUpvote() {
    if (!canProUpvote || !profile) return
    const was = proUpvoted; setProUpvoted(!was); setProCount(c => was ? c - 1 : c + 1)
    if (was) {
      await supabase.from('pro_upvotes').delete().match({ user_id: profile.id, post_id: post.id })
    } else {
      await supabase.from('pro_upvotes').insert({ user_id: profile.id, post_id: post.id, profession: profile.profession })
      if (post.user_id !== profile.id) await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: profile.id, type: 'pro_upvote', post_id: post.id })
      toast.success('Pro Upvote given!')
    }
  }

  async function loadComments() {
    if (showComments) { setShowComments(false); return }
    setShowComments(true)
    if (comments.length > 0) return
    setLoadingComments(true)
    const { data } = await supabase.from('comments').select('*, profiles(id,username,full_name,avatar_url)').eq('post_id', post.id).order('created_at', { ascending: true })
    setComments((data || []) as Comment[])
    setLoadingComments(false)
  }

  async function submitComment() {
    if (!profile || !commentText.trim()) return
    setSubmitting(true)
    const { data, error } = await supabase.from('comments').insert({ post_id: post.id, user_id: profile.id, body: commentText.trim() }).select('*, profiles(id,username,full_name,avatar_url)').single()
    if (!error && data) {
      setComments(c => [...c, data as Comment])
      setCommentText('')
      if (post.user_id !== profile.id) await supabase.from('notifications').insert({ user_id: post.user_id, actor_id: profile.id, type: 'comment', post_id: post.id })
    }
    setSubmitting(false)
  }

  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true })

  return (
    <div className="post-card">
      <div className="post-header">
        <div className="post-avatar" onClick={goToAuthor}>
          {author?.avatar_url ? <img src={author.avatar_url} alt="" /> : initials(author?.full_name || '?')}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div className="post-author" onClick={goToAuthor}>
            <span className="post-author-name">{author?.full_name}</span>
            {profMeta && <span className={`pill pill-${profMeta.pillClass}`}>{profMeta.label}</span>}
          </div>
          <div className="post-time">@{author?.username} · {timeAgo}</div>
        </div>
        <button className="post-more" style={{ background:'none', border:'none', cursor:'pointer' }}>···</button>
      </div>

      {/* Media */}
      {post.content_type === 'photo' && post.media_url && <div className="media-photo"><img src={post.media_url} alt="post" /></div>}
      {post.content_type === 'video' && post.media_url && <div className="media-video"><video controls src={post.media_url} /></div>}
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
          <div>
            <div className="doc-name">{post.caption || 'Document'}</div>
            <a href={post.media_url} target="_blank" rel="noreferrer" style={{ color:'var(--color-primary)', fontSize:12 }}>Open document</a>
          </div>
        </div>
      )}

      {/* Caption */}
      {post.caption && post.content_type !== 'audio' && (
        <div className="post-caption">
          {post.caption.split(' ').map((word, i) =>
            word.startsWith('#') ? <span key={i} className="tag">{word} </span> : <span key={i}>{word} </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="post-actions">
        <button className={`act-btn ${liked ? 'liked' : ''}`} onClick={toggleLike}>
          <span style={{ display:'flex', width:16, height:16 }}>
            {liked ? <Icon.Heart filled /> : <Icon.Heart />}
          </span>
          <span className="act-count">{likeCount}</span>
        </button>
        <button className="act-btn" onClick={loadComments}>
          <span style={{ display:'flex', width:16, height:16 }}><Icon.MessageCircle /></span>
          <span className="act-count">{post.comment_count}</span>
        </button>
        <button className="act-btn" onClick={() => { navigator.clipboard.writeText(window.location.origin + '/profile/' + author?.username); toast.success('Link copied!') }}>
          <span style={{ display:'flex', width:16, height:16 }}><Icon.Share /></span>
        </button>
        <button
          className={`pro-btn ${proUpvoted ? 'active' : ''} ${!canProUpvote ? 'locked' : ''}`}
          onClick={canProUpvote ? toggleProUpvote : () => toast('Only verified creators in the same discipline can give Pro Upvotes')}
        >
          <span style={{ display:'flex', width:13, height:13 }}><Icon.Award /></span>
          <span>{proCount} Pro</span>
        </button>
      </div>

      {/* Comments */}
      {showComments && (
        <div className="comments-wrap">
          {loadingComments
            ? <div style={{ display:'flex', justifyContent:'center', padding:12 }}><div className="spinner" /></div>
            : comments.map(c => (
              <div key={c.id} className="comment-item">
                <div className="post-avatar" style={{ width:28, height:28, fontSize:10, flexShrink:0, cursor:'pointer' }} onClick={() => c.profiles?.username && navigate(`/profile/${c.profiles.username}`)}>
                  {c.profiles?.avatar_url ? <img src={c.profiles.avatar_url} alt="" /> : initials(c.profiles?.full_name || '?')}
                </div>
                <div className="comment-bubble">
                  <div className="comment-author" onClick={() => c.profiles?.username && navigate(`/profile/${c.profiles.username}`)}>@{c.profiles?.username}</div>
                  <div className="comment-text">{c.body}</div>
                </div>
              </div>
            ))
          }
          <div className="comment-input-row" style={{ marginTop:10 }}>
            <input className="comment-input" placeholder="Add a comment…" value={commentText} onChange={e => setCommentText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitComment()} />
            <button className="comment-submit" onClick={submitComment} disabled={submitting}>
              {submitting ? <div className="spinner" style={{ width:12, height:12 }} /> : <span style={{ display:'flex', width:14, height:14 }}><Icon.Send /></span>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
