import { useEffect, useState, useCallback } from 'react'
import { supabase, Post, Profile } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import PostCard from '@/components/PostCard'
import toast from 'react-hot-toast'

type FeedTab = 'all' | 'following' | 'pro'
interface Props { onPost: () => void }

export default function FeedPage({ onPost }: Props) {
  const { profile } = useAuth()
  const [tab, setTab] = useState<FeedTab>('all')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [composerText, setComposerText] = useState('')
  const [posting, setPosting] = useState(false)
  const [followingIds, setFollowingIds] = useState<string[]>([])

  useEffect(() => {
    if (!profile) return
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', profile.id)
      .then(({ data }) => setFollowingIds((data || []).map((r: any) => r.following_id)))
  }, [profile?.id])

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'following' && followingIds.length === 0) {
        setPosts([]); setLoading(false); return
      }

      // Step 1: fetch posts (no join)
      let query = supabase
        .from('posts')
        .select('id, user_id, content_type, caption, poem_text, media_url, media_path, tags, like_count, comment_count, share_count, pro_upvote_count, created_at')
        .order('created_at', { ascending: false })
        .limit(30)

      if (tab === 'following') {
        query = query.in('user_id', followingIds)
      }

      if (tab === 'pro') {
        const { data: proUsers } = await supabase
          .from('profiles')
          .select('id')
          .not('profession', 'is', null)
        const ids = (proUsers || []).map((u: any) => u.id)
        if (ids.length === 0) { setPosts([]); setLoading(false); return }
        query = query.in('user_id', ids)
      }

      const { data: postsData, error: postsError } = await query
      if (postsError) {
        console.error('posts error:', postsError)
        toast.error(postsError.message)
        setLoading(false); return
      }

      const rawPosts = postsData || []
      if (rawPosts.length === 0) { setPosts([]); setLoading(false); return }

      // Step 2: fetch profiles for those user_ids
      const userIds = [...new Set(rawPosts.map((p: any) => p.user_id))]
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, profession, is_pro')
        .in('id', userIds)

      if (profilesError) {
        console.error('profiles error:', profilesError)
        toast.error(profilesError.message)
        setLoading(false); return
      }

      const profileMap: Record<string, Profile> = {}
      ;(profilesData || []).forEach((p: any) => { profileMap[p.id] = p })

      // Step 3: attach profile to each post
      let enriched: Post[] = rawPosts.map((p: any) => ({
        ...p,
        profiles: profileMap[p.user_id] || null,
      }))

      // Step 4: mark liked / pro-upvoted
      if (profile && enriched.length > 0) {
        const postIds = enriched.map(p => p.id)
        const [likesRes, upvotesRes] = await Promise.all([
          supabase.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
          supabase.from('pro_upvotes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
        ])
        const likedSet = new Set((likesRes.data || []).map((r: any) => r.post_id))
        const upvotedSet = new Set((upvotesRes.data || []).map((r: any) => r.post_id))
        enriched = enriched.map(p => ({
          ...p,
          user_liked: likedSet.has(p.id),
          user_pro_upvoted: upvotedSet.has(p.id),
        }))
      }

      setPosts(enriched)
    } catch (err: any) {
      console.error('fetchPosts unexpected error:', err)
      toast.error('Failed to load posts')
    } finally {
      setLoading(false)
    }
  }, [tab, profile?.id, followingIds.join(',')])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  useEffect(() => {
    const channel = supabase
      .channel('posts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => fetchPosts())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchPosts])

  async function quickPost() {
    if (!profile || !composerText.trim()) return
    setPosting(true)
    const { error } = await supabase.from('posts').insert({
      user_id: profile.id,
      content_type: 'text',
      caption: composerText.trim(),
    })
    if (!error) { setComposerText(''); toast.success('Posted! ✦'); fetchPosts() }
    else toast.error(error.message)
    setPosting(false)
  }

  function initials(name: string) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  return (
    <div className="feed-wrap">
      <div className="feed-tabs">
        {(['all','following','pro'] as FeedTab[]).map(t => (
          <div key={t} className={`feed-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'all' ? 'For you' : t === 'following' ? 'Following' : 'Pro Picks ◆'}
          </div>
        ))}
      </div>

      <div className="composer">
        <div className="composer-top">
          <div className="post-avatar" style={{ width: 36, height: 36, fontSize: 12, flexShrink: 0 }}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : initials(profile?.full_name || '')}
          </div>
          <textarea
            className="composer-ta"
            placeholder="Share something with the world…"
            value={composerText}
            onChange={e => setComposerText(e.target.value)}
          />
        </div>
        <div className="composer-foot">
          <div className="composer-tool" onClick={onPost}>🖼</div>
          <div className="composer-tool" onClick={onPost}>🎵</div>
          <div className="composer-tool" onClick={onPost}>🎬</div>
          <div className="composer-tool" onClick={onPost}>✍️</div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>{composerText.length}/500</span>
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 10 }} onClick={quickPost} disabled={posting || !composerText.trim()}>
            {posting ? <span className="spinner" /> : 'Post'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : posts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✦</div>
          <div className="empty-title">{tab === 'following' ? 'Follow some creators to see their posts' : 'Be the first to post'}</div>
          <div style={{ marginTop: 12 }}><button className="btn btn-primary btn-sm" onClick={onPost}>Create a post</button></div>
        </div>
      ) : posts.map(post => <PostCard key={post.id} post={post} onUpdated={fetchPosts} />)}
    </div>
  )
}
