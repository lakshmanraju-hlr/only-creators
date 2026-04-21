import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Post, Profile, PROFESSIONS, getProfMeta, PersonaLevel } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { getFriends } from '@/lib/friends'
import PostCard from '@/components/PostCard'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'
import { DUMMY_FEED_ITEMS } from '@/lib/dummyFeed'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type FeedTab = 'all' | 'following'

interface RisingCreatorItem {
  type: 'rising_creator'
  creator: Profile
  discipline: string
  reason: 'first_authority_vote' | 'trust_increase'
}

interface ProVoteActivityItem {
  type: 'pro_vote_activity'
  voter: Profile
  creator: Profile
  post: Post
  discipline: string
  voterLevel: PersonaLevel
}

interface DiscoverItem {
  type: 'discover'
  discoverType: 'field' | 'creator'
  field?: string
  creator?: Profile
}

type FeedItem =
  | { type: 'pro_post';     post: Post }
  | { type: 'general_post'; post: Post }
  | RisingCreatorItem
  | ProVoteActivityItem
  | DiscoverItem

type FeedMaturityLevel = 'new' | 'developing' | 'active'

interface HeaderChip {
  id: string
  label: string
  route: string
}

interface Props { onPost: () => void }

// ─────────────────────────────────────────────────────────────
// Feed Maturity
// ─────────────────────────────────────────────────────────────

function getFeedMaturity(profile: Profile | null, fieldCount: number): FeedMaturityLevel {
  if (!profile) return 'new'
  const days = (Date.now() - new Date(profile.created_at).getTime()) / 86_400_000
  if (days <= 7)  return 'new'
  if (days <= 30) return 'developing'
  return 'active'
}

function isNewUser(fieldCount: number, friendCount: number): boolean {
  return fieldCount < 5 && friendCount < 10
}

// ─────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────

function scoreProPost(post: Post, now: number): number {
  const ageDays = (now - new Date(post.created_at).getTime()) / 86_400_000
  const proVotePoints  = post.pro_upvote_count * 7.5
  const likePoints     = post.like_count * 1
  const commentPoints  = post.comment_count * 2
  const proMultiplier  = proVotePoints + likePoints + commentPoints
  const engagementScore = proMultiplier > 0 ? proVotePoints / proMultiplier : 0.1
  const recencyDecay = Math.exp(-0.1 * ageDays)
  const newcomerBoost = (post.pro_upvote_count < 10 && ageDays < 1) ? 1.5 : 1.0
  return (proMultiplier * engagementScore) * recencyDecay * newcomerBoost
}

function scoreGeneralPost(post: Post, now: number, friendSet: Set<string>, followingSet: Set<string>): number {
  const ageHours = (now - new Date(post.created_at).getTime()) / 3_600_000
  if (ageHours >= 24) return -1
  const λ = Math.log(2) / 4
  const recencyScore = 100 * Math.exp(-λ * ageHours)
  const friendBoost = friendSet.has(post.user_id) ? 20 : followingSet.has(post.user_id) ? 8 : 0
  const totalEngagement = post.like_count + post.comment_count + (post.share_count ?? 0)
  const velocityBoost = Math.min(25, Math.floor(totalEngagement / 10) * 5)
  return recencyScore + friendBoost + velocityBoost
}

// ─────────────────────────────────────────────────────────────
// 10-Post Rhythm Assembly
// ─────────────────────────────────────────────────────────────

