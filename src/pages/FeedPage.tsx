import { useEffect, useState, useCallback } from 'react'
import { supabase, Post, Profile, PROFESSIONS } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { getFriends } from '@/lib/friends'
import PostCard from '@/components/PostCard'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

type FeedTab = 'all' | 'following'
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
      // ── Following tab: chronological ─────────────────────────────────
      if (tab === 'following') {
        if (followingIds.length === 0) { setFeedItems([]); setLoading(false); return }
        const { data, error } = await supabase.from('posts').select(FIELDS)
          .in('user_id', followingIds)
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

      const [craftRes, socialRes, proRes, discoverRes] = await Promise.all([
        // A. Craft: posts from user's joined fields (Pro posts with craft match)
        hasJoinedFields
          ? supabase.from('posts').select(FIELDS)
              .in('persona_discipline', myFields)
              .order('pro_upvote_count', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(25)
          : Promise.resolve({ data: [] }),

        // B. Social: posts from following + friends, chronological
        hasSocialGraph
          ? supabase.from('posts').select(FIELDS)
              .in('user_id', socialIds)
              .order('created_at', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),

        // C. All posts scored by Pro Multiplier — no threshold so it works on new platforms
        supabase.from('posts').select(FIELDS)
          .order('pro_upvote_count', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(40),

        // D. Discover: Pro posts from fields user hasn't joined yet
        otherFields.length > 0
          ? supabase.from('posts').select(FIELDS)
              .in('persona_discipline', otherFields.slice(0, 10))
              .order('pro_upvote_count', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(15)
          : Promise.resolve({ data: [] }),
      ])

      const [craftPosts, socialPosts, proPosts, discoverPosts] = await Promise.all([
        enrichPosts((craftRes.data || []) as any[]),
        enrichPosts((socialRes.data || []) as any[]),
        enrichPosts((proRes.data || []) as any[]),
        enrichPosts((discoverRes.data || []) as any[]),
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

      if (hasJoinedFields && craftPosts.length > 0) {
        addSection('From your fields', craftPosts, 10)
      }
      if (hasSocialGraph && socialPosts.length > 0) {
        addSection('From people you follow', socialPosts, 8, false)
      }

      // Top posts / trending — always has data (no threshold)
      const established = proPosts.filter(p => !isNewcomerPost(p))
      const newcomerPool = proPosts.filter(isNewcomerPost)
      const trendingLabel = hasJoinedFields ? 'Trending' : 'Top posts'
      addSection(trendingLabel, established, 12)

      if (discoverPosts.length > 0) addSection('Discover new fields', discoverPosts, 6)

      // Newcomer Protection Pool (20%) — always shown, labeled "Rising talent"
      const newcomerFresh = scoreSort(newcomerPool.filter(p => !seen.has(p.id))).slice(0, 6)
      if (newcomerFresh.length > 0) {
        items.push({ type: 'divider', label: 'Rising talent', id: 'div-newcomer' })
        newcomerFresh.forEach(p => { seen.add(p.id); items.push(p) })
      }

      // Mark interactions on all real posts
      const allPosts = items.filter((i): i is Post => !isFeedSection(i))
      const marked = await markInteractions(allPosts)
      const markedMap: Record<string, Post> = {}
      marked.forEach(p => { markedMap[p.id] = p })
      const finalItems: FeedItem[] = items.map(i => isFeedSection(i) ? i : (markedMap[i.id] || i))

      // If genuinely empty (brand new platform, zero posts), show empty state
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
  ]

  const emptyMessages: Record<FeedTab, string> = {
    all: 'Be the first to post',
    following: 'Follow some creators to see their posts here',
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'

  return (
    <div className="max-w-[700px] mx-auto px-4 md:px-8 py-4 md:py-6">

      {/* ── Greeting ── */}
      <div className="mb-6">
        <h1 className="text-[28px] font-bold tracking-tight text-gray-900 dark:text-white">
          Good {greeting}, {profile?.full_name?.split(' ')[0] || 'Creator'}
        </h1>
        <p className="text-[15px] text-gray-500 dark:text-gray-400 mt-1">
          Discover what's happening in your creative fields today.
        </p>
      </div>

      {/* ── Feed tabs ── */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-full p-1 mb-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-full text-[14px] font-semibold transition-all duration-200 ${
              tab === t.key
                ? 'bg-white dark:bg-gray-900 text-brand-600 dark:text-brand-400 shadow-sm'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Composer ── */}
      <div className="apple-card px-6 py-5 mb-6">
        <div className="flex gap-4">
          <div className="w-12 h-12 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[13px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              : initials(profile?.full_name || '')}
          </div>
          <textarea
            className="flex-1 bg-transparent border-none outline-none text-[17px] text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 resize-none min-h-[52px] leading-relaxed pt-1"
            placeholder="Share your latest project or thought..."
            value={composerText}
            onChange={e => setComposerText(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-50 dark:border-gray-800">
          <div className="flex items-center gap-5 text-[14px] text-gray-400">
            {[
              { icon: <Icon.Camera />,  label: 'Image' },
              { icon: <Icon.Video />,   label: 'Video' },
              { icon: <Icon.PenLine />, label: 'Text' },
            ].map(({ icon, label }) => (
              <button
                key={label}
                onClick={onPost}
                className="flex items-center gap-2 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <span className="flex w-[18px] h-[18px]">{icon}</span>
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={quickPost}
            disabled={posting || !composerText.trim()}
            className="px-7 py-2 bg-brand-600 hover:bg-brand-700 text-white text-[14px] font-semibold rounded-full transition-colors disabled:opacity-40"
          >
            {posting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Post'}
          </button>
        </div>
      </div>

      {/* ── Feed items ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : feedItems.filter(i => !isFeedSection(i)).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="flex w-10 h-10 mb-3 text-gray-300 dark:text-gray-600"><Icon.Feed /></span>
          <p className="font-semibold text-gray-600 dark:text-gray-400">{emptyMessages[tab]}</p>
          <button onClick={onPost} className="mt-4 px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-full hover:bg-brand-700 transition-colors">
            Create a post
          </button>
        </div>
      ) : feedItems.map(item =>
        isFeedSection(item) ? (
          <div key={item.id} className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 my-5">
            <div className="w-5 h-px bg-gray-200 dark:bg-gray-700" />
            {item.label}
            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          </div>
        ) : (
          <PostCard key={item.id} post={item} onUpdated={fetchPosts} />
        )
      )}
    </div>
  )
}
