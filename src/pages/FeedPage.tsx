import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Post, Profile, getCanonicalDiscipline, PROFESSIONS } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { getFriends } from '@/lib/friends'
import PostCard from '@/components/PostCard'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

type FeedTab = 'all' | 'following' | 'friends' | 'pro'
interface Props { onPost: () => void }

// Labelled section dividers injected between post groups
interface FeedSection { type: 'divider'; label: string; id: string }
type FeedItem = Post | FeedSection

function isFeedSection(item: FeedItem): item is FeedSection {
  return (item as FeedSection).type === 'divider'
}

// Score a post for the discovery feed
// score = pro_upvote_count + verif_boost - time_decay
function discoveryScore(post: Post, now: number): number {
  const verif = (post.profiles?.verification_count ?? 0) * 0.5
  const ageHours = (now - new Date(post.created_at).getTime()) / 3_600_000
  // Gentle time decay: lose ~1 point every 48h, floor at 0
  const decay = Math.max(0, ageHours / 48)
  return post.pro_upvote_count + verif - decay
}

export default function FeedPage({ onPost }: Props) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<FeedTab>('all')
  const [feedItems, setFeedItems] = useState<FeedItem[]>([])
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

  const FIELDS = 'id,user_id,content_type,caption,poem_text,media_url,media_path,tags,like_count,comment_count,share_count,pro_upvote_count,is_pro_post,post_type,persona_discipline,visibility,group_id,created_at'

  // Fetch + enrich a batch of raw posts from any query
  async function enrichPosts(rawPosts: any[]): Promise<Post[]> {
    if (rawPosts.length === 0) return []
    const uids = [...new Set(rawPosts.map((p: any) => p.user_id))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id,username,full_name,avatar_url,profession,role_title,is_pro,verification_count')
      .in('id', uids)
    const profileMap: Record<string, Profile> = {}
    ;(profilesData || []).forEach((p: any) => { profileMap[p.id] = p })
    return rawPosts.map((p: any) => ({ ...p, profiles: profileMap[p.user_id] || null }))
  }

  // Mark liked / pro-upvoted on a list of posts
  async function markInteractions(posts: Post[]): Promise<Post[]> {
    if (!profile || posts.length === 0) return posts
    const postIds = posts.map(p => p.id)
    const [likesRes, upvotesRes] = await Promise.all([
      supabase.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
      supabase.from('pro_upvotes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
    ])
    const likedSet = new Set((likesRes.data || []).map((r: any) => r.post_id))
    const upvotedSet = new Set((upvotesRes.data || []).map((r: any) => r.post_id))
    return posts.map(p => ({ ...p, user_liked: likedSet.has(p.id), user_pro_upvoted: upvotedSet.has(p.id) }))
  }

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      // ── Social tabs: simple chronological, no algorithm ──────────────
      if (tab === 'following' || tab === 'friends') {
        const userIdFilter = tab === 'following' ? followingIds : friendIds
        if (userIdFilter.length === 0) { setFeedItems([]); setLoading(false); return }
        const { data, error } = await supabase.from('posts').select(FIELDS)
          .in('user_id', userIdFilter)
          .order('created_at', { ascending: false })
          .limit(40)
        if (error) { toast.error(error.message); setLoading(false); return }
        let posts = await enrichPosts(data || [])
        posts = await markInteractions(posts)
        setFeedItems(posts)
        setLoading(false)
        return
      }

      // ── Pro tab: original work ranked by peer upvotes ─────────────────
      if (tab === 'pro') {
        const { data, error } = await supabase.from('posts').select(FIELDS)
          .eq('post_type', 'pro')
          .order('pro_upvote_count', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(40)
        if (error) { toast.error(error.message); setLoading(false); return }
        let posts = await enrichPosts(data || [])
        const now = Date.now()
        posts = posts.sort((a, b) => discoveryScore(b, now) - discoveryScore(a, now))
        posts = await markInteractions(posts)
        setFeedItems(posts)
        setLoading(false)
        return
      }

      // ── "For You" tab: affinity-driven personalised algorithm ─────────
      //
      // 1. Load user's discipline affinity scores (highest first)
      // 2. Identify "primary" disciplines (top half of scores, or own discipline)
      // 3. Fetch most-upvoted posts from primary disciplines   → Primary bucket
      // 4. Fetch most-upvoted posts from all other disciplines → Discovery bucket
      // 5. Globally-viral posts (pro_upvote_count ≥ threshold) → Promoted bucket
      // 6. Interleave: primary (60%) → discovery (30%) → promoted (10%)
      // 7. Apply time-decay scoring so fresh content beats stale viral posts

      const myCanonical = getCanonicalDiscipline(profile?.profession)
      const allDisciplineKeys = Object.keys(PROFESSIONS)

      // Load affinity scores
      let primaryDisciplines: string[] = myCanonical ? [myCanonical] : []
      if (profile) {
        const { data: scoreRows } = await supabase
          .from('user_discipline_scores')
          .select('discipline,score')
          .eq('user_id', profile.id)
          .order('score', { ascending: false })
          .limit(20)
        if (scoreRows && scoreRows.length > 0) {
          // Include any discipline with at least half the max score, plus own discipline
          const maxScore = scoreRows[0].score
          const threshold = Math.max(1, maxScore * 0.5)
          const highAffinity = scoreRows
            .filter((r: any) => r.score >= threshold)
            .map((r: any) => getCanonicalDiscipline(r.discipline) || r.discipline)
          primaryDisciplines = [...new Set([...primaryDisciplines, ...highAffinity])]
        }
      }

      const discoveryDisciplines = allDisciplineKeys.filter(d => !primaryDisciplines.includes(d))

      // Fetch pools in parallel
      const VIRAL_THRESHOLD = 3 // posts with this many pro upvotes get promoted globally

      const [primaryRes, discoveryRes, viralRes] = await Promise.all([
        // Primary: most upvoted from affinity disciplines (or all if no affinity yet)
        primaryDisciplines.length > 0
          ? supabase.from('posts').select(FIELDS)
              .in('user_id',
                // We need user IDs whose profession is in primary disciplines —
                // fetch author IDs via profiles table
                await supabase.from('profiles')
                  .select('id')
                  .in('profession', primaryDisciplines)
                  .then(r => (r.data || []).map((p: any) => p.id))
              )
              .order('pro_upvote_count', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(20)
          : supabase.from('posts').select(FIELDS)
              .order('pro_upvote_count', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(20),

        // Discovery: most upvoted from other disciplines
        discoveryDisciplines.length > 0
          ? supabase.from('posts').select(FIELDS)
              .in('user_id',
                await supabase.from('profiles')
                  .select('id')
                  .in('profession', discoveryDisciplines)
                  .then(r => (r.data || []).map((p: any) => p.id))
              )
              .order('pro_upvote_count', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [], error: null }),

        // Viral / promoted: top upvoted across ALL disciplines
        supabase.from('posts').select(FIELDS)
          .gte('pro_upvote_count', VIRAL_THRESHOLD)
          .order('pro_upvote_count', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      // Enrich all pools
      const [primaryPosts, discoveryPosts, viralPosts] = await Promise.all([
        enrichPosts(primaryRes.data || []),
        enrichPosts(discoveryRes.data || []),
        enrichPosts(viralRes.data || []),
      ])

      const now = Date.now()
      const sort = (arr: Post[]) => [...arr].sort((a, b) => discoveryScore(b, now) - discoveryScore(a, now))

      const sortedPrimary   = sort(primaryPosts)
      const sortedDiscovery = sort(discoveryPosts)
      // Promoted: posts with high viral score not already in primary
      const primaryIds = new Set(sortedPrimary.map(p => p.id))
      const sortedViral = sort(viralPosts.filter(p => !primaryIds.has(p.id))).slice(0, 5)

      // Interleave into a single feed with section labels
      const items: FeedItem[] = []
      const seen = new Set<string>()

      function addSection(label: string, posts: Post[], maxCount: number) {
        const fresh = posts.filter(p => !seen.has(p.id)).slice(0, maxCount)
        if (fresh.length === 0) return
        items.push({ type: 'divider', label, id: 'div-' + label })
        fresh.forEach(p => { seen.add(p.id); items.push(p) })
      }

      const primaryLabel = primaryDisciplines.length > 0 ? 'From your fields' : 'Top posts'

      addSection(primaryLabel, sortedPrimary, 12)
      addSection('Trending across fields', sortedDiscovery, 8)
      if (sortedViral.length > 0) addSection('Highly upvoted — Promoted', sortedViral, 5)

      // If the feed is very sparse (new platform), fall back to a global mix
      if (items.filter(i => !isFeedSection(i)).length < 5) {
        const { data: fallback } = await supabase.from('posts').select(FIELDS)
          .order('pro_upvote_count', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(30)
        const fallbackPosts = await enrichPosts(fallback || [])
        const allPosts = sort(fallbackPosts)
        await markInteractions(allPosts).then(marked => setFeedItems(marked))
        setLoading(false)
        return
      }

      // Mark interactions on all real posts
      const allPosts = items.filter((i): i is Post => !isFeedSection(i))
      const marked = await markInteractions(allPosts)
      const markedMap: Record<string, Post> = {}
      marked.forEach(p => { markedMap[p.id] = p })
      const finalItems: FeedItem[] = items.map(i => isFeedSection(i) ? i : (markedMap[i.id] || i))

      setFeedItems(finalItems)
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

  useEffect(() => {
    const handler = () => fetchPosts()
    window.addEventListener('oc:post-created', handler)
    return () => window.removeEventListener('oc:post-created', handler)
  }, [fetchPosts])

  async function quickPost() {
    if (!profile || !composerText.trim()) return
    setPosting(true)
    const { error } = await supabase.from('posts').insert({
      user_id: profile.id, content_type: 'text', caption: composerText.trim(),
      post_type: 'general',
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

      {/* ── Landing welcome banner ── */}
      <div className="feed-hero">
        <div className="feed-hero-left">
          <div className="feed-hero-greeting">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, <strong>{profile?.full_name?.split(' ')[0] || 'Creator'}</strong>
          </div>
          <div className="feed-hero-sub">
            Explore, create, and connect across professional fields.
          </div>
        </div>
        <div className="feed-hero-actions">
          <button className="btn btn-ghost btn-sm" style={{ gap:5, fontSize:12 }} onClick={() => navigate('/explore')}>
            <span style={{ display:'flex', width:13, height:13 }}><Icon.Explore /></span>
            Explore fields
          </button>
          <button className="btn btn-primary btn-sm" style={{ gap:5 }} onClick={onPost}>
            <span style={{ display:'flex', width:13, height:13 }}><Icon.Plus /></span>
            New post
          </button>
        </div>
      </div>

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
      ) : feedItems.filter(i => !isFeedSection(i)).length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon.Feed /></div>
          <div className="empty-title">{emptyMessages[tab]}</div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={onPost}>Create a post</button>
          </div>
        </div>
      ) : feedItems.map(item =>
        isFeedSection(item) ? (
          <div key={item.id} className="feed-section-divider">{item.label}</div>
        ) : (
          <PostCard key={item.id} post={item} onUpdated={fetchPosts} />
        )
      )}
    </div>
  )
}