function buildRhythmicFeed(params: {
  proPosts: Post[]
  generalPosts: Post[]
  risingCreators: RisingCreatorItem[]
  proVoteActivities: ProVoteActivityItem[]
  discoverItems: DiscoverItem[]
  topWeeklyProPost: Post | null
  coldStart: boolean
  cycles?: number
}): FeedItem[] {
  const {
    proPosts, generalPosts, risingCreators,
    proVoteActivities, discoverItems,
    topWeeklyProPost, coldStart, cycles = 3,
  } = params

  const items: FeedItem[] = []
  const seenIds = new Set<string>()
  let pi = 0, gi = 0, ri = 0, vi = 0, di = 0

  const nextPro = (): Post | null => {
    while (pi < proPosts.length) {
      const p = proPosts[pi++]
      if (!seenIds.has(p.id)) { seenIds.add(p.id); return p }
    }
    return null
  }

  const nextGeneral = (): Post | null => {
    while (gi < generalPosts.length) {
      const p = generalPosts[gi++]
      if (!seenIds.has(p.id)) { seenIds.add(p.id); return p }
    }
    return null
  }

  const pushPost = (post: Post) =>
    items.push({ type: post.post_type === 'pro' ? 'pro_post' : 'general_post', post })

  const fallback = (preferGeneral = false) => {
    const p = preferGeneral ? (nextGeneral() ?? nextPro()) : (nextPro() ?? nextGeneral())
    if (p) pushPost(p)
  }

  for (let c = 0; c < cycles; c++) {
    if (coldStart) {
      const gen1 = nextGeneral() ?? nextPro(); if (gen1) pushPost(gen1)
      const gen2 = nextGeneral() ?? nextPro(); if (gen2) pushPost(gen2)
      const gen3 = nextGeneral() ?? nextPro(); if (gen3) pushPost(gen3)
      const dc1 = discoverItems[di++]; dc1 ? items.push(dc1) : fallback(true)
      const gen5 = nextGeneral() ?? nextPro(); if (gen5) pushPost(gen5)
      const dc2 = discoverItems[di++]; dc2 ? items.push(dc2) : fallback(true)
      const rc1 = risingCreators[ri++]; rc1 ? items.push(rc1) : fallback()
      const gen8 = nextGeneral() ?? nextPro(); if (gen8) pushPost(gen8)
      const dc3 = discoverItems[di++]; dc3 ? items.push(dc3) : fallback(true)
      const rc2 = risingCreators[ri++]; rc2 ? items.push(rc2) : fallback()
    } else {
      const p1 = nextPro(); if (p1) items.push({ type: 'pro_post', post: p1 })
      const p2 = nextPro(); if (p2) items.push({ type: 'pro_post', post: p2 })
      const g3 = nextGeneral(); if (g3) items.push({ type: 'general_post', post: g3 })
      const rc = risingCreators[ri++]; rc ? items.push(rc) : fallback()
      const p5 = nextPro(); if (p5) items.push({ type: 'pro_post', post: p5 })
      const p6 = nextPro(); if (p6) items.push({ type: 'pro_post', post: p6 })
      const pva = proVoteActivities[vi++]; pva ? items.push(pva) : fallback()
      const g8 = nextGeneral(); if (g8) items.push({ type: 'general_post', post: g8 })
      const dc = discoverItems[di++]; dc ? items.push(dc) : fallback()
      if (topWeeklyProPost && !seenIds.has(topWeeklyProPost.id)) {
        seenIds.add(topWeeklyProPost.id)
        items.push({ type: 'pro_post', post: topWeeklyProPost })
      } else {
        fallback()
      }
    }
  }

  return items
}

// ─────────────────────────────────────────────────────────────
// Shared Avatar
// ─────────────────────────────────────────────────────────────

