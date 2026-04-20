import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Post, Profile, PROFESSIONS, PersonaLevel } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { getFriends } from '@/lib/friends'
import PostCard from '@/components/PostCard'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

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

// ─────────────────────────────────────────────────────────────
// Cold Start Detection
// ─────────────────────────────────────────────────────────────

function isNewUser(fieldCount: number, friendCount: number): boolean {
  return fieldCount < 5 && friendCount < 10
}

// ─────────────────────────────────────────────────────────────
// Pro Post Scoring
// ProPostScore = (ProMultiplier × EngagementScore) × RecencyDecay
// ─────────────────────────────────────────────────────────────

function scoreProPost(post: Post, now: number): number {
  const ageDays = (now - new Date(post.created_at).getTime()) / 86_400_000

  // ProMultiplier: +10 per Authority, +5 per Expert vote (proxied as 7.5 avg),
  // +1 per like, +2 per comment
  const proVotePoints  = post.pro_upvote_count * 7.5
  const likePoints     = post.like_count * 1
  const commentPoints  = post.comment_count * 2
  const proMultiplier  = proVotePoints + likePoints + commentPoints

  // EngagementScore: ratio of pro engagement to total — credibility signal
  const engagementScore = proMultiplier > 0
    ? proVotePoints / proMultiplier
    : 0.1 // default for brand-new posts

  // RecencyDecay: half-life of 7 days (λ = 0.1)
  const recencyDecay = Math.exp(-0.1 * ageDays)

  // Newcomer Boost: 1.5× for first 24h if post has fewer than 10 pro votes
  const newcomerBoost = (post.pro_upvote_count < 10 && ageDays < 1) ? 1.5 : 1.0

  return (proMultiplier * engagementScore) * recencyDecay * newcomerBoost
}

// ─────────────────────────────────────────────────────────────
// General Post Scoring
// GeneralPostScore = RecencyScore + FriendProximityBoost + EngagementVelocityBoost
// ─────────────────────────────────────────────────────────────

