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

// ── PRD-aligned feed scoring ──────────────────────────────────────────────────
//
// Post Score = Base Engagement Score × Pro Multiplier
//   Base = (likes × 1) + (comments × 4) + (share_count × 2) + 10 (floor)
//   Pro Multiplier = 1 + (pro_upvote_count × 2.5)  [proxy for trust-weighted sum]
//   Craft match bonus: +12 if post is in one of the user's fields (high weight)
//   Relationship bonus: +8 friend, +5 following
//   Recency boost: posts < 6h old get +20, < 24h +8
//   Time decay: accelerates after 48h (lose 1pt/6h beyond 48h)
//
function computePostScore(
  post: Post,
  now: number,
  myDisciplines: Set<string>,
  followingSet: Set<string>,
  friendSet: Set<string>
): number {
  // Base engagement (low weight on likes per PRD)
  const base = 10 + (post.like_count * 1) + (post.comment_count * 4) + ((post.share_count ?? 0) * 2)
  // Pro Multiplier — each pro vote proxied as trust ≈ 2.5 (between Participant=1 and Contributor=3)
  const proMultiplier = 1 + (post.pro_upvote_count * 2.5)
  // Craft match — user's joined fields (very high weight per PRD)
  const craftBonus = (post.persona_discipline && myDisciplines.has(post.persona_discipline)) ? 12 : 0
  // Relationship strength
  const isFriend   = friendSet.has(post.user_id)
  const isFollowing = followingSet.has(post.user_id)
  const relationshipBonus = isFriend ? 8 : isFollowing ? 5 : 0
  // Recency boost (fresh content surfaces faster)
  const ageHours = (now - new Date(post.created_at).getTime()) / 3_600_000
  const recencyBoost = ageHours < 6 ? 20 : ageHours < 24 ? 8 : 0
  // Time decay past 48h (gentle — doesn't kill good old content)
  const decay = ageHours > 48 ? (ageHours - 48) / 6 : 0

  return (base * proMultiplier) + craftBonus + relationshipBonus + recencyBoost - decay
}