function FeedAvatar({ profile, size = 32 }: { profile: Profile; size?: number }) {
  const initials = profile.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div
      className="rounded-full overflow-hidden bg-surface-elevated ring-1 ring-border flex items-center justify-center font-semibold text-text-secondary shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.32 }}
    >
      {profile.avatar_url
        ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        : initials}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Rising Creator Card
// ─────────────────────────────────────────────────────────────

function RisingCreatorCard({
  item,
  onFollow,
  followingIds,
}: {
  item: RisingCreatorItem
  onFollow: (userId: string) => void
  followingIds: Set<string>
}) {
  const navigate = useNavigate()
  const fieldMeta = getProfMeta(item.discipline)
  const reasonLabel = item.reason === 'first_authority_vote'
    ? 'Just received their first Authority Pro Vote'
    : 'Significant trust score increase this week'

  return (
    <div className="bg-surface border-b border-border md:border md:rounded-card md:shadow-card md:mb-6 overflow-hidden">
      {/* Gold left-border indicator */}
      <div className="relative">
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px]"
          style={{ background: 'linear-gradient(180deg, #F59E0B 0%, #D97706 100%)' }}
        />
        <div className="pl-4 pr-4 py-3">
          {/* Label */}
          <div className="flex items-center gap-1.5 mb-3 pl-1">
            <span className="flex w-3.5 h-3.5 shrink-0" style={{ color: '#F59E0B' }}><Icon.Star /></span>
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#D97706' }}>
              Rising Creator
            </span>
            {fieldMeta && (
              <span className="ml-auto text-[11px] font-semibold text-text-secondary">
                {fieldMeta.icon} {fieldMeta.label}
              </span>
            )}
          </div>
          {/* Creator row */}
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/profile/${item.creator.username}`)} className="shrink-0">
              <FeedAvatar profile={item.creator} size={44} />
            </button>
            <div className="flex-1 min-w-0">
              <button
                onClick={() => navigate(`/profile/${item.creator.username}`)}
                className="font-bold text-[14px] text-text-primary hover:underline block truncate"
              >
                {item.creator.full_name}
              </button>
              <p className="text-[12px] text-text-secondary mt-0.5 truncate">{reasonLabel}</p>
            </div>
            <button
              onClick={() => onFollow(item.creator.id)}
              className={`shrink-0 px-3 py-1.5 rounded-badge text-[12px] font-bold transition-colors ${
                followingIds.has(item.creator.id)
                  ? 'bg-surface-elevated text-text-secondary border border-border'
                  : 'bg-accent hover:bg-accent-hover text-white'
              }`}
            >
              {followingIds.has(item.creator.id) ? 'Following' : 'Follow'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Pro Vote Activity Card
// ─────────────────────────────────────────────────────────────

function ProVoteActivityCard({ item }: { item: ProVoteActivityItem }) {
  const navigate = useNavigate()
  const fieldMeta = getProfMeta(item.discipline)
  const fieldLabel = fieldMeta ? `${fieldMeta.icon} ${fieldMeta.label}` : item.discipline

  return (
    <div className="bg-surface border-b border-border md:border md:rounded-card md:shadow-card md:mb-6 overflow-hidden">
      <div className="px-4 py-3">
        {/* Label */}
        <div className="flex items-center gap-1.5 mb-3">
          <span className="flex w-3.5 h-3.5 shrink-0 text-text-secondary"><Icon.Award /></span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Pro Vote Activity</span>
        </div>
        {/* Content */}
        <div className="flex items-start gap-3">
          <button onClick={() => navigate(`/profile/${item.voter.username}`)} className="shrink-0 mt-0.5">
            <FeedAvatar profile={item.voter} size={36} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] text-text-primary leading-snug">
              <button
                onClick={() => navigate(`/profile/${item.voter.username}`)}
                className="font-bold hover:underline"
              >
                {item.voter.full_name}
              </button>
              <span className="text-text-secondary"> Pro Voted </span>
              <button
                onClick={() => navigate(`/profile/${item.creator.username}`)}
                className="font-bold hover:underline"
              >
                {item.creator.full_name}
              </button>
              <span className="text-text-secondary">'s work in </span>
              <span className="font-semibold text-text-primary">{fieldLabel}</span>
            </p>
            {item.post.caption && (
              <button
                onClick={() => navigate(`/profile/${item.creator.username}`)}
                className="mt-2 block w-full text-left px-3 py-2 rounded-[8px] bg-surface-elevated border border-border text-[13px] text-text-secondary line-clamp-2 hover:bg-border transition-colors"
              >
                {item.post.caption}
                <span className="ml-2 font-semibold text-text-primary">View →</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Discover Card
// ─────────────────────────────────────────────────────────────

function DiscoverCard({
  item,
  onFollow,
  followingIds,
}: {
  item: DiscoverItem
  onFollow: (userId: string) => void
  followingIds: Set<string>
}) {
  const navigate = useNavigate()

  if (item.discoverType === 'field' && item.field) {
    const meta = getProfMeta(item.field)
    return (
      <div className="bg-surface border-b border-border md:border md:rounded-card md:shadow-card md:mb-6 overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="flex w-3.5 h-3.5 shrink-0 text-text-secondary"><Icon.Explore /></span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Discover a Field</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-[10px] bg-surface-elevated border border-border flex items-center justify-center text-2xl shrink-0">
              {meta?.icon ?? '✦'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[14px] text-text-primary">{meta?.label ?? item.field}</p>
              <p className="text-[12px] text-text-secondary">Explore work from creators in this field</p>
            </div>
            <button
              onClick={() => navigate('/explore')}
              className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-badge bg-accent hover:bg-accent-hover text-white text-[12px] font-bold transition-colors"
            >
              Explore
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (item.discoverType === 'creator' && item.creator) {
    return (
      <div className="bg-surface border-b border-border md:border md:rounded-card md:shadow-card md:mb-6 overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="flex w-3.5 h-3.5 shrink-0 text-text-secondary"><Icon.Explore /></span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-text-secondary">Suggested Creator</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/profile/${item.creator!.username}`)} className="shrink-0">
              <FeedAvatar profile={item.creator} size={44} />
            </button>
            <div className="flex-1 min-w-0">
              <button
                onClick={() => navigate(`/profile/${item.creator!.username}`)}
                className="font-bold text-[14px] text-text-primary hover:underline block truncate"
              >
                {item.creator.full_name}
              </button>
              {item.creator.bio && (
                <p className="text-[12px] text-text-secondary truncate">{item.creator.bio}</p>
              )}
            </div>
            <button
              onClick={() => onFollow(item.creator!.id)}
              className={`shrink-0 px-3 py-1.5 rounded-badge text-[12px] font-bold transition-colors ${
                followingIds.has(item.creator.id)
                  ? 'bg-surface-elevated text-text-secondary border border-border'
                  : 'bg-accent hover:bg-accent-hover text-white'
              }`}
            >
              {followingIds.has(item.creator.id) ? 'Following' : 'Follow'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ─────────────────────────────────────────────────────────────
// Feed Header Strip (activity chips)
// ─────────────────────────────────────────────────────────────

function FeedHeaderStrip({
  profileId,
  myFields,
  friendIds,
  followingIds,
}: {
  profileId: string
  myFields: string[]
  friendIds: string[]
  followingIds: string[]
}) {
  const navigate = useNavigate()
  const [chips, setChips] = useState<HeaderChip[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchChips = useCallback(async () => {
    const newChips: HeaderChip[] = []
    const now = new Date()
    const since24h = new Date(now.getTime() - 86_400_000).toISOString()
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

    await Promise.all([
      myFields.length > 0
        ? supabase.from('posts').select('id', { count: 'exact', head: true })
            .eq('post_type', 'pro').in('persona_discipline', myFields).gte('created_at', since24h)
            .then(({ count }) => {
              if (count && count > 0) {
                const meta = getProfMeta(myFields[0])
                newChips.push({
                  id: 'new-pro-posts',
                  label: `${count} new Pro Post${count > 1 ? 's' : ''} in ${meta?.label ?? myFields[0]}`,
                  route: '/explore',
                })
              }
            })
        : Promise.resolve(),

      friendIds.length > 0
        ? supabase.from('posts').select('user_id', { count: 'exact', head: false })
            .in('user_id', friendIds.slice(0, 50)).gte('created_at', todayMidnight)
            .then(({ data }) => {
              const uniq = new Set((data || []).map((r: any) => r.user_id)).size
              if (uniq > 0) {
                newChips.push({
                  id: 'friends-posted',
                  label: `${uniq} Friend${uniq > 1 ? 's' : ''} posted today`,
                  route: '/feed?tab=following',
                })
              }
            })
        : Promise.resolve(),

      followingIds.length > 0
        ? supabase.from('discipline_personas')
            .select('user_id, discipline, level, profiles:user_id(full_name, username)')
            .in('user_id', followingIds.slice(0, 50))
            .in('level', ['expert', 'authority'])
            .gte('created_at', new Date(now.getTime() - 7 * 86_400_000).toISOString())
            .limit(1)
            .then(({ data }) => {
              if (data && data.length > 0) {
                const row = data[0] as any
                const name = row.profiles?.full_name ?? 'A creator you follow'
                const lvlLabel = row.level === 'authority' ? 'Authority' : 'Expert'
                newChips.push({
                  id: 'tier-up',
                  label: `${name} just hit ${lvlLabel} tier`,
                  route: `/profile/${row.profiles?.username ?? ''}`,
                })
              }
            })
        : Promise.resolve(),
    ])

    setChips(newChips)
  }, [profileId, myFields.join(','), friendIds.join(','), followingIds.join(',')])

  useEffect(() => {
    fetchChips()
    timerRef.current = setInterval(fetchChips, 5 * 60_000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchChips])

  if (chips.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-4 md:px-0">
      {chips.map(chip => (
        <button
          key={chip.id}
          onClick={() => navigate(chip.route)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-badge bg-surface-elevated border border-border text-text-secondary text-[12px] font-semibold hover:border-border-strong hover:text-text-primary transition-colors"
        >
          <span className="flex w-3 h-3"><Icon.Activity /></span>
          {chip.label}
        </button>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main FeedPage
// ─────────────────────────────────────────────────────────────

const POST_FIELDS = 'id,user_id,content_type,caption,poem_text,media_url,media_path,thumb_url,display_url,tags,like_count,comment_count,share_count,pro_upvote_count,is_pro_post,post_type,persona_discipline,visibility,group_id,created_at,expires_at'

export default function FeedPage({ onPost }: Props) {
  const { profile } = useAuth()
  const navigate    = useNavigate()

  const [tab,          setTab]          = useState<FeedTab>('all')
  const [feedItems,    setFeedItems]    = useState<FeedItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [friendIds,    setFriendIds]    = useState<string[]>([])
  const [myFieldSet,   setMyFieldSet]   = useState<Set<string>>(new Set())
  const [localFollowingSet, setLocalFollowingSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!profile) return
    Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', profile.id),
      getFriends(profile.id),
      supabase.from('discipline_personas').select('discipline').eq('user_id', profile.id),
    ]).then(([followRes, fIds, personaRes]) => {
      const fwIds = (followRes.data || []).map((r: any) => r.following_id)
      setFollowingIds(fwIds)
      setLocalFollowingSet(new Set(fwIds))
      setFriendIds(fIds)
      setMyFieldSet(new Set((personaRes.data || []).map((r: any) => r.discipline as string)))
    })
  }, [profile?.id])

  async function enrichPosts(raw: any[]): Promise<Post[]> {
    if (!raw.length) return []
    const uids = [...new Set(raw.map((p: any) => p.user_id))]
    const { data } = await supabase.from('profiles')
      .select('id,username,full_name,avatar_url,profession,role_title,is_pro,verification_count')
      .in('id', uids)
    const map: Record<string, Profile> = {}
    ;(data || []).forEach((p: any) => { map[p.id] = p })
    return raw.map(p => ({ ...p, profiles: map[p.user_id] ?? null }))
  }

  async function markInteractions(posts: Post[]): Promise<Post[]> {
    if (!profile || !posts.length) return posts
    const ids = posts.map(p => p.id)
    const [lRes, uRes] = await Promise.all([
      supabase.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', ids),
      supabase.from('pro_upvotes').select('post_id').eq('user_id', profile.id).in('post_id', ids),
    ])
    const liked   = new Set((lRes.data || []).map((r: any) => r.post_id))
    const upvoted = new Set((uRes.data || []).map((r: any) => r.post_id))
    return posts.map(p => ({ ...p, user_liked: liked.has(p.id), user_pro_upvoted: upvoted.has(p.id) }))
  }

  const handleFollow = useCallback(async (targetId: string) => {
    if (!profile) return
    if (localFollowingSet.has(targetId)) return
    const { error } = await supabase.from('follows').insert({ follower_id: profile.id, following_id: targetId })
    if (!error) {
      setLocalFollowingSet(prev => new Set([...prev, targetId]))
      toast.success('Following!')
    }
  }, [profile, localFollowingSet])

  const fetchFollowingFeed = useCallback(async () => {
    const allIds = [...new Set([...followingIds, ...friendIds])]
    if (!allIds.length) { setFeedItems([]); setLoading(false); return }

    const now = Date.now()
    const friendSet    = new Set(friendIds)
    const followingSet = new Set(followingIds)

    const { data, error } = await supabase.from('posts').select(POST_FIELDS)
      .in('user_id', allIds).order('created_at', { ascending: false }).limit(60)

    if (error) { toast.error(error.message); setLoading(false); return }

    let posts = await enrichPosts(data || [])
    posts = await markInteractions(posts)

    posts.sort((a, b) => {
      const sa = a.post_type === 'pro' ? scoreProPost(a, now) : scoreGeneralPost(a, now, friendSet, followingSet)
      const sb = b.post_type === 'pro' ? scoreProPost(b, now) : scoreGeneralPost(b, now, friendSet, followingSet)
      return sb - sa
    })

    const filtered = posts.filter(p =>
      p.post_type === 'pro' ||
      (!p.expires_at && scoreGeneralPost(p, now, friendSet, followingSet) >= 0) ||
      (p.expires_at && new Date(p.expires_at) > new Date())
    )

    setFeedItems(filtered.map(p => ({
      type: p.post_type === 'pro' ? 'pro_post' : 'general_post',
      post: p,
    } as FeedItem)))
    setLoading(false)
  }, [followingIds.join(','), friendIds.join(',')])

  const fetchForYouFeed = useCallback(async () => {
    if (!profile) return

    const now          = Date.now()
    const myFields     = [...myFieldSet]
    const primaryField = myFields[0] ?? null
    const friendSet    = new Set(friendIds)
    const followingSet = new Set(followingIds)
    const socialIds    = [...new Set([...followingIds, ...friendIds])]
    const allFields    = Object.keys(PROFESSIONS)
    const otherFields  = allFields.filter(f => !myFieldSet.has(f))
    const maturity     = getFeedMaturity(profile, myFields.length)
    const coldStart    = isNewUser(myFields.length, friendIds.length)
    const since24h     = new Date(now - 86_400_000).toISOString()
    const since7d      = new Date(now - 7 * 86_400_000).toISOString()

    try {
      const [
        proRes,
        generalRes,
        trendingRes,
        weeklyTopRes,
        voteActivityRes,
        discoverCreatorsRes,
      ] = await Promise.all([
        myFields.length > 0
          ? supabase.from('posts').select(POST_FIELDS).eq('post_type', 'pro').in('persona_discipline', myFields)
              .order('pro_upvote_count', { ascending: false }).order('created_at', { ascending: false })
              .limit(maturity === 'active' ? 40 : maturity === 'developing' ? 30 : 20)
          : supabase.from('posts').select(POST_FIELDS).eq('post_type', 'pro')
              .order('pro_upvote_count', { ascending: false }).order('created_at', { ascending: false }).limit(30),

        socialIds.length > 0
          ? supabase.from('posts').select(POST_FIELDS).eq('post_type', 'general')
              .in('user_id', socialIds.slice(0, 100)).gte('created_at', since24h)
              .order('created_at', { ascending: false }).limit(20)
          : supabase.from('posts').select(POST_FIELDS).eq('post_type', 'general')
              .gte('created_at', since24h).order('created_at', { ascending: false }).limit(15),

        otherFields.length > 0
          ? supabase.from('posts').select(POST_FIELDS).eq('post_type', 'pro')
              .in('persona_discipline', otherFields.slice(0, 15))
              .order('pro_upvote_count', { ascending: false }).order('created_at', { ascending: false }).limit(20)
          : Promise.resolve({ data: [] }),

        primaryField
          ? supabase.from('posts').select(POST_FIELDS).eq('post_type', 'pro')
              .eq('persona_discipline', primaryField).gte('created_at', since7d)
              .order('pro_upvote_count', { ascending: false }).limit(5)
          : Promise.resolve({ data: [] }),

        supabase.from('pro_upvotes').select('post_id, user_id, created_at')
          .order('created_at', { ascending: false }).limit(60),

        supabase.from('profiles')
          .select('id,username,full_name,bio,avatar_url,profession,role_title,is_pro,verification_count,follower_count')
          .not('id', 'in', `(${[profile.id, ...followingIds.slice(0, 50)].join(',')})`)
          .order('follower_count', { ascending: false }).limit(10),
      ])

      const [enrichedPro, enrichedGeneral, enrichedTrending, enrichedWeekly] = await Promise.all([
        enrichPosts((proRes.data || []) as any[]),
        enrichPosts((generalRes.data || []) as any[]),
        enrichPosts((trendingRes.data || []) as any[]),
        enrichPosts((weeklyTopRes.data || []) as any[]),
      ])

      const scoredPro = enrichedPro
        .map(p => ({ post: p, score: scoreProPost(p, now) }))
        .sort((a, b) => b.score - a.score).map(x => x.post)

      const scoredGeneral = enrichedGeneral
        .map(p => ({ post: p, score: scoreGeneralPost(p, now, friendSet, followingSet) }))
        .filter(x => x.score >= 0).sort((a, b) => b.score - a.score).map(x => x.post)

      const topWeeklyProPost = enrichedWeekly.length > 0
        ? enrichedWeekly.sort((a, b) => scoreProPost(b, now) - scoreProPost(a, now))[0]
        : null

      const voteRows = (voteActivityRes.data || []) as Array<{ post_id: string; user_id: string; created_at: string }>
      let proVoteActivities: ProVoteActivityItem[] = []
      let risingCreators: RisingCreatorItem[] = []

      if (voteRows.length > 0) {
        const postIds  = [...new Set(voteRows.map(v => v.post_id))]
        const voterIds = [...new Set(voteRows.map(v => v.user_id))]

        const [votedPostsRes, voterProfilesRes, voterPersonasRes] = await Promise.all([
          supabase.from('posts').select('id,user_id,caption,persona_discipline,pro_upvote_count').in('id', postIds.slice(0, 40)),
          supabase.from('profiles').select('id,username,full_name,avatar_url,profession,role_title,is_pro,verification_count').in('id', voterIds.slice(0, 40)),
          supabase.from('discipline_personas').select('user_id,discipline,level').in('user_id', voterIds.slice(0, 40)),
        ])

        const votedPostMap: Record<string, any> = {}
        ;(votedPostsRes.data || []).forEach((p: any) => { votedPostMap[p.id] = p })
        const voterProfileMap: Record<string, Profile> = {}
        ;(voterProfilesRes.data || []).forEach((p: any) => { voterProfileMap[p.id] = p })
        const personaMap: Record<string, Record<string, PersonaLevel>> = {}
        ;(voterPersonasRes.data || []).forEach((p: any) => {
          if (!personaMap[p.user_id]) personaMap[p.user_id] = {}
          personaMap[p.user_id][p.discipline] = p.level
        })

        const creatorIds = [...new Set((votedPostsRes.data || []).map((p: any) => p.user_id))]
        const { data: creatorProfilesData } = creatorIds.length > 0
          ? await supabase.from('profiles')
              .select('id,username,full_name,avatar_url,profession,role_title,is_pro,verification_count,follower_count,post_count')
              .in('id', creatorIds.slice(0, 40))
          : { data: [] }
        const creatorProfileMap: Record<string, Profile> = {}
        ;(creatorProfilesData || []).forEach((p: any) => { creatorProfileMap[p.id] = p })

        const seenVoteCards = new Set<string>()
        const seenRisingCreators = new Set<string>()

        for (const vote of voteRows) {
          const votedPost = votedPostMap[vote.post_id]
          if (!votedPost || !votedPost.persona_discipline) continue
          const voterLevel = personaMap[vote.user_id]?.[votedPost.persona_discipline]
          if (!voterLevel || (voterLevel !== 'authority' && voterLevel !== 'expert')) continue
          const voter   = voterProfileMap[vote.user_id]
          const creator = creatorProfileMap[votedPost.user_id]
          if (!voter || !creator || voter.id === profile.id) continue

          const cardKey = `${creator.id}:${votedPost.persona_discipline}`
          if (!seenVoteCards.has(cardKey) && proVoteActivities.length < 5) {
            seenVoteCards.add(cardKey)
            const postForCard: Post = {
              id: votedPost.id, user_id: votedPost.user_id,
              caption: votedPost.caption ?? '', post_type: 'pro',
              persona_discipline: votedPost.persona_discipline, profiles: creator,
              content_type: 'text', poem_text: '', media_url: '', media_path: '',
              tags: [], like_count: 0, comment_count: 0, share_count: 0,
              pro_upvote_count: votedPost.pro_upvote_count ?? 0,
              is_pro_post: true, visibility: 'public', created_at: vote.created_at,
            }
            proVoteActivities.push({ type: 'pro_vote_activity', voter, creator, post: postForCard, discipline: votedPost.persona_discipline, voterLevel })
          }

          if (voterLevel === 'authority' && !seenRisingCreators.has(creator.id)
            && (votedPost.pro_upvote_count ?? 0) <= 5 && creator.id !== profile.id && risingCreators.length < 5) {
            seenRisingCreators.add(creator.id)
            risingCreators.push({
              type: 'rising_creator', creator, discipline: votedPost.persona_discipline,
              reason: (votedPost.pro_upvote_count ?? 0) <= 1 ? 'first_authority_vote' : 'trust_increase',
            })
          }
        }
      }

      const discoverItems: DiscoverItem[] = []
      const shuffledOther = otherFields
        .filter(f => enrichedTrending.some(p => p.persona_discipline === f))
        .slice(0, 3)
      shuffledOther.forEach(f => discoverItems.push({ type: 'discover', discoverType: 'field', field: f }))
      ;(discoverCreatorsRes.data || []).slice(0, 3).forEach((c: any) => {
        discoverItems.push({ type: 'discover', discoverType: 'creator', creator: c as Profile })
      })

      let finalProPool = scoredPro
      if (maturity !== 'active' && enrichedTrending.length > 0) {
        const trendingScored = enrichedTrending
          .filter(p => !scoredPro.some(sp => sp.id === p.id))
          .map(p => ({ post: p, score: scoreProPost(p, now) }))
          .sort((a, b) => b.score - a.score).map(x => x.post)
        finalProPool = [...scoredPro, ...trendingScored]
      }

      const rhythmicItems = buildRhythmicFeed({
        proPosts: finalProPool, generalPosts: scoredGeneral,
        risingCreators, proVoteActivities, discoverItems,
        topWeeklyProPost, coldStart, cycles: 3,
      })

      const allPosts = rhythmicItems
        .filter((i): i is { type: 'pro_post' | 'general_post'; post: Post } =>
          i.type === 'pro_post' || i.type === 'general_post')
        .map(i => i.post)

      const marked = await markInteractions(allPosts)
      const markedMap: Record<string, Post> = {}
      marked.forEach(p => { markedMap[p.id] = p })

      const finalItems: FeedItem[] = rhythmicItems.map(item => {
        if (item.type === 'pro_post' || item.type === 'general_post')
          return { ...item, post: markedMap[item.post.id] ?? item.post }
        return item
      })

      setFeedItems(finalItems)
    } catch (err: any) {
      toast.error('Failed to load feed')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [profile?.id, followingIds.join(','), friendIds.join(','), [...myFieldSet].sort().join(',')])

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    if (tab === 'following') await fetchFollowingFeed()
    else await fetchForYouFeed()
  }, [tab, fetchFollowingFeed, fetchForYouFeed])

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
      const { data } = await supabase.from('posts').select(POST_FIELDS)
        .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1)
      if (!data?.length) { fetchPosts(); return }
      const { data: pData } = await supabase.from('profiles')
        .select('id,username,full_name,avatar_url,profession,role_title,is_pro,verification_count')
        .eq('id', profile.id)
      const newPost: Post = { ...data[0], profiles: (pData?.[0] as Profile) ?? undefined }
      const newItem: FeedItem = { type: newPost.post_type === 'pro' ? 'pro_post' : 'general_post', post: newPost }
      setFeedItems(prev => {
        const without = prev.filter(i =>
          (i.type !== 'pro_post' && i.type !== 'general_post') || (i as any).post.id !== newPost.id)
        return [newItem, ...without]
      })
    }
    window.addEventListener('oc:post-created', handler)
    return () => window.removeEventListener('oc:post-created', handler)
  }, [fetchPosts, profile?.id])

  const postCount = feedItems.filter(i => i.type === 'pro_post' || i.type === 'general_post').length
  const myFields  = [...myFieldSet]
  const maturity  = getFeedMaturity(profile, myFields.length)

  function initials(name: string) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  const tabs: { key: FeedTab; label: string }[] = [
    { key: 'all',       label: 'For you' },
    { key: 'following', label: 'Following' },
  ]

  return (
    <div className="max-w-[614px] mx-auto md:py-4">

      {/* ── Feed tabs + activity chips (sticky on mobile) ─── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        {/* Tab bar */}
        <div className="flex">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 py-3 text-[14px] font-bold transition-colors relative"
              style={{ color: tab === t.key ? '#111111' : '#9CA3AF' }}
            >
              {t.label}
              {tab === t.key && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-accent rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Activity chips ── */}
      {profile && tab === 'all' && (
        <div className="pt-3 pb-1">
          <FeedHeaderStrip
            profileId={profile.id}
            myFields={myFields}
            friendIds={friendIds}
            followingIds={followingIds}
          />
        </div>
      )}

      {/* ── Composer ────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-surface border-b border-border cursor-text"
        onClick={onPost}
      >
        <div className="w-8 h-8 rounded-full overflow-hidden bg-surface-elevated ring-1 ring-border flex items-center justify-center text-[11px] font-semibold text-text-secondary shrink-0">
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
            : initials(profile?.full_name || '')}
        </div>
        <span className="flex-1 text-[15px] text-text-hint select-none">
          What did you create today?
        </span>
        <button
          onClick={e => { e.stopPropagation(); onPost() }}
          className="shrink-0 px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-[13px] font-bold rounded-badge transition-colors"
        >
          Post
        </button>
      </div>

      {/* ── Feed maturity nudge ──────────────────────────────── */}
      {tab === 'all' && !loading && postCount > 0 && maturity === 'new' && (
        <div className="flex items-center gap-2 mx-4 my-3 px-3 py-2.5 rounded-[8px] bg-surface-elevated border border-border">
          <span className="flex w-3.5 h-3.5 shrink-0 text-text-secondary"><Icon.Info /></span>
          <p className="text-[12.5px] text-text-secondary flex-1">
            Follow more fields and creators to personalise your feed.
          </p>
          <button
            onClick={() => navigate('/explore')}
            className="text-[12px] font-bold text-text-primary hover:underline shrink-0"
          >
            Explore →
          </button>
        </div>
      )}

      {/* ── Feed items ──────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-border-strong border-t-transparent rounded-full animate-spin" />
        </div>
      ) : postCount === 0 && feedItems.length === 0 ? (
        tab === 'following' ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <span className="flex w-10 h-10 mb-3 text-border-strong"><Icon.Feed /></span>
            <p className="font-bold text-text-primary text-[15px]">Follow some creators</p>
            <p className="text-[13px] text-text-secondary mt-1 mb-5">Their posts will appear here.</p>
            <button
              onClick={() => navigate('/explore')}
              className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-[14px] font-bold rounded-badge transition-colors"
            >
              Explore creators
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mx-4 my-3 px-3 py-2.5 rounded-[8px] bg-surface-elevated border border-border">
              <span className="flex w-3.5 h-3.5 shrink-0 text-text-secondary"><Icon.Info /></span>
              <p className="text-[12.5px] text-text-secondary flex-1">
                Showing sample posts — be the first to share your work!
              </p>
              <button
                onClick={onPost}
                className="text-[12px] font-bold text-text-primary hover:underline shrink-0"
              >
                Post now →
              </button>
            </div>
            {DUMMY_FEED_ITEMS.map(item => (
              <PostCard key={item.post.id} post={item.post} onUpdated={() => {}} />
            ))}
          </>
        )
      ) : (
        feedItems.map((item, idx) => {
          if (item.type === 'pro_post' || item.type === 'general_post')
            return <PostCard key={item.post.id} post={item.post} onUpdated={fetchPosts} />

          if (item.type === 'rising_creator')
            return (
              <RisingCreatorCard
                key={`rising-${item.creator.id}-${idx}`}
                item={item}
                onFollow={handleFollow}
                followingIds={localFollowingSet}
              />
            )

          if (item.type === 'pro_vote_activity')
            return (
              <ProVoteActivityCard
                key={`pva-${item.voter.id}-${item.post.id}-${idx}`}
                item={item}
              />
            )

          if (item.type === 'discover')
            return (
              <DiscoverCard
                key={`discover-${item.discoverType}-${item.field ?? item.creator?.id ?? idx}`}
                item={item}
                onFollow={handleFollow}
                followingIds={localFollowingSet}
              />
            )

          return null
        })
      )}

      {/* Bottom spacer for mobile nav */}
      <div className="h-20 md:h-0" />
    </div>
  )
}