function scoreGeneralPost(
  post: Post,
  now: number,
  friendSet: Set<string>,
  followingSet: Set<string>
): number {
  const ageHours = (now - new Date(post.created_at).getTime()) / 3_600_000
  if (ageHours >= 24) return -1 // hard expire

  // RecencyScore: aggressive decay, half-life of 4 hours
  const λ = Math.log(2) / 4
  const recencyScore = 100 * Math.exp(-λ * ageHours)

  // FriendProximityBoost
  const friendBoost = friendSet.has(post.user_id) ? 20
    : followingSet.has(post.user_id) ? 8 : 0

  // EngagementVelocityBoost (approx from total engagement, capped at +25)
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
      // Cold start rhythm — heavy General and Discover, Rising replaces ProVoteActivity
      // Pos 1: General, 2: General, 3: General, 4: Discover,
      // Pos 5: General, 6: Discover, 7: Rising, 8: General, 9: Discover, 10: Rising
      const gen1 = nextGeneral() ?? nextPro(); if (gen1) pushPost(gen1)                          // 1
      const gen2 = nextGeneral() ?? nextPro(); if (gen2) pushPost(gen2)                          // 2
      const gen3 = nextGeneral() ?? nextPro(); if (gen3) pushPost(gen3)                          // 3
      const dc1 = discoverItems[di++]; dc1 ? items.push(dc1) : fallback(true)                   // 4
      const gen5 = nextGeneral() ?? nextPro(); if (gen5) pushPost(gen5)                          // 5
      const dc2 = discoverItems[di++]; dc2 ? items.push(dc2) : fallback(true)                   // 6
      const rc1 = risingCreators[ri++]; rc1 ? items.push(rc1) : fallback()                      // 7
      const gen8 = nextGeneral() ?? nextPro(); if (gen8) pushPost(gen8)                          // 8
      const dc3 = discoverItems[di++]; dc3 ? items.push(dc3) : fallback(true)                   // 9
      const rc2 = risingCreators[ri++]; rc2 ? items.push(rc2) : fallback()                      // 10
    } else {
      // Standard 10-post rhythm
      const p1 = nextPro(); if (p1) items.push({ type: 'pro_post', post: p1 })                  // 1
      const p2 = nextPro(); if (p2) items.push({ type: 'pro_post', post: p2 })                  // 2
      const g3 = nextGeneral(); if (g3) items.push({ type: 'general_post', post: g3 })          // 3
      const rc = risingCreators[ri++]; rc ? items.push(rc) : fallback()                          // 4
      const p5 = nextPro(); if (p5) items.push({ type: 'pro_post', post: p5 })                  // 5
      const p6 = nextPro(); if (p6) items.push({ type: 'pro_post', post: p6 })                  // 6
      const pva = proVoteActivities[vi++]; pva ? items.push(pva) : fallback()                    // 7
      const g8 = nextGeneral(); if (g8) items.push({ type: 'general_post', post: g8 })          // 8
      const dc = discoverItems[di++]; dc ? items.push(dc) : fallback()                           // 9
      // 10: Top Pro Post of the week in primary Field
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
// Inline Card Components
// ─────────────────────────────────────────────────────────────

function Avatar({ profile, size = 40 }: { profile: Profile; size?: number }) {
  const initials = profile.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  return (
    <div
      className="rounded-full overflow-hidden bg-brand-100 dark:bg-brand-900 flex items-center justify-center font-semibold text-brand-700 dark:text-brand-300 shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.33 }}
    >
      {profile.avatar_url
        ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        : initials}
    </div>
  )
}

function LevelBadge({ level }: { level: PersonaLevel }) {
  const map: Record<PersonaLevel, { label: string; cls: string }> = {
    newcomer:    { label: 'Newcomer',  cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
    contributor: { label: 'Contributor', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    expert:      { label: 'Expert',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
    authority:   { label: 'Authority', cls: 'bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-400' },
  }
  const { label, cls } = map[level]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  )
}

function FieldPill({ discipline }: { discipline: string }) {
  const meta = (PROFESSIONS as Record<string, { label: string; icon: string }>)[discipline]
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[11px] font-medium text-gray-600 dark:text-gray-300">
      {meta ? <>{meta.icon} {meta.label}</> : discipline}
    </span>
  )
}

// Rising Creator Card
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
  const reasonLabel = item.reason === 'first_authority_vote'
    ? 'Just received their first Authority Pro Vote'
    : 'Significant trust score increase this week'

  return (
    <div className="apple-card px-4 md:px-5 py-4 mb-3 border-l-2 border-amber-400 dark:border-amber-500">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="flex w-3.5 h-3.5 text-amber-500"><Icon.Star /></span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Rising Creator</span>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/profile/${item.creator.username}`)} className="shrink-0">
          <Avatar profile={item.creator} size={48} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => navigate(`/profile/${item.creator.username}`)}
              className="font-semibold text-[15px] text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              {item.creator.full_name}
            </button>
            <FieldPill discipline={item.discipline} />
          </div>
          <p className="text-[12.5px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{reasonLabel}</p>
        </div>
        <button
          onClick={() => onFollow(item.creator.id)}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${
            followingIds.has(item.creator.id)
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
              : 'bg-brand-600 text-white hover:bg-brand-700'
          }`}
        >
          <span className="flex w-3.5 h-3.5"><Icon.UserPlus /></span>
          {followingIds.has(item.creator.id) ? 'Following' : 'Follow'}
        </button>
      </div>
    </div>
  )
}