// Whether a post qualifies for the Newcomer Protection Pool
// (creators with zero prior pro endorsements on any post)
function isNewcomerPost(post: Post): boolean {
  return post.pro_upvote_count === 0
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
  // User's joined fields for craft-match bonus
  const [myFieldSet, setMyFieldSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', profile.id),
      getFriends(profile.id),
      supabase.from('discipline_personas').select('discipline').eq('user_id', profile.id),
    ]).then(([followRes, fIds, personaRes]) => {
      setFollowingIds((followRes.data || []).map((r: any) => r.following_id))
      setFriendIds(fIds)
      setMyFieldSet(new Set((personaRes.data || []).map((r: any) => r.discipline as string)))
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
    const followingSet = new Set(followingIds)
    const friendSet    = new Set(friendIds)
    const now = Date.now()
    // PRD-aligned sort using full scoring function
    const scoreSort = (arr: Post[]) =>
      [...arr].sort((a, b) => computePostScore(b, now, myFieldSet, followingSet, friendSet) - computePostScore(a, now, myFieldSet, followingSet, friendSet))

    try {
      // ── Social tabs: chronological with relationship bonus ────────────
      if (tab === 'following' || tab === 'friends') {
        const userIdFilter = tab === 'following' ? followingIds : friendIds
        if (userIdFilter.length === 0) { setFeedItems([]); setLoading(false); return }
        const { data, error } = await supabase.from('posts').select(FIELDS)
          .in('user_id', userIdFilter)
          .order('created_at', { ascending: false })
          .limit(50)
        if (error) { toast.error(error.message); setLoading(false); return }
        let posts = await enrichPosts(data || [])
        posts = scoreSort(posts)
        posts = await markInteractions(posts)
        setFeedItems(posts)
        setLoading(false)
        return
      }

      // ── Pro Picks tab: Pro posts ranked by Pro Multiplier ────────────
      // Post Score = Base Engagement × Pro Multiplier
      // Craft match bonus applied; newcomer pool (20%) interleaved
      if (tab === 'pro') {
        const { data, error } = await supabase.from('posts').select(FIELDS)
          .eq('post_type', 'pro')
          .order('created_at', { ascending: false })
          .limit(60)
        if (error) { toast.error(error.message); setLoading(false); return }
        let posts = await enrichPosts(data || [])
        const established = scoreSort(posts.filter(p => !isNewcomerPost(p)))
        const newcomerPool = scoreSort(posts.filter(isNewcomerPost))
        // 20% Newcomer Protection Pool interleaved every 5th slot
        const TOTAL = 40
        const newcomerSlots = Math.ceil(TOTAL * 0.2)
        const combined: Post[] = []
        let ei = 0, ni = 0
        for (let i = 0; i < TOTAL; i++) {
          const isNewcomerSlot = (i + 1) % 5 === 0 && ni < newcomerPool.length
          if (isNewcomerSlot) combined.push(newcomerPool[ni++])
          else if (ei < established.length) combined.push(established[ei++])
          else if (ni < newcomerPool.length) combined.push(newcomerPool[ni++])
        }
        const marked = await markInteractions(combined)
        setFeedItems(marked)
        setLoading(false)
        return
      }

      // ── "For You" tab: PRD multi-bucket algorithm ─────────────────────
      //
      // Buckets:
      //   A. Craft Posts — from fields the user has joined (craft match, high weight)
      //   B. Following / Friends — from social graph, recent
      //   C. Trending — high Pro Multiplier posts from any field
      //   D. Discover — from fields user hasn't joined yet
      //   E. Newcomer Pool — 20% of feed, creators with 0 pro upvotes
      //
      // Final interleave: A(40%) → B(20%) → C(20%) → D(10%) → E(10%)

      const myFields = [...myFieldSet]
      const allDisciplineKeys = Object.keys(PROFESSIONS)
      const otherFields = allDisciplineKeys.filter(d => !myFieldSet.has(d))
      const hasJoinedFields = myFields.length > 0
      const hasSocialGraph = followingIds.length > 0 || friendIds.length > 0
      const socialIds = [...new Set([...followingIds, ...friendIds])]

      const [craftRes, socialRes, trendingRes, discoverRes, newcomerRes] = await Promise.all([
        // A. Craft: posts from user's joined fields
        hasJoinedFields
          ? supabase.from('posts').select(FIELDS)
              .in('persona_discipline', myFields)
              .order('pro_upvote_count', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(25)
          : Promise.resolve({ data: [] }),

        // B. Social: posts from following + friends
        hasSocialGraph
          ? supabase.from('posts').select(FIELDS)
              .in('user_id', socialIds)
              .order('created_at', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),

        // C. Trending: high pro-vote posts globally (Pro Multiplier effect)
        supabase.from('posts').select(FIELDS)
          .gte('pro_upvote_count', 2)
          .order('pro_upvote_count', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(20),

        // D. Discover: posts from other fields (cross-field discovery)
        otherFields.length > 0
          ? supabase.from('posts').select(FIELDS)
              .in('persona_discipline', otherFields.slice(0, 8))
              .order('pro_upvote_count', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [] }),

        // E. Newcomer Pool: recent posts from creators with 0 pro upvotes
        supabase.from('posts').select(FIELDS)
          .eq('pro_upvote_count', 0)
          .order('created_at', { ascending: false })
          .limit(15),
      ])

      const [craftPosts, socialPosts, trendingPosts, discoverPosts, newcomerPoolPosts] = await Promise.all([
        enrichPosts((craftRes.data || []) as any[]),
        enrichPosts((socialRes.data || []) as any[]),
        enrichPosts((trendingRes.data || []) as any[]),
        enrichPosts((discoverRes.data || []) as any[]),
        enrichPosts((newcomerRes.data || []) as any[]),
      ])

      const seen = new Set<string>()
      const items: FeedItem[] = []

      function addSection(label: string, posts: Post[], maxCount: number, sorted = true) {
        const source = sorted ? scoreSort(posts) : posts
        const fresh = source.filter(p => !seen.has(p.id)).slice(0, maxCount)
        if (fresh.length === 0) return
        items.push({ type: 'divider', label, id: 'div-' + label })
        fresh.forEach(p => { seen.add(p.id); items.push(p) })
      }

      // If user has fields, show craft-match content first
      if (hasJoinedFields && craftPosts.length > 0) {
        addSection('From your fields', craftPosts, 10)
      }
      if (hasSocialGraph && socialPosts.length > 0) {
        addSection('From people you follow', socialPosts, 8, false) // chronological
      }
      addSection('Trending', trendingPosts, 8)
      if (discoverPosts.length > 0) addSection('Discover new fields', discoverPosts, 6)

      // Newcomer Protection Pool — 20% — every 5th post slot
      const newcomerFresh = scoreSort(newcomerPoolPosts.filter(p => !seen.has(p.id))).slice(0, 8)
      if (newcomerFresh.length > 0) {
        items.push({ type: 'divider', label: 'Rising talent', id: 'div-newcomer' })
        newcomerFresh.forEach(p => { seen.add(p.id); items.push(p) })
      }

      // Sparse feed fallback
      if (items.filter(i => !isFeedSection(i)).length < 5) {
        const { data: fallback } = await supabase.from('posts').select(FIELDS)
          .order('created_at', { ascending: false })
          .limit(30)
        const fallbackPosts = await enrichPosts(fallback || [])
        const sorted = scoreSort(fallbackPosts)
        const marked = await markInteractions(sorted)
        setFeedItems(marked)
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
  }, [tab, profile?.id, followingIds.join(','), friendIds.join(','), [...myFieldSet].sort().join(',')])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  useEffect(() => {
    const channel = supabase.channel('posts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => fetchPosts())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchPosts])

  useEffect(() => {
    const handler = async () => {
      if (!profile) { fetchPosts(); return }
      // Fetch the newest post by current user and pin it to the top
      const { data } = await supabase.from('posts').select(FIELDS)
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
      if (!data || data.length === 0) { fetchPosts(); return }
      const uids = [profile.id]
      const { data: profilesData } = await supabase.from('profiles')
        .select('id,username,full_name,avatar_url,profession,role_title,is_pro,verification_count')
        .in('id', uids)
      const profileMap: Record<string, Profile> = {}
      ;(profilesData || []).forEach((p: any) => { profileMap[p.id] = p })
      const newPost: Post = { ...data[0], profiles: profileMap[data[0].user_id] || null }
      setFeedItems(prev => {
        const withoutNew = prev.filter(i => isFeedSection(i) || (i as Post).id !== newPost.id)
        return [newPost, ...withoutNew]
      })
    }
    window.addEventListener('oc:post-created', handler)
    return () => window.removeEventListener('oc:post-created', handler)
  }, [fetchPosts, profile?.id])

  async function quickPost() {
    if (!profile || !composerText.trim()) return
    setPosting(true)
    const { error } = await supabase.from('posts').insert({
      user_id: profile.id, content_type: 'text', caption: composerText.trim(),
      post_type: 'general',
    })
    if (!error) { setComposerText(''); toast.success('Posted! ✦'); window.dispatchEvent(new CustomEvent('oc:post-created')) }
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
