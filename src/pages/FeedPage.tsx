import { useEffect, useState, useCallback } from 'react'
import { supabase, Post, Profile } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { getFriends } from '@/lib/friends'
import PostCard from '@/components/PostCard'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

type FeedTab = 'all' | 'following' | 'friends' | 'pro'
interface Props { onPost: () => void }

export default function FeedPage({ onPost }: Props) {
  const { profile } = useAuth()
  const [tab, setTab] = useState<FeedTab>('all')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [composerText, setComposerText] = useState('')
  const [posting, setPosting] = useState(false)
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [friendIds, setFriendIds] = useState<string[]>([])

  useEffect(() => {
    if (!profile) return
    // Load both social graphs
    Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', profile.id),
      getFriends(profile.id),
    ]).then(([followRes, fIds]) => {
      setFollowingIds((followRes.data || []).map((r: any) => r.following_id))
      setFriendIds(fIds)
    })
  }, [profile?.id])

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      // Determine user ID filter based on tab
      let userIdFilter: string[] | null = null

      if (tab === 'following') {
        if (followingIds.length === 0) { setPosts([]); setLoading(false); return }
        userIdFilter = followingIds
      }
      if (tab === 'friends') {
        if (friendIds.length === 0) { setPosts([]); setLoading(false); return }
        userIdFilter = friendIds
      }
      // Fetch posts — ranked by pro_upvote_count on discovery tabs,
      // chronological on social tabs (following / friends)
      const FIELDS = 'id,user_id,content_type,caption,poem_text,media_url,media_path,tags,like_count,comment_count,share_count,pro_upvote_count,is_pro_post,visibility,group_id,group:group_id(id,name,slug),created_at'

      let query = supabase.from('posts').select(FIELDS).limit(30)

      if (tab === 'pro') {
        // Pro tab: original work only, ranked by pro upvotes
        query = query.eq('is_pro_post', true)
          .order('pro_upvote_count', { ascending: false })
          .order('created_at', { ascending: false })
      } else if (tab === 'following' || tab === 'friends') {
        // Personal feed: chronological, filtered to social graph
        query = query.in('user_id', userIdFilter!)
          .order('created_at', { ascending: false })
      } else {
        // "For You" / all: ranked by pro upvotes — virality driven by peer quality signal
        query = query
          .order('pro_upvote_count', { ascending: false })
          .order('created_at', { ascending: false })
      }

      const { data: postsData, error } = await query
      if (error) { toast.error(error.message); setLoading(false); return }
      const rawPosts = postsData || []
      if (rawPosts.length === 0) { setPosts([]); setLoading(false); return }

      // Fetch profiles separately
      const uids = [...new Set(rawPosts.map((p: any) => p.user_id))]
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id,username,full_name,avatar_url,profession,is_pro')
        .in('id', uids)

      const profileMap: Record<string, Profile> = {}
      ;(profilesData || []).forEach((p: any) => { profileMap[p.id] = p })

      let enriched: Post[] = rawPosts.map((p: any) => ({
        ...p, profiles: profileMap[p.user_id] || null,
      }))

      // Mark liked / pro-upvoted
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
      toast.error('Failed to load posts')
    } finally {
      setLoading(false)
    }
  }, [tab, profile?.id, followingIds.join(','), friendIds.join(',')])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  useEffect(() => {
    const channel = supabase.channel('posts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => fetchPosts())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchPosts])

  async function quickPost() {
    if (!profile || !composerText.trim()) return
    setPosting(true)
    const { error } = await supabase.from('posts').insert({
      user_id: profile.id, content_type: 'text', caption: composerText.trim(),
    })
    if (!error) { setComposerText(''); toast.success('Posted! ✦'); fetchPosts() }
    else toast.error(error.message)
    setPosting(false)
  }

  function initials(name: string) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  const tabs: { key: FeedTab; label: string }[] = [
    { key: 'all',       label: 'For you' },
    { key: 'following', label: 'Following' },
    { key: 'friends',   label: '✦ Friends' },
    { key: 'pro',       label: 'Pro Picks ◆' },
  ]

  const emptyMessages: Record<FeedTab, string> = {
    all: 'Be the first to post',
    following: 'Follow some creators to see their posts here',
    friends: 'Add friends to see their posts here',
    pro: 'No pro posts yet',
  }

  return (
    <div className="feed-wrap">
      <div className="feed-tabs">
        {tabs.map(t => (
          <div key={t.key} className={`feed-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
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
          <textarea className="composer-ta" placeholder="Share something with the world…"
            value={composerText} onChange={e => setComposerText(e.target.value)} />
        </div>
        <div className="composer-foot">
          <div className="composer-tool" onClick={onPost} title="Photo"><Icon.Camera /></div>
          <div className="composer-tool" onClick={onPost} title="Audio"><Icon.Music /></div>
          <div className="composer-tool" onClick={onPost} title="Video"><Icon.Video /></div>
          <div className="composer-tool" onClick={onPost} title="Poem"><Icon.PenLine /></div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-3)' }}>{composerText.length}/500</span>
          <button className="btn btn-primary btn-sm" style={{ marginLeft: 10 }}
            onClick={quickPost} disabled={posting || !composerText.trim()}>
            {posting ? <span className="spinner" /> : 'Post'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : posts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon.Feed /></div>
          <div className="empty-title">{emptyMessages[tab]}</div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={onPost}>Create a post</button>
          </div>
        </div>
      ) : posts.map(post => <PostCard key={post.id} post={post} onUpdated={fetchPosts} />)}
    </div>
  )
}