// Pro Vote Activity Card
function ProVoteActivityCard({ item }: { item: ProVoteActivityItem }) {
  const navigate = useNavigate()
  const fieldMeta = (PROFESSIONS as Record<string, { label: string; icon: string }>)[item.discipline]
  const fieldLabel = fieldMeta ? `${fieldMeta.icon} ${fieldMeta.label}` : item.discipline

  return (
    <div className="apple-card px-4 md:px-5 py-4 mb-3">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="flex w-3.5 h-3.5 text-brand-500"><Icon.Award /></span>
        <span className="text-[11px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">Pro Vote Activity</span>
      </div>
      <div className="flex items-start gap-3">
        <button onClick={() => navigate(`/profile/${item.voter.username}`)} className="shrink-0 mt-0.5">
          <Avatar profile={item.voter} size={40} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] text-gray-900 dark:text-white leading-snug">
            <button
              onClick={() => navigate(`/profile/${item.voter.username}`)}
              className="font-semibold hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              {item.voter.full_name}
            </button>
            {' '}
            <LevelBadge level={item.voterLevel} />
            {' '}
            <span className="text-gray-500 dark:text-gray-400">Pro Voted </span>
            <button
              onClick={() => navigate(`/profile/${item.creator.username}`)}
              className="font-semibold hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
            >
              {item.creator.full_name}
            </button>
            <span className="text-gray-500 dark:text-gray-400">'s work in </span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{fieldLabel}</span>
          </p>
          {item.post.caption && (
            <button
              onClick={() => navigate(`/profile/${item.creator.username}`)}
              className="mt-2 block w-full text-left px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800 text-[13px] text-gray-600 dark:text-gray-300 line-clamp-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {item.post.caption}
              <span className="ml-2 text-brand-600 dark:text-brand-400 font-medium">View →</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Discover Card
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
    const meta = (PROFESSIONS as Record<string, { label: string; icon: string }>)[item.field]
    return (
      <div className="apple-card px-4 md:px-5 py-4 mb-3 border-l-2 border-indigo-400 dark:border-indigo-500">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="flex w-3.5 h-3.5 text-indigo-500"><Icon.Explore /></span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Discover a Field</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-2xl shrink-0">
            {meta?.icon ?? '✦'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[15px] text-gray-900 dark:text-white">{meta?.label ?? item.field}</p>
            <p className="text-[12.5px] text-gray-500 dark:text-gray-400">Explore work from creators in this field</p>
          </div>
          <button
            onClick={() => navigate('/explore')}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full bg-indigo-600 text-white text-[12.5px] font-semibold hover:bg-indigo-700 transition-colors"
          >
            Explore <span className="flex w-3.5 h-3.5"><Icon.ArrowRight /></span>
          </button>
        </div>
      </div>
    )
  }

  if (item.discoverType === 'creator' && item.creator) {
    return (
      <div className="apple-card px-4 md:px-5 py-4 mb-3 border-l-2 border-indigo-400 dark:border-indigo-500">
        <div className="flex items-center gap-1.5 mb-3">
          <span className="flex w-3.5 h-3.5 text-indigo-500"><Icon.Explore /></span>
          <span className="text-[11px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Discover a Creator</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/profile/${item.creator!.username}`)} className="shrink-0">
            <Avatar profile={item.creator} size={48} />
          </button>
          <div className="flex-1 min-w-0">
            <button
              onClick={() => navigate(`/profile/${item.creator!.username}`)}
              className="font-semibold text-[15px] text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 transition-colors block"
            >
              {item.creator.full_name}
            </button>
            {item.creator.bio && (
              <p className="text-[12.5px] text-gray-500 dark:text-gray-400 truncate">{item.creator.bio}</p>
            )}
          </div>
          <button
            onClick={() => onFollow(item.creator!.id)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors ${
              followingIds.has(item.creator.id)
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                : 'bg-brand-600 text-white hover:bg-brand-700'
            }`}
          >
            <span className="flex w-3.5 h-3.5"><Icon.UserPlus /></span>
            {followingIds.has(item.creator.id) ? 'Following' : 'Follow'}
          </button>
        </div>
      </div>
    )
  }

  return null
}

// Feed Header Strip
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
      // Chip 1: New Pro Posts in user's fields in last 24h
      myFields.length > 0
        ? supabase
            .from('posts')
            .select('id', { count: 'exact', head: true })
            .eq('post_type', 'pro')
            .in('persona_discipline', myFields)
            .gte('created_at', since24h)
            .then(({ count }) => {
              if (count && count > 0) {
                const primaryField = myFields[0]
                const meta = (PROFESSIONS as Record<string, { label: string }>)[primaryField]
                newChips.push({
                  id: 'new-pro-posts',
                  label: `${count} new Pro Post${count > 1 ? 's' : ''} in ${meta?.label ?? primaryField}`,
                  route: '/explore',
                })
              }
            })
        : Promise.resolve(),

      // Chip 2: Friends who posted today
      friendIds.length > 0
        ? supabase
            .from('posts')
            .select('user_id', { count: 'exact', head: false })
            .in('user_id', friendIds.slice(0, 50))
            .gte('created_at', todayMidnight)
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

      // Chip 3: Followed creator who recently hit Expert/Authority tier
      followingIds.length > 0
        ? supabase
            .from('discipline_personas')
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
    <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-none">
      {chips.map(chip => (
        <button
          key={chip.id}
          onClick={() => navigate(chip.route)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300 text-[12px] font-medium hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors"
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

const POST_FIELDS = 'id,user_id,content_type,caption,poem_text,media_url,media_path,thumb_url,display_url,tags,like_count,comment_count,share_count,pro_upvote_count,is_pro_post,post_type,persona_discipline,visibility,group_id,created_at'

export default function FeedPage({ onPost }: Props) {
  const { profile } = useAuth()
  const navigate    = useNavigate()

  const [tab,          setTab]          = useState<FeedTab>('all')
  const [feedItems,    setFeedItems]    = useState<FeedItem[]>([])
  const [loading,      setLoading]      = useState(true)
  const [composerText, setComposerText] = useState('')
  const [posting,      setPosting]      = useState(false)
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [friendIds,    setFriendIds]    = useState<string[]>([])
  const [myFieldSet,   setMyFieldSet]   = useState<Set<string>>(new Set())

  // For quick follow from Discover/Rising cards
  const [localFollowingSet, setLocalFollowingSet] = useState<Set<string>>(new Set())

  // ── Bootstrap social graph + fields ──────────────────────
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

  // ── Helpers ───────────────────────────────────────────────

  async function enrichPosts(raw: any[]): Promise<Post[]> {
    if (!raw.length) return []
    const uids = [...new Set(raw.map((p: any) => p.user_id))]
    const { data } = await supabase
      .from('profiles')
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
    const liked    = new Set((lRes.data || []).map((r: any) => r.post_id))
    const upvoted  = new Set((uRes.data || []).map((r: any) => r.post_id))
    return posts.map(p => ({ ...p, user_liked: liked.has(p.id), user_pro_upvoted: upvoted.has(p.id) }))
  }

  // ── Quick follow from inline cards ─────────────────────────
  const handleFollow = useCallback(async (targetId: string) => {
    if (!profile) return
    const isFollowing = localFollowingSet.has(targetId)
    if (isFollowing) return // don't unfollow from feed cards for safety
    const { error } = await supabase
      .from('follows')
      .insert({ follower_id: profile.id, following_id: targetId })
    if (!error) {
      setLocalFollowingSet(prev => new Set([...prev, targetId]))
      toast.success('Following!')
    }
  }, [profile, localFollowingSet])

  // ── Following tab ─────────────────────────────────────────
  const fetchFollowingFeed = useCallback(async () => {
    const allIds = [...new Set([...followingIds, ...friendIds])]
    if (!allIds.length) { setFeedItems([]); setLoading(false); return }

    const now = Date.now()
    const friendSet    = new Set(friendIds)
    const followingSet = new Set(followingIds)

    const { data, error } = await supabase
      .from('posts')
      .select(POST_FIELDS)
      .in('user_id', allIds)
      .order('created_at', { ascending: false })
      .limit(60)

    if (error) { toast.error(error.message); setLoading(false); return }

    let posts = await enrichPosts(data || [])
    posts = await markInteractions(posts)

    // Sort: General posts by GeneralPostScore, Pro posts by ProPostScore
    posts.sort((a, b) => {
      const sa = a.post_type === 'pro'
        ? scoreProPost(a, now)
        : scoreGeneralPost(a, now, friendSet, followingSet)
      const sb = b.post_type === 'pro'
        ? scoreProPost(b, now)
        : scoreGeneralPost(b, now, friendSet, followingSet)
      return sb - sa
    })

    // Filter out expired general posts
    const filtered = posts.filter(p =>
      p.post_type === 'pro' || scoreGeneralPost(p, now, friendSet, followingSet) >= 0
    )

    setFeedItems(filtered.map(p => ({
      type: p.post_type === 'pro' ? 'pro_post' : 'general_post',
      post: p,
    } as FeedItem)))
    setLoading(false)
  }, [followingIds.join(','), friendIds.join(',')])

  // ── For You tab ───────────────────────────────────────────
  const fetchForYouFeed = useCallback(async () => {
    if (!profile) return

    const now        = Date.now()
    const myFields   = [...myFieldSet]
    const primaryField = myFields[0] ?? null
    const friendSet  = new Set(friendIds)
    const followingSet = new Set(followingIds)
    const socialIds  = [...new Set([...followingIds, ...friendIds])]
    const allFields  = Object.keys(PROFESSIONS)
    const otherFields = allFields.filter(f => !myFieldSet.has(f))
    const maturity   = getFeedMaturity(profile, myFields.length)
    const coldStart  = isNewUser(myFields.length, friendIds.length)
    const since24h   = new Date(now - 86_400_000).toISOString()
    const since7d    = new Date(now - 7 * 86_400_000).toISOString()

    try {
      // ── 1. Parallel data fetch ──────────────────────────

      const [
        proRes,        // Pro Posts from user's fields
        generalRes,    // General Posts from social graph (last 24h)
        trendingRes,   // Pro Posts from all fields for discover/trending fallback
        weeklyTopRes,  // Top Pro Post of week in primary field
        voteActivityRes, // Recent pro_upvotes for activity cards
        discoverCreatorsRes, // Creators not yet followed
      ] = await Promise.all([
        // Pro Posts from user's fields
        myFields.length > 0
          ? supabase.from('posts').select(POST_FIELDS)
              .eq('post_type', 'pro')
              .in('persona_discipline', myFields)
              .order('pro_upvote_count', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(maturity === 'active' ? 40 : maturity === 'developing' ? 30 : 20)
          : supabase.from('posts').select(POST_FIELDS)
              .eq('post_type', 'pro')
              .order('pro_upvote_count', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(30),

        // General Posts from social graph, last 24h
        socialIds.length > 0
          ? supabase.from('posts').select(POST_FIELDS)
              .eq('post_type', 'general')
              .in('user_id', socialIds.slice(0, 100))
              .gte('created_at', since24h)
              .order('created_at', { ascending: false })
              .limit(20)
          : supabase.from('posts').select(POST_FIELDS)
              .eq('post_type', 'general')
              .gte('created_at', since24h)
              .order('created_at', { ascending: false })
              .limit(15),

        // Trending Pro Posts from other fields (for discover + fallback)
        otherFields.length > 0
          ? supabase.from('posts').select(POST_FIELDS)
              .eq('post_type', 'pro')
              .in('persona_discipline', otherFields.slice(0, 15))
              .order('pro_upvote_count', { ascending: false })
              .order('created_at', { ascending: false })
              .limit(20)
          : Promise.resolve({ data: [] }),

        // Top Pro Post of the week in primary field
        primaryField
          ? supabase.from('posts').select(POST_FIELDS)
              .eq('post_type', 'pro')
              .eq('persona_discipline', primaryField)
              .gte('created_at', since7d)
              .order('pro_upvote_count', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),

        // Recent pro_upvotes for activity + rising creator cards
        supabase.from('pro_upvotes')
          .select('post_id, user_id, created_at')
          .order('created_at', { ascending: false })
          .limit(60),

        // Creators not yet followed, for Discover cards
        supabase.from('profiles')
          .select('id,username,full_name,bio,avatar_url,profession,role_title,is_pro,verification_count,follower_count')
          .not('id', 'in', `(${[profile.id, ...followingIds.slice(0, 50)].join(',')})`)
          .order('follower_count', { ascending: false })
          .limit(10),
      ])

      // ── 2. Enrich posts ─────────────────────────────────

      const [enrichedPro, enrichedGeneral, enrichedTrending, enrichedWeekly] =
        await Promise.all([
          enrichPosts((proRes.data || []) as any[]),
          enrichPosts((generalRes.data || []) as any[]),
          enrichPosts((trendingRes.data || []) as any[]),
          enrichPosts((weeklyTopRes.data || []) as any[]),
        ])

      // ── 3. Score and rank posts ──────────────────────────

      const scoredPro = enrichedPro
        .map(p => ({ post: p, score: scoreProPost(p, now) }))
        .sort((a, b) => b.score - a.score)
        .map(x => x.post)

      const scoredGeneral = enrichedGeneral
        .map(p => ({ post: p, score: scoreGeneralPost(p, now, friendSet, followingSet) }))
        .filter(x => x.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.post)

      const topWeeklyProPost = enrichedWeekly.length > 0
        ? enrichedWeekly.sort((a, b) => scoreProPost(b, now) - scoreProPost(a, now))[0]
        : null

      // ── 4. Build Pro Vote Activity cards ─────────────────

      const voteRows = (voteActivityRes.data || []) as Array<{ post_id: string; user_id: string; created_at: string }>
      let proVoteActivities: ProVoteActivityItem[] = []
      let risingCreators: RisingCreatorItem[] = []

      if (voteRows.length > 0) {
        const postIds  = [...new Set(voteRows.map(v => v.post_id))]
        const voterIds = [...new Set(voteRows.map(v => v.user_id))]

        const [votedPostsRes, voterProfilesRes, voterPersonasRes, creatorPostsRes] =
          await Promise.all([
            supabase.from('posts')
              .select('id,user_id,caption,persona_discipline,pro_upvote_count')
              .in('id', postIds.slice(0, 40)),
            supabase.from('profiles')
              .select('id,username,full_name,avatar_url,profession,role_title,is_pro,verification_count')
              .in('id', voterIds.slice(0, 40)),
            supabase.from('discipline_personas')
              .select('user_id,discipline,level')
              .in('user_id', voterIds.slice(0, 40)),
            // Needed to build creator profile map
            Promise.resolve({ data: [] as any[] }),
          ])

        const votedPostMap: Record<string, any> = {}
        ;(votedPostsRes.data || []).forEach((p: any) => { votedPostMap[p.id] = p })

        const voterProfileMap: Record<string, Profile> = {}
        ;(voterProfilesRes.data || []).forEach((p: any) => { voterProfileMap[p.id] = p })

        // Map: voter_id -> discipline -> level
        const personaMap: Record<string, Record<string, PersonaLevel>> = {}
        ;(voterPersonasRes.data || []).forEach((p: any) => {
          if (!personaMap[p.user_id]) personaMap[p.user_id] = {}
          personaMap[p.user_id][p.discipline] = p.level
        })

        // Get creator profiles for voted posts
        const creatorIds = [...new Set(
          (votedPostsRes.data || []).map((p: any) => p.user_id)
        )]
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

          // Pro Vote Activity card (deduplicate by creator+field)
          const cardKey = `${creator.id}:${votedPost.persona_discipline}`
          if (!seenVoteCards.has(cardKey) && proVoteActivities.length < 5) {
            seenVoteCards.add(cardKey)
            const postForCard: Post = {
              id: votedPost.id,
              user_id: votedPost.user_id,
              caption: votedPost.caption ?? '',
              post_type: 'pro',
              persona_discipline: votedPost.persona_discipline,
              profiles: creator,
              // minimal required fields
              content_type: 'text',
              poem_text: '', media_url: '', media_path: '',
              tags: [], like_count: 0, comment_count: 0, share_count: 0,
              pro_upvote_count: votedPost.pro_upvote_count ?? 0,
              is_pro_post: true, visibility: 'public',
              created_at: vote.created_at,
            }
            proVoteActivities.push({
              type: 'pro_vote_activity',
              voter, creator, post: postForCard,
              discipline: votedPost.persona_discipline,
              voterLevel,
            })
          }

          // Rising Creator: creator who got an authority vote but still emerging
          if (
            voterLevel === 'authority'
            && !seenRisingCreators.has(creator.id)
            && (votedPost.pro_upvote_count ?? 0) <= 5
            && creator.id !== profile.id
            && risingCreators.length < 5
          ) {
            seenRisingCreators.add(creator.id)
            risingCreators.push({
              type: 'rising_creator',
              creator,
              discipline: votedPost.persona_discipline,
              reason: (votedPost.pro_upvote_count ?? 0) <= 1 ? 'first_authority_vote' : 'trust_increase',
            })
          }
        }
      }

      // ── 5. Build Discover items ───────────────────────────

      const discoverItems: DiscoverItem[] = []

      // Field discover items — pick unexplored fields
      const shuffledOther = otherFields
        .filter(f => enrichedTrending.some(p => p.persona_discipline === f))
        .slice(0, 3)
      shuffledOther.forEach(f => discoverItems.push({ type: 'discover', discoverType: 'field', field: f }))

      // Creator discover items
      ;(discoverCreatorsRes.data || []).slice(0, 3).forEach((c: any) => {
        discoverItems.push({ type: 'discover', discoverType: 'creator', creator: c as Profile })
      })

      // ── 6. Blend trending posts into pro pool for new/developing users ──
      // Per feed maturity: New(30% pro), Developing(50%), Active(70%)
      let finalProPool = scoredPro
      if (maturity !== 'active' && enrichedTrending.length > 0) {
        const trendingScored = enrichedTrending
          .filter(p => !scoredPro.some(sp => sp.id === p.id))
          .map(p => ({ post: p, score: scoreProPost(p, now) }))
          .sort((a, b) => b.score - a.score)
          .map(x => x.post)
        finalProPool = [...scoredPro, ...trendingScored]
      }

      // ── 7. Assemble rhythmic feed ────────────────────────

      const rhythmicItems = buildRhythmicFeed({
        proPosts:         finalProPool,
        generalPosts:     scoredGeneral,
        risingCreators,
        proVoteActivities,
        discoverItems,
        topWeeklyProPost,
        coldStart,
        cycles: 3,
      })

      // ── 8. Mark interactions on all post items ────────────

      const allPosts = rhythmicItems
        .filter((i): i is { type: 'pro_post' | 'general_post'; post: Post } =>
          i.type === 'pro_post' || i.type === 'general_post')
        .map(i => i.post)

      const marked = await markInteractions(allPosts)
      const markedMap: Record<string, Post> = {}
      marked.forEach(p => { markedMap[p.id] = p })

      const finalItems: FeedItem[] = rhythmicItems.map(item => {
        if (item.type === 'pro_post' || item.type === 'general_post') {
          return { ...item, post: markedMap[item.post.id] ?? item.post }
        }
        return item
      })

      setFeedItems(finalItems)
    } catch (err: any) {
      toast.error('Failed to load feed')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [
    profile?.id,
    followingIds.join(','),
    friendIds.join(','),
    [...myFieldSet].sort().join(','),
  ])

  // ── Fetch orchestration ───────────────────────────────────
  const fetchPosts = useCallback(async () => {
    setLoading(true)
    if (tab === 'following') {
      await fetchFollowingFeed()
    } else {
      await fetchForYouFeed()
    }
  }, [tab, fetchFollowingFeed, fetchForYouFeed])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  // Real-time new posts
  useEffect(() => {
    const channel = supabase.channel('posts-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => fetchPosts())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchPosts])

  // Immediate own-post pin
  useEffect(() => {
    const handler = async () => {
      if (!profile) { fetchPosts(); return }
      const { data } = await supabase.from('posts').select(POST_FIELDS)
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1)
      if (!data?.length) { fetchPosts(); return }
      const { data: pData } = await supabase.from('profiles')
        .select('id,username,full_name,avatar_url,profession,role_title,is_pro,verification_count')
        .eq('id', profile.id)
      const newPost: Post = { ...data[0], profiles: (pData?.[0] as Profile) ?? undefined }
      const newItem: FeedItem = {
        type: newPost.post_type === 'pro' ? 'pro_post' : 'general_post',
        post: newPost,
      }
      setFeedItems(prev => {
        const without = prev.filter(i =>
          (i.type !== 'pro_post' && i.type !== 'general_post') ||
          (i as any).post.id !== newPost.id
        )
        return [newItem, ...without]
      })
    }
    window.addEventListener('oc:post-created', handler)
    return () => window.removeEventListener('oc:post-created', handler)
  }, [fetchPosts, profile?.id])

  // ── Quick text post ────────────────────────────────────────
  async function quickPost() {
    if (!profile || !composerText.trim()) return
    setPosting(true)
    const { error } = await supabase.from('posts').insert({
      user_id: profile.id,
      content_type: 'text',
      caption: composerText.trim(),
      post_type: 'general',
    })
    if (!error) {
      setComposerText('')
      toast.success('Posted! ✦')
      window.dispatchEvent(new CustomEvent('oc:post-created'))
    } else {
      toast.error(error.message)
    }
    setPosting(false)
  }

  // ── Render helpers ─────────────────────────────────────────
  function initials(name: string) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  const postCount    = feedItems.filter(i => i.type === 'pro_post' || i.type === 'general_post').length
  const hour         = new Date().getHours()
  const greeting     = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  const myFields     = [...myFieldSet]
  const maturity     = getFeedMaturity(profile, myFields.length)

  const tabs: { key: FeedTab; label: string }[] = [
    { key: 'all',       label: 'For you' },
    { key: 'following', label: 'Following' },
  ]

  return (
    <div className="max-w-[700px] mx-auto px-4 md:px-8 py-4 md:py-6">

      {/* ── Greeting ── */}
      <div className="mb-5">
        <h1 className="text-[22px] md:text-[28px] font-bold tracking-tight text-gray-900 dark:text-white leading-tight">
          Good {greeting}, {profile?.full_name?.split(' ')[0] || 'Creator'}
        </h1>
        <p className="text-[13.5px] md:text-[15px] text-gray-500 dark:text-gray-400 mt-1">
          Discover what's happening in your creative fields today.
        </p>
      </div>

      {/* ── Feed Header Strip ── */}
      {profile && tab === 'all' && (
        <FeedHeaderStrip
          profileId={profile.id}
          myFields={myFields}
          friendIds={friendIds}
          followingIds={followingIds}
        />
      )}

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
      <div className="apple-card px-4 md:px-6 py-4 md:py-5 mb-5">
        <div className="flex gap-3 md:gap-4">
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[12px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              : initials(profile?.full_name || '')}
          </div>
          <textarea
            className="flex-1 bg-transparent border-none outline-none text-[15px] md:text-[17px] text-gray-900 dark:text-white placeholder-gray-300 dark:placeholder-gray-600 resize-none min-h-[44px] leading-relaxed pt-1"
            placeholder="Share your latest project or thought..."
            value={composerText}
            onChange={e => setComposerText(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
          <div className="flex items-center gap-3 md:gap-5 text-gray-400">
            {[
              { icon: <Icon.Camera />,  label: 'Image' },
              { icon: <Icon.Video />,   label: 'Video' },
              { icon: <Icon.PenLine />, label: 'Text'  },
            ].map(({ icon, label }) => (
              <button
                key={label}
                onClick={onPost}
                className="flex items-center gap-1.5 text-[13px] md:text-[14px] hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <span className="flex w-[17px] h-[17px]">{icon}</span>
                <span className="hidden xs:inline sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={quickPost}
            disabled={posting || !composerText.trim()}
            className="px-5 md:px-7 py-2 bg-brand-600 hover:bg-brand-700 text-white text-[13px] md:text-[14px] font-semibold rounded-full transition-colors disabled:opacity-40 shrink-0"
          >
            {posting
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : 'Post'}
          </button>
        </div>
      </div>

      {/* ── Feed maturity context badge (subtle) ── */}
      {tab === 'all' && !loading && postCount > 0 && maturity === 'new' && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
          <span className="flex w-3.5 h-3.5 text-amber-500"><Icon.Info /></span>
          <p className="text-[12.5px] text-amber-700 dark:text-amber-300">
            Follow more Fields and Creators to unlock a personalised feed.
          </p>
          <button onClick={() => navigate('/explore')} className="ml-auto text-[12px] font-semibold text-amber-700 dark:text-amber-300 hover:underline shrink-0">
            Explore →
          </button>
        </div>
      )}

      {/* ── Feed items ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : postCount === 0 && feedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <span className="flex w-10 h-10 mb-3 text-gray-300 dark:text-gray-600"><Icon.Feed /></span>
          <p className="font-semibold text-gray-600 dark:text-gray-400">
            {tab === 'following' ? 'Follow some creators to see their posts here' : 'Be the first to post'}
          </p>
          <button
            onClick={onPost}
            className="mt-4 px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-full hover:bg-brand-700 transition-colors"
          >
            Create a post
          </button>
        </div>
      ) : (
        feedItems.map((item, idx) => {
          if (item.type === 'pro_post' || item.type === 'general_post') {
            return <PostCard key={item.post.id} post={item.post} onUpdated={fetchPosts} />
          }
          if (item.type === 'rising_creator') {
            return (
              <RisingCreatorCard
                key={`rising-${item.creator.id}-${idx}`}
                item={item}
                onFollow={handleFollow}
                followingIds={localFollowingSet}
              />
            )
          }
          if (item.type === 'pro_vote_activity') {
            return (
              <ProVoteActivityCard
                key={`pva-${item.voter.id}-${item.post.id}-${idx}`}
                item={item}
              />
            )
          }
          if (item.type === 'discover') {
            return (
              <DiscoverCard
                key={`discover-${item.discoverType}-${item.field ?? item.creator?.id ?? idx}`}
                item={item}
                onFollow={handleFollow}
                followingIds={localFollowingSet}
              />
            )
          }
          return null
        })
      )}
    </div>
  )
}
