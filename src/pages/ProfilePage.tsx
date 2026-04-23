import toast from 'react-hot-toast'
import { useEffect, useState, useRef, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { uploadPhoto } from '@/utils/uploadPhoto'
import { useLazyLoad } from '@/hooks/useLazyLoad'
import {
  supabase, Profile, Post, PostFeature, getProfMeta, DisciplinePersona, TRUST_WEIGHTS, FriendStatus,
} from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import PostCard from '@/components/PostCard'
import UploadModal from '@/components/UploadModal'
import CommunityPickerModal from '@/components/CommunityPickerModal'
import { Icon } from '@/lib/icons'
import {
  getFriendStatus, sendFriendRequest,
  acceptFriendRequest, declineFriendRequest, unfriend,
} from '@/lib/friends'
import BottomSheet, { SheetRow, SheetCancel } from '@/components/BottomSheet'
import ConfirmSheet from '@/components/ConfirmSheet'
import ReportSheet from '@/components/ReportSheet'

// ── Discipline display map ───────────────────────────────────────────────────
const DISCIPLINE_MAP: Record<string, { label: string; IconComp: () => JSX.Element }> = {
  'photographer':  { label: 'Photography',        IconComp: Icon.Camera },
  'singer':        { label: 'Vocals & Singing',   IconComp: Icon.Mic },
  'musician':      { label: 'Music',              IconComp: Icon.Music },
  'poet':          { label: 'Poetry & Writing',   IconComp: Icon.PenLine },
  'visual-artist': { label: 'Visual Arts',        IconComp: Icon.Paintbrush },
  'filmmaker':     { label: 'Film & Video',       IconComp: Icon.Film },
  'dancer':        { label: 'Dance',              IconComp: Icon.Music },
  'comedian':      { label: 'Performance',        IconComp: Icon.Drama },
  'culinary':      { label: 'Culinary Arts',      IconComp: Icon.Utensils },
  'fitness':       { label: 'Fitness & Sports',   IconComp: Icon.Activity },
  'technology':    { label: 'Technology',         IconComp: Icon.Code },
  'fashion':       { label: 'Fashion & Style',    IconComp: Icon.Scissors },
  'architecture':  { label: 'Architecture',       IconComp: Icon.Building },
  'medicine':      { label: 'Medicine & Health',  IconComp: Icon.Heart2 },
  'education':     { label: 'Education',          IconComp: Icon.PenLine },
  'law':           { label: 'Law & Justice',      IconComp: Icon.Shield },
  'science':       { label: 'Science & Research', IconComp: Icon.Microscope },
  'business':      { label: 'Business',           IconComp: Icon.Briefcase },
  'wellness':      { label: 'Wellness & Mind',    IconComp: Icon.Heart2 },
}

// ── Tier display ─────────────────────────────────────────────────────────────
type TierKey = 'newcomer' | 'contributor' | 'expert' | 'authority'
const TIER_DISPLAY: Record<TierKey, { label: string; className: string }> = {
  newcomer:    { label: 'General',   className: 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400' },
  contributor: { label: 'General',   className: 'text-gray-500 bg-gray-100 dark:bg-gray-800 dark:text-gray-400' },
  expert:      { label: 'Expert',    className: 'text-burgundy-600 bg-burgundy-50 dark:bg-burgundy-950/40 dark:text-burgundy-400' },
  authority:   { label: 'Authority', className: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-400' },
}

const MAX_PINS = 3
const BIO_LIMIT = 160

// ── Main Component ───────────────────────────────────────────────────────────
export default function ProfilePage() {
  const { username } = useParams()
  const navigate = useNavigate()
  const routerLocation = useLocation()
  const { profile: myProfile, refreshProfile } = useAuth()

  // Core data
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [personas, setPersonas] = useState<DisciplinePersona[]>([])

  // UI state
  const [activeTab, setActiveTab] = useState<'personal' | 'portfolio' | 'featured'>('portfolio')
  const [featuredIn, setFeaturedIn] = useState<PostFeature[]>([])
  const [gridView, setGridView] = useState(true)
  const [bioExpanded, setBioExpanded] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [avatarLightbox, setAvatarLightbox] = useState(false)
  const [postLightbox, setPostLightbox] = useState<Post | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Pin state — stored as ordered list by pin_order
  const [pinnedPins, setPinnedPins]   = useState<{ post_id: string; pin_order: number }[]>([])
  const [pinnedPostIds, setPinnedPostIds] = useState<Set<string>>(new Set())
  const [pinning, setPinning]         = useState<string | null>(null)

  // Portfolio: post_id → communities (groups) it belongs to
  const [postSubgroupMap, setPostSubgroupMap] = useState<Record<string, Array<{ id: string; name: string; slug: string; discipline: string }>>>({})
  // Featured In: pending tag requests (own profile only)
  const [pendingFeatures, setPendingFeatures] = useState<PostFeature[]>([])
  // Portfolio: which field pill is active (from header or tab filter)
  const [portfolioFieldFilter, setPortfolioFieldFilter] = useState<string | null>(null)

  // Upload modal context
  const [uploadDefaultDiscipline, setUploadDefaultDiscipline] = useState<string | null>(null)
  const [uploadProLocked, setUploadProLocked] = useState(false)

  // Add field flow
  const [showAddFieldPicker, setShowAddFieldPicker] = useState(false)
  const [addFieldTarget, setAddFieldTarget] = useState<string | null>(null)

  // Social state (visitor only)
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none')
  const [isFollowing, setIsFollowing] = useState(false)
  const [socialLoading, setSocialLoading] = useState(true)
  const [socialActing, setSocialActing] = useState(false)

  // Endorsement state
  const [myPersonas, setMyPersonas] = useState<DisciplinePersona[]>([])
  const [endorsedFields, setEndorsedFields] = useState<Set<string>>(new Set())
  const [endorseCounts, setEndorseCounts] = useState<Record<string, number>>({})
  const [endorsing, setEndorsing] = useState<string | null>(null)
  const [endorseConfirmField, setEndorseConfirmField] = useState<string | null>(null)

  // Profile 3-dot menu + block/report state
  const [showProfile3Dot, setShowProfile3Dot] = useState(false)
  const [showBlockConfirm, setShowBlockConfirm] = useState(false)
  const [showProfileReport, setShowProfileReport] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [showFriendSheet, setShowFriendSheet] = useState(false)
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false)

  // List modal (friends / followers)
  const [listModal, setListModal] = useState<'friends' | 'followers' | null>(null)
  const [listUsers, setListUsers] = useState<Profile[]>([])
  const [listLoading, setListLoading] = useState(false)

  // Feed view selected post
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)

  // Peer verification (keep existing)
  const [hasVerified, setHasVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)

  const isOwnProfile = !username || profile?.id === myProfile?.id
  const isFriend = friendStatus === 'friends'

  // Always land on portfolio tab
  useEffect(() => {
    setActiveTab('portfolio')
  }, [isOwnProfile])

  // ── Computed: Personal tab — non-pro posts, pinned first ──
  const personalPosts = useMemo(() => {
    const nonPro = posts.filter(p => !p.is_pro_post && p.post_type !== 'pro')
    const pinnedSorted = [...pinnedPins].sort((a, b) => a.pin_order - b.pin_order)
    const pinnedOrdered = pinnedSorted.map(pp => nonPro.find(p => p.id === pp.post_id)).filter(Boolean) as Post[]
    const remaining = nonPro.filter(p => !pinnedPostIds.has(p.id))
    return [...pinnedOrdered, ...remaining]
  }, [posts, pinnedPins, pinnedPostIds])

  // ── Derived: unique disciplines present in the user's portfolio ──
  const portfolioFieldKeys = useMemo(() =>
    [...new Set(
      posts
        .filter(p => p.is_pro_post || p.post_type === 'pro')
        .map(p => p.persona_discipline)
        .filter(Boolean) as string[]
    )],
  [posts])

  const canEndorse = false // endorsements remain available per-discipline via portfolio groups

  // ── Data loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true)

      let profileData: Profile | null = null
      if (username) {
        const { data } = await supabase.from('profiles').select('*').eq('username', username).single()
        profileData = data as Profile
      } else {
        profileData = myProfile
      }
      setProfile(profileData)
      if (!profileData) { setLoading(false); return }

      const isOwn = !username || profileData.id === myProfile?.id

      // Personas
      const { data: personaData } = await supabase
        .from('discipline_personas').select('*').eq('user_id', profileData.id).order('created_at')
      setPersonas((personaData || []) as DisciplinePersona[])

      // Posts
      let postsQuery = supabase
        .from('posts')
        .select('id, user_id, content_type, caption, poem_text, media_url, media_path, tags, like_count, comment_count, share_count, pro_upvote_count, is_pro_post, post_type, persona_discipline, visibility, group_id, group:group_id(id,name,slug), created_at')
        .eq('user_id', profileData.id)
        .order('created_at', { ascending: false })
      if (!isOwn) postsQuery = postsQuery.eq('visibility', 'public')

      const { data: postsData } = await postsQuery
      let enriched = (postsData || []).map((p: any) => ({ ...p, profiles: profileData })) as Post[]

      if (myProfile && enriched.length > 0) {
        const postIds = enriched.map(p => p.id)
        const [likesRes, upvotesRes] = await Promise.all([
          supabase.from('likes').select('post_id').eq('user_id', myProfile.id).in('post_id', postIds),
          supabase.from('pro_upvotes').select('post_id').eq('user_id', myProfile.id).in('post_id', postIds),
        ])
        const likedSet = new Set((likesRes.data || []).map((r: any) => r.post_id as string))
        const upvotedSet = new Set((upvotesRes.data || []).map((r: any) => r.post_id as string))
        enriched = enriched.map(p => ({ ...p, user_liked: likedSet.has(p.id), user_pro_upvoted: upvotedSet.has(p.id) }))
      }
      setPosts(enriched)

      // Pinned posts (new pinned_posts table with pin_order)
      const { data: pinData } = await supabase
        .from('pinned_posts')
        .select('post_id, pin_order')
        .eq('user_id', profileData.id)
        .order('pin_order', { ascending: true })
      const pins = (pinData || []) as { post_id: string; pin_order: number }[]
      setPinnedPins(pins)
      setPinnedPostIds(new Set(pins.map(r => r.post_id)))

      // Portfolio: load community (group) associations for all pro posts
      const proPostIds = enriched.filter(p => p.is_pro_post || p.post_type === 'pro').map(p => p.id)
      if (proPostIds.length > 0) {
        const { data: sgData } = await supabase
          .from('post_subgroups')
          .select(`post_id, groups:subgroup_id(id, name, slug, discipline)`)
          .in('post_id', proPostIds)
        const sgMap: Record<string, Array<{ id: string; name: string; slug: string; discipline: string }>> = {}
        ;(sgData || []).forEach((r: any) => {
          if (!r.groups) return
          if (!sgMap[r.post_id]) sgMap[r.post_id] = []
          sgMap[r.post_id].push(r.groups as { id: string; name: string; slug: string; discipline: string })
        })
        setPostSubgroupMap(sgMap)
      }

      // Featured In: posts where this profile is tagged as a featured creator (accepted)
      const { data: featuredData } = await supabase
        .from('post_features')
        .select(`
          post_id, featured_user_id, status, created_at,
          post:post_id(
            id, user_id, content_type, caption, poem_text, media_url, thumb_url, display_url,
            tags, like_count, comment_count, share_count, pro_upvote_count, is_pro_post, is_pro,
            post_type, persona_discipline, visibility, group_id, created_at,
            profiles!user_id(id, username, full_name, avatar_url, role_title, is_pro, verification_count)
          )
        `)
        .eq('featured_user_id', profileData.id)
        .eq('status', 'accepted')
        .order('created_at', { ascending: false })
      setFeaturedIn((featuredData || []) as unknown as PostFeature[])

      // Pending feature tag requests (own profile only — not expired >7 days)
      if (isOwn) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString()
        const { data: pendingData } = await supabase
          .from('post_features')
          .select(`
            post_id, featured_user_id, status, created_at,
            post:post_id(
              id, user_id, content_type, caption, poem_text, media_url, thumb_url, display_url,
              tags, like_count, comment_count, share_count, pro_upvote_count, is_pro_post, is_pro,
              post_type, persona_discipline, visibility, group_id, created_at,
              profiles!user_id(id, username, full_name, avatar_url, role_title, is_pro, verification_count)
            )
          `)
          .eq('featured_user_id', profileData.id)
          .eq('status', 'pending')
          .gte('created_at', sevenDaysAgo)
          .order('created_at', { ascending: false })
        setPendingFeatures((pendingData || []) as unknown as PostFeature[])
      }

      // Endorsement counts per discipline
      const { data: endorseData } = await supabase
        .from('endorsements').select('discipline').eq('endorsed_id', profileData.id)
      const counts: Record<string, number> = {}
      ;(endorseData || []).forEach((r: any) => {
        counts[r.discipline] = (counts[r.discipline] || 0) + 1
      })
      setEndorseCounts(counts)

      setLoading(false)

      if (routerLocation.hash) {
        setGridView(false)
        const anchor = routerLocation.hash.slice(1)
        setTimeout(() => {
          const el = document.getElementById(anchor)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 250)
      }
    }
    load()
  }, [username, myProfile?.id, routerLocation.hash])

  // Social status (visitor only)
  useEffect(() => {
    if (!myProfile || !profile || isOwnProfile) { setSocialLoading(false); return }
    setSocialLoading(true)
    Promise.all([
      supabase.from('follows').select('follower_id')
        .eq('follower_id', myProfile.id).eq('following_id', profile.id).maybeSingle(),
      getFriendStatus(myProfile.id, profile.id),
    ]).then(([followRes, fStatus]) => {
      setIsFollowing(!!followRes.data)
      setFriendStatus(fStatus)
      setSocialLoading(false)
    })
  }, [myProfile?.id, profile?.id, isOwnProfile])

  // My personas (for endorse eligibility check)
  useEffect(() => {
    if (!myProfile || isOwnProfile) return
    supabase.from('discipline_personas').select('*').eq('user_id', myProfile.id)
      .then(({ data }) => setMyPersonas((data || []) as DisciplinePersona[]))
  }, [myProfile?.id, isOwnProfile])

  // Fields I've already endorsed this profile in
  useEffect(() => {
    if (!myProfile || !profile || isOwnProfile) return
    supabase.from('endorsements').select('discipline')
      .eq('endorser_id', myProfile.id).eq('endorsed_id', profile.id)
      .then(({ data }) => setEndorsedFields(new Set((data || []).map((r: any) => r.discipline as string))))
  }, [myProfile?.id, profile?.id, isOwnProfile])

  // Peer verification
  useEffect(() => {
    if (!myProfile || !profile || isOwnProfile) return
    supabase.from('peer_verifications')
      .select('id').eq('verifier_id', myProfile.id).eq('verified_id', profile.id).single()
      .then(({ data }) => setHasVerified(!!data))
  }, [myProfile?.id, profile?.id])

  // Scroll to post from hash
  useEffect(() => {
    if (!loading && posts.length > 0 && window.location.hash.startsWith('#post-')) {
      const postId = window.location.hash.replace('#post-', '')
      const post = posts.find(p => p.id === postId)
      if (post) {
        setGridView(false)
        setTimeout(() => {
          const el = document.getElementById('post-' + postId)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 200)
      }
    }
  }, [loading, posts])

  // ── Helpers ───────────────────────────────────────────────────────────────
  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  function isGeneralPostLive(post: Post): boolean {
    if (post.post_type !== 'general') return false
    return Date.now() - new Date(post.created_at).getTime() < 24 * 60 * 60 * 1000
  }

  // ── Action handlers ───────────────────────────────────────────────────────

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !myProfile) return
    setUploadingAvatar(true)
    const fileName = myProfile.id + '/avatar'
    const { thumbUrl } = await uploadPhoto(file, 'avatars', fileName)
    const avatarUrl = thumbUrl + '?t=' + Date.now()
    await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', myProfile.id)
    await refreshProfile()
    setProfile(p => p ? { ...p, avatar_url: avatarUrl } : p)
    toast.success('Photo updated!')
    setUploadingAvatar(false)
  }

  async function handleToggleFollow() {
    if (!myProfile || !profile) return
    setSocialActing(true)
    if (isFollowing) {
      await supabase.from('follows').delete().match({ follower_id: myProfile.id, following_id: profile.id })
      setIsFollowing(false)
      toast(`Unfollowed ${profile.full_name}`)
    } else {
      await supabase.from('follows').insert({ follower_id: myProfile.id, following_id: profile.id })
      await supabase.from('notifications').insert({ user_id: profile.id, actor_id: myProfile.id, type: 'follow' })
      setIsFollowing(true)
      toast.success(`Following ${profile.full_name}`)
    }
    setSocialActing(false)
  }

  async function handleSendFriendRequest() {
    if (!myProfile || !profile) return
    setSocialActing(true)
    try {
      await sendFriendRequest(myProfile.id, profile.id, profile.full_name)
      setFriendStatus('pending_sent')
      toast.success(`Friend request sent to ${profile.full_name}`)
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    }
    setSocialActing(false)
  }

  async function handleCancelFriendRequest() {
    if (!myProfile || !profile) return
    setSocialActing(true)
    await declineFriendRequest(myProfile.id, profile.id)
    setFriendStatus('none')
    toast('Friend request cancelled')
    setSocialActing(false)
  }

  async function handleAcceptFriend() {
    if (!myProfile || !profile) return
    setSocialActing(true)
    await acceptFriendRequest(myProfile.id, profile.id)
    setFriendStatus('friends')
    toast.success(`You and ${profile.full_name} are now friends!`)
    setSocialActing(false)
  }

  async function handleDeclineFriendHeader() {
    if (!myProfile || !profile) return
    setSocialActing(true)
    await declineFriendRequest(myProfile.id, profile.id)
    setFriendStatus('none')
    setSocialActing(false)
  }

  async function handleRemoveFriend() {
    if (!myProfile || !profile) return
    setSocialActing(true)
    await unfriend(myProfile.id, profile.id)
    setFriendStatus('none')
    setShowFriendSheet(false)
    toast.success(`You unfollowed @${profile.username}`)
    setSocialActing(false)
  }

  async function handleBlockUser() {
    if (!myProfile || !profile) return
    setBlocking(true)
    try {
      await supabase.from('blocks').insert({ blocker_id: myProfile.id, blocked_id: profile.id })
      toast.success(`@${profile.username} is now blocked`)
      setShowBlockConfirm(false)
    } catch {
      toast.error('Failed to block user')
    } finally {
      setBlocking(false)
    }
  }

  async function handleAcceptFeature(postId: string) {
    if (!profile) return
    await supabase.from('post_features')
      .update({ status: 'accepted' })
      .match({ post_id: postId, featured_user_id: profile.id })
    const accepted = pendingFeatures.find(f => f.post_id === postId)
    setPendingFeatures(prev => prev.filter(f => f.post_id !== postId))
    if (accepted) setFeaturedIn(prev => [{ ...accepted, status: 'accepted' }, ...prev])
    toast.success('Feature accepted — it now appears in your Featured In tab.')
  }

  async function handleDeclineFeature(postId: string) {
    if (!profile) return
    await supabase.from('post_features')
      .update({ status: 'declined' })
      .match({ post_id: postId, featured_user_id: profile.id })
    setPendingFeatures(prev => prev.filter(f => f.post_id !== postId))
    toast('Feature declined.')
  }

  async function handleRemoveFeature(postId: string) {
    if (!profile) return
    await supabase.from('post_features')
      .update({ status: 'declined' })
      .match({ post_id: postId, featured_user_id: profile.id })
    setFeaturedIn(prev => prev.filter(f => f.post_id !== postId))
    toast('Feature removed from your tab.')
  }

  function copyProfileLink() {
    navigator.clipboard.writeText(`${window.location.origin}/profile/${profile?.username}`)
    toast.success('Profile link copied!')
    setShowProfile3Dot(false)
  }

  async function handlePin(postId: string) {
    if (!myProfile) return
    if (pinnedPostIds.size >= MAX_PINS) {
      toast.error('Unpin an existing post first — you can only pin 3 posts.')
      return
    }
    // Assign next pin_order (1, 2, or 3)
    const usedOrders = new Set(pinnedPins.map(p => p.pin_order))
    const nextOrder = ([1, 2, 3] as const).find(n => !usedOrders.has(n)) ?? 1
    setPinning(postId)
    const { error } = await supabase.from('pinned_posts').insert({
      user_id: myProfile.id, post_id: postId, pin_order: nextOrder,
    })
    if (error) { toast.error('Could not pin post'); setPinning(null); return }
    setPinnedPins(prev => [...prev, { post_id: postId, pin_order: nextOrder }])
    setPinnedPostIds(prev => new Set([...prev, postId]))
    toast.success('Pinned to your Posts tab')
    setPinning(null)
  }

  async function handleUnpin(postId: string) {
    if (!myProfile) return
    setPinning(postId)
    const { error } = await supabase.from('pinned_posts').delete().match({ user_id: myProfile.id, post_id: postId })
    if (error) { toast.error('Could not unpin post'); setPinning(null); return }
    setPinnedPins(prev => prev.filter(p => p.post_id !== postId))
    setPinnedPostIds(prev => { const s = new Set(prev); s.delete(postId); return s })
    toast('Unpinned')
    setPinning(null)
  }

  async function handleEndorse(discipline: string) {
    if (!myProfile || !profile) return
    setEndorsing(discipline)
    const { error } = await supabase.from('endorsements').insert({
      endorser_id: myProfile.id,
      endorsed_id: profile.id,
      discipline,
    })
    if (error) { toast.error(error.message); setEndorsing(null); return }
    setEndorsedFields(prev => new Set([...prev, discipline]))
    setEndorseCounts(prev => ({ ...prev, [discipline]: (prev[discipline] || 0) + 1 }))
    toast.success(`Endorsed in ${DISCIPLINE_MAP[discipline]?.label ?? discipline}!`)
    setEndorsing(null)
  }

  async function toggleVerify() {
    if (!myProfile || !profile) return
    setVerifying(true)
    if (hasVerified) {
      await supabase.from('peer_verifications').delete().match({ verifier_id: myProfile.id, verified_id: profile.id })
      setHasVerified(false)
      setProfile(p => p ? { ...p, verification_count: Math.max(0, (p.verification_count || 0) - 1) } : p)
      toast('Verification removed')
    } else {
      const { error } = await supabase.from('peer_verifications').insert({
        verifier_id: myProfile.id, verified_id: profile.id,
      })
      if (error) { toast.error(error.message); setVerifying(false); return }
      await supabase.from('notifications').insert({
        user_id: profile.id, actor_id: myProfile.id, type: 'peer_verify', post_id: null,
      })
      setHasVerified(true)
      setProfile(p => p ? { ...p, verification_count: (p.verification_count || 0) + 1 } : p)
      toast.success('Peer verified!')
    }
    setVerifying(false)
  }

  // List modal
  async function openListModal(type: 'friends' | 'followers') {
    if (!profile) return
    setListModal(type)
    setListUsers([])
    setListLoading(true)

    if (type === 'friends') {
      const { data } = await supabase
        .from('friend_requests')
        .select('sender_id, receiver_id')
        .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
        .eq('status', 'accepted')
      const friendIds = (data || []).map((r: any) =>
        r.sender_id === profile.id ? r.receiver_id : r.sender_id)
      if (friendIds.length > 0) {
        const { data: users } = await supabase
          .from('profiles').select('id, username, full_name, avatar_url, profession')
          .in('id', friendIds).limit(50)
        setListUsers((users || []) as Profile[])
      }
    } else {
      const { data } = await supabase
        .from('follows')
        .select('profiles:follower_id(id, username, full_name, avatar_url, profession)')
        .eq('following_id', profile.id).limit(50)
      setListUsers(((data || []).map((r: any) => r.profiles)).filter(Boolean) as Profile[])
    }
    setListLoading(false)
  }

  // ── Context-aware button logic ────────────────────────────────────────────
  function getContextButton() {
    if (friendStatus === 'friends') {
      return {
        label: 'Message',
        onClick: () => navigate('/messages?with=' + profile!.id),
        className: 'px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-full hover:bg-brand-700 transition-colors',
      }
    }
    if (friendStatus === 'pending_received') {
      return {
        label: 'Accept Request',
        onClick: handleAcceptFriend,
        className: 'px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-full hover:bg-brand-700 transition-colors',
      }
    }
    if (friendStatus === 'pending_sent') {
      return {
        label: 'Requested',
        onClick: handleCancelFriendRequest,
        className: 'px-5 py-2 text-sm font-semibold rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
      }
    }
    if (isFollowing) {
      return {
        label: 'Following',
        onClick: handleToggleFollow,
        className: 'px-5 py-2 text-sm font-semibold rounded-full border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors',
      }
    }
    return {
      label: 'Friend Request',
      onClick: handleSendFriendRequest,
      className: 'px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-full hover:bg-brand-700 transition-colors',
    }
  }

  // ── Field tab stats ───────────────────────────────────────────────────────
  function getFieldStats(discipline: string) {
    const persona = personas.find(p => p.discipline === discipline)
    const totalProVotes = posts
      .filter(p => p.persona_discipline === discipline && p.is_pro_post)
      .reduce((sum, p) => sum + p.pro_upvote_count, 0)
    const totalEndorsements = endorseCounts[discipline] ?? 0
    const tierInfo = TIER_DISPLAY[(persona?.level as TierKey) ?? 'newcomer']
    return { totalProVotes, totalEndorsements, tierInfo, persona }
  }

  // ── Post Tile (1:1 square gallery cell) ──────────────────────────────────
  function PostTile({
    post,
    isPinned = false,
    showProIndicator = false,
    overlayLabel,
  }: {
    post: Post
    isPinned?: boolean
    showProIndicator?: boolean
    overlayLabel?: string
  }) {
    const [hovered, setHovered] = useState(false)
    const { ref: tileRef, isVisible: tileVisible } = useLazyLoad<HTMLDivElement>()
    const thumbSrc = useMemo(() => post.thumb_url || post.media_url || '', [post.thumb_url, post.media_url])

    return (
      <div className="flex flex-col">
        <div
          ref={tileRef}
          className="relative aspect-square overflow-hidden cursor-pointer"
          style={{ background: 'var(--surface-off)' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={() => setPostLightbox(post)}
        >
          {/* Media */}
          {post.content_type === 'photo' && post.media_url && tileVisible ? (
            <img src={thumbSrc} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : post.content_type === 'video' && post.media_url ? (
            <>
              <video src={post.media_url} className="w-full h-full object-cover" muted />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center">
                  <span className="flex w-4 h-4 text-white"><Icon.Video /></span>
                </div>
              </div>
            </>
          ) : post.content_type === 'audio' ? (
            <div className="w-full h-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center">
              <span className="flex w-8 h-8 text-white/80"><Icon.Music /></span>
            </div>
          ) : post.content_type === 'poem' ? (
            <div className="w-full h-full bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-950/50 dark:to-orange-950/50 flex flex-col items-center justify-center p-3">
              <span className="text-3xl text-amber-400/50 leading-none mb-1">"</span>
              {post.poem_text && (
                <p className="text-[10px] text-gray-500 text-center italic line-clamp-3">{post.poem_text}</p>
              )}
            </div>
          ) : post.content_type === 'document' ? (
            <div className="w-full h-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
              <span className="flex w-8 h-8 text-gray-300 dark:text-gray-600"><Icon.FileText /></span>
            </div>
          ) : (
            <div className="w-full h-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
              <span className="flex w-7 h-7 text-gray-300 dark:text-gray-600"><Icon.MessageCircle /></span>
            </div>
          )}

          {/* Field/community overlay pill — top-left */}
          {overlayLabel && (
            <div className="absolute top-2 left-2 z-10 pointer-events-none">
              <span style={{ display: 'inline-block', background: 'rgba(0,0,0,0.52)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '3px 7px', borderRadius: 'var(--radius-full)' }}>
                {overlayLabel}
              </span>
            </div>
          )}

          {/* Pin indicator — only when no overlay, or bottom-left */}
          {isPinned && (
            <div className="absolute top-1.5 right-8 text-[13px] drop-shadow-md select-none">📌</div>
          )}

          {/* Pro indicator — top-right, owner only */}
          {showProIndicator && (
            <div className="absolute top-1.5 right-1.5 text-[13px] drop-shadow-md select-none">⚡</div>
          )}

          {/* Hover / tap overlay */}
          <div
            className={`absolute inset-0 flex items-center justify-center gap-4 transition-opacity duration-150 ${hovered ? 'opacity-100' : 'opacity-0'}`}
            style={{ background: 'rgba(0,0,0,0.50)' }}
          >
            <span className="flex items-center gap-1 text-white text-[13px] font-semibold">
              <span>♡</span>
              {post.like_count}
            </span>
            <span className="flex items-center gap-1 text-white text-[13px] font-semibold">
              <span>💬</span>
              {post.comment_count}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ── Loading / not found ───────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--divider)', borderTopColor: 'var(--brand)' }} />
    </div>
  )

  if (!profile) return (
    <div className="flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-faint)' }}>
      <span className="flex w-12 h-12 mb-3"><Icon.Profile /></span>
      <p className="font-semibold" style={{ color: 'var(--text-muted)' }}>Creator not found</p>
    </div>
  )

  const isPrivate = !isOwnProfile && profile.personal_profile_public === false
  const profileLocation = (profile as any).location as string | undefined
  const bioTruncated = profile.bio && profile.bio.length > BIO_LIMIT && !bioExpanded
    ? profile.bio.slice(0, BIO_LIMIT).trimEnd()
    : profile.bio

  const ctxBtn = getContextButton()

  // Current field stats (when on a field tab)
  const currentFieldStats = null
  const currentPersona = null

  return (
    <div className="min-h-full">

      {/* ── PROFILE HERO ── */}
      <section style={{ background: 'var(--surface)', padding: 'var(--space-6) var(--space-5) var(--space-4)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>

        {/* Avatar */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <div style={{ position: 'relative', width: 96, height: 96 }}>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            <button
              onClick={() => { if (isOwnProfile) avatarInputRef.current?.click(); else if (profile.avatar_url) setAvatarLightbox(true) }}
              style={{ width: 96, height: 96, borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '3px solid var(--surface)', boxShadow: 'var(--shadow-md)', background: 'var(--surface-off)', display: 'block' }}
            >
              {uploadingAvatar ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div className="spinner" />
                </div>
              ) : profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: 'var(--brand)' }}>
                  {initials(profile.full_name)}
                </div>
              )}
            </button>
            {isOwnProfile && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                style={{ position: 'absolute', bottom: 3, right: 3, width: 28, height: 28, background: 'var(--brand)', color: '#fff', borderRadius: 'var(--radius-full)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(78,11,22,0.35)', border: '2px solid var(--surface)' }}
                aria-label="Change profile photo"
              >
                <span className="flex w-3.5 h-3.5"><Icon.Camera /></span>
              </button>
            )}
          </div>
        </div>

        {/* Name */}
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 2, color: 'var(--text-primary)' }}>
          {profile.full_name}
        </div>

        {/* Title / Workplace */}
        {(profile.role_title || (profile as any).workplace) && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 'var(--space-2)' }}>
            {profile.role_title}{profile.role_title && (profile as any).workplace && ' at '}{(profile as any).workplace}
          </div>
        )}

        {/* Bio */}
        {profile.bio && (
          <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 'var(--space-2)', maxWidth: 280 }}>
            {bioTruncated}
            {profile.bio.length > BIO_LIMIT && !bioExpanded && (
              <>{' '}<button onClick={() => setBioExpanded(true)} style={{ color: 'var(--brand)', fontWeight: 600 }}>more</button></>
            )}
          </div>
        )}

        {/* Location */}
        {profileLocation && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-faint)', marginBottom: 'var(--space-4)' }}>
            <span className="flex w-3.5 h-3.5 shrink-0"><Icon.MapPin /></span>
            {profileLocation}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-8)', marginBottom: 'var(--space-4)' }}>
          <button onClick={() => openListModal('friends')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{Number(profile.friend_count ?? 0).toLocaleString()}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Friends</span>
          </button>
          <button onClick={() => openListModal('followers')} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{Number(profile.follower_count ?? 0).toLocaleString()}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Followers</span>
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{posts.length}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>Posts</span>
          </div>
        </div>

        {/* Edit / social action buttons */}
        {isOwnProfile ? (
          <button
            onClick={() => setShowEditModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', background: 'transparent', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(78,11,22,0.25)'; (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            Edit Profile
          </button>
        ) : socialLoading ? (
          <div style={{ width: 120, height: 36, borderRadius: 'var(--radius-full)', background: 'var(--surface-off)' }} className="animate-pulse" />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
            {friendStatus === 'none' && !isFollowing && (
              <>
                <button onClick={handleSendFriendRequest} disabled={socialActing} style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 700, borderRadius: 'var(--radius-full)', background: 'var(--brand)', color: '#fff', opacity: socialActing ? 0.5 : 1 }}>
                  Add Friend
                </button>
                <button onClick={handleToggleFollow} disabled={socialActing} style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 700, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', opacity: socialActing ? 0.5 : 1 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  Follow
                </button>
              </>
            )}
            {friendStatus === 'pending_sent' && (
              <button onClick={handleCancelFriendRequest} disabled={socialActing} style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 700, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', opacity: socialActing ? 0.5 : 1 }}>
                Request Sent
              </button>
            )}
            {friendStatus === 'pending_received' && (
              <>
                <button onClick={handleAcceptFriend} disabled={socialActing} style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 700, borderRadius: 'var(--radius-full)', background: 'var(--brand)', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: socialActing ? 0.5 : 1 }}>
                  <span className="flex w-4 h-4"><Icon.Check /></span> Accept
                </button>
                <button onClick={handleDeclineFriendHeader} disabled={socialActing} style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 700, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: socialActing ? 0.5 : 1 }}>
                  <span className="flex w-4 h-4"><Icon.X /></span> Decline
                </button>
              </>
            )}
            {friendStatus === 'friends' && (
              <>
                <button onClick={() => navigate('/messages?with=' + profile!.id)} style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 700, borderRadius: 'var(--radius-full)', background: 'var(--brand)', color: '#fff' }}>
                  Message
                </button>
                <button onClick={() => setShowFriendSheet(true)} style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 700, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-primary)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  Friends ✓
                </button>
              </>
            )}
            {friendStatus === 'none' && isFollowing && (
              <>
                <button onClick={handleSendFriendRequest} disabled={socialActing} style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 700, borderRadius: 'var(--radius-full)', background: 'var(--brand)', color: '#fff', opacity: socialActing ? 0.5 : 1 }}>
                  Add Friend
                </button>
                <button onClick={() => setShowUnfollowConfirm(true)} style={{ height: 36, padding: '0 20px', fontSize: 13, fontWeight: 700, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-primary)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  Following ✓
                </button>
              </>
            )}
            <button onClick={() => setShowProfile3Dot(true)} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-full)', border: '1.5px solid var(--border)', color: 'var(--text-muted)', background: 'transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              <span className="flex w-5 h-5"><Icon.MoreHorizontal /></span>
            </button>
          </div>
        )}

      </section>

      {/* ── TABS ── */}
      <div
        role="tablist"
        style={{ display: 'flex', background: 'var(--surface)', borderBottom: '1px solid var(--divider)', position: 'sticky', top: 56, zIndex: 50 }}
      >
        {(isOwnProfile || isFriend
          ? (['personal', 'portfolio', 'featured'] as const)
          : (['portfolio', 'featured'] as const)
        ).map(t => {
          const label = t === 'featured' ? 'Featured In' : t.charAt(0).toUpperCase() + t.slice(1)
          const active = activeTab === t
          return (
            <button
              key={t}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(t)}
              style={{ flex: 1, padding: '13px var(--space-2)', fontSize: 12, fontWeight: 600, color: active ? 'var(--brand)' : 'var(--text-faint)', borderBottom: `2px solid ${active ? 'var(--brand)' : 'transparent'}`, transition: 'color var(--transition), border-color var(--transition)', background: 'none' }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {label}
                {t === 'featured' && isOwnProfile && pendingFeatures.length > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, padding: '0 3px', borderRadius: 'var(--radius-full)', fontSize: 9, fontWeight: 800, color: '#fff', background: 'var(--color-error)' }}>
                    {pendingFeatures.length}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {/* ── PILL SLIDER (portfolio tab only) ── */}
      {activeTab === 'portfolio' && portfolioFieldKeys.length > 0 && (
        <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--divider)', padding: 'var(--space-2) 0' }}>
          <div className="scrollbar-hide" style={{ display: 'flex', gap: 'var(--space-2)', overflowX: 'auto', scrollSnapType: 'x mandatory', padding: '2px var(--space-4) 4px' }}>
            <button
              onClick={() => setPortfolioFieldFilter(null)}
              style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: !portfolioFieldFilter ? 'var(--brand)' : 'var(--surface-off)', color: !portfolioFieldFilter ? '#fff' : 'var(--text-muted)', border: `1px solid ${!portfolioFieldFilter ? 'var(--brand)' : 'var(--border)'}` }}
            >All</button>
            {portfolioFieldKeys.map(disc => {
              const meta = DISCIPLINE_MAP[disc]
              const active = portfolioFieldFilter === disc
              return (
                <button key={disc} onClick={() => setPortfolioFieldFilter(active ? null : disc)}
                  style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: active ? 'var(--brand)' : 'var(--surface-off)', color: active ? '#fff' : 'var(--text-muted)', border: `1px solid ${active ? 'var(--brand)' : 'var(--border)'}` }}
                >
                  {meta && <span className="flex w-3.5 h-3.5 shrink-0"><meta.IconComp /></span>}
                  {meta?.label ?? disc}
                </button>
              )
            })}
            {isOwnProfile && (
              <button onClick={() => setShowAddFieldPicker(true)}
                style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', background: 'transparent', color: 'var(--text-faint)', border: '1px dashed var(--border)' }}
              >
                <span className="flex w-3.5 h-3.5 shrink-0"><Icon.Plus /></span>
                Add field
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── CONTENT ── */}
      <div>

        {/* Content toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', background: 'var(--bg)', borderBottom: '1px solid var(--divider)' }}>
          {isOwnProfile ? (
            <button
              onClick={() => {
                const fieldLocked = activeTab === 'portfolio' && !!portfolioFieldFilter
                setUploadDefaultDiscipline(fieldLocked ? portfolioFieldFilter : null)
                setUploadProLocked(fieldLocked)
                setShowUpload(true)
              }}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--brand)', color: '#fff', borderRadius: 'var(--radius-full)', boxShadow: '0 2px 8px rgba(78,11,22,0.25)' }}
              aria-label="Create new post"
            >
              <span className="flex w-[22px] h-[22px]"><Icon.Plus /></span>
            </button>
          ) : <div />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setGridView(true)}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: gridView ? 'var(--surface-off)' : 'transparent', color: gridView ? 'var(--brand)' : 'var(--text-faint)' }}
              aria-label="Grid view"
            >
              <span className="flex w-5 h-5"><Icon.GridView /></span>
            </button>
            <button onClick={() => setGridView(false)}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', background: !gridView ? 'var(--surface-off)' : 'transparent', color: !gridView ? 'var(--brand)' : 'var(--text-faint)' }}
              aria-label="List view"
            >
              <span className="flex w-5 h-5"><Icon.ListView /></span>
            </button>
          </div>
        </div>

        {/* Private profile */}
        {isPrivate && (
          <div className="flex flex-col items-center justify-center py-16">
            <span className="flex w-10 h-10 mb-3" style={{ color: 'var(--text-faint)' }}><Icon.Lock /></span>
            <p className="font-semibold" style={{ color: 'var(--text-muted)' }}>This profile is private</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Only friends can see this creator's posts.</p>
          </div>
        )}


        {/* ── PERSONAL TAB: non-pro posts, pinned first, friends + owner only ── */}
        {!isPrivate && activeTab === 'personal' && (
          <>
            {personalPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <span className="flex w-10 h-10 mb-3" style={{ color: 'var(--text-faint)' }}><Icon.Camera /></span>
                <p className="font-semibold" style={{ color: 'var(--text-muted)' }}>
                  {isOwnProfile ? 'Post something for your friends' : 'No personal posts yet'}
                </p>
                {isOwnProfile && (
                  <button
                    onClick={() => setShowUpload(true)}
                    className="mt-4 px-5 py-2 rounded-full text-[13px] font-semibold text-white transition-colors"
                    style={{ background: 'var(--brand)' }}
                  >
                    New Post
                  </button>
                )}
              </div>
            ) : gridView ? (
              <motion.div
                className="grid grid-cols-2 gap-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {personalPosts.map(p => (
                  <PostTile
                    key={p.id}
                    post={p}
                    isPinned={pinnedPostIds.has(p.id)}
                    showProIndicator={isOwnProfile && (p.is_pro_post || p.post_type === 'pro')}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.div
                className="max-w-[700px] mx-auto"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                {personalPosts.map(p => {
                  const isPinned = pinnedPostIds.has(p.id)
                  return (
                    <div key={p.id} className="relative">
                      {isPinned && (
                        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--surface-off)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          <span>📌</span>
                          <span>Pinned</span>
                        </div>
                      )}
                      <PostCard
                        post={p}
                        onUpdated={() => {
                          setPosts(prev => prev.filter(x => x.id !== p.id))
                          setPinnedPins(prev => prev.filter(x => x.post_id !== p.id))
                          setPinnedPostIds(prev => { const s = new Set(prev); s.delete(p.id); return s })
                        }}
                      />
                    </div>
                  )
                })}
              </motion.div>
            )}
          </>
        )}

        {/* ── PORTFOLIO TAB: Pro posts flat-filtered by field pill ── */}
        {!isPrivate && activeTab === 'portfolio' && (() => {
          const filteredPosts = posts
            .filter(p => p.is_pro_post || p.post_type === 'pro')
            .filter(p => !portfolioFieldFilter || p.persona_discipline === portfolioFieldFilter)
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

          if (filteredPosts.length === 0) return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="flex w-10 h-10 mb-3" style={{ color: 'var(--text-faint)' }}><Icon.Star /></span>
              <p className="font-semibold" style={{ color: 'var(--text-muted)' }}>
                {portfolioFieldFilter
                  ? `No ${DISCIPLINE_MAP[portfolioFieldFilter]?.label ?? portfolioFieldFilter} posts yet`
                  : 'No Pro Posts yet'}
              </p>
              {isOwnProfile && (
                <button
                  onClick={() => {
                    setUploadDefaultDiscipline(portfolioFieldFilter ?? null)
                    setUploadProLocked(!!portfolioFieldFilter)
                    setShowUpload(true)
                  }}
                  className="mt-4 px-5 py-2 rounded-full text-[13px] font-semibold text-white"
                  style={{ background: 'var(--brand)' }}
                >
                  {portfolioFieldFilter ? `Create ${DISCIPLINE_MAP[portfolioFieldFilter]?.label ?? portfolioFieldFilter} Post` : 'Create a Pro Post'}
                </button>
              )}
            </div>
          )

          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              {gridView ? (
                <div className="grid grid-cols-2 gap-[2px]">
                  {filteredPosts.map(p => {
                    const overlayLabel = !portfolioFieldFilter
                      ? (DISCIPLINE_MAP[p.persona_discipline ?? '']?.label ?? undefined)
                      : (postSubgroupMap[p.id]?.[0]?.name ?? undefined)
                    return (
                      <PostTile
                        key={p.id}
                        post={p}
                        isPinned={pinnedPostIds.has(p.id)}
                        showProIndicator={isOwnProfile}
                        overlayLabel={overlayLabel}
                      />
                    )
                  })}
                </div>
              ) : (
                <div className="max-w-[700px] mx-auto">
                  {filteredPosts.map(p => {
                    const comm = postSubgroupMap[p.id]?.[0]
                    return (
                      <div key={p.id} className="relative">
                        {comm && (
                          <div className="flex items-center gap-1.5 pt-2 pb-1 px-1">
                            <button
                              onClick={() => navigate('/c/' + comm.slug)}
                              className="text-[11.5px] font-medium hover:underline"
                              style={{ color: 'var(--text-muted)' }}
                            >
                              {comm.name}
                            </button>
                          </div>
                        )}
                        <PostCard
                          post={p}
                          onUpdated={() => setPosts(prev => prev.filter(x => x.id !== p.id))}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )
        })()}

        {/* ── FEATURED IN TAB ── */}
        {!isPrivate && activeTab === 'featured' && (() => {
          // Group accepted featured posts by discipline of the original post
          const featuredGroups: Record<string, PostFeature[]> = {}
          featuredIn.forEach(feat => {
            const post = feat.post as unknown as Post | undefined
            const disc = post?.persona_discipline ?? '__other__'
            if (!featuredGroups[disc]) featuredGroups[disc] = []
            featuredGroups[disc].push(feat)
          })

          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 max-w-[700px] mx-auto"
            >
              {/* Pending feature requests — own profile only */}
              {isOwnProfile && pendingFeatures.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-faint)' }}>
                    Pending Requests ({pendingFeatures.length})
                  </h3>
                  <div className="space-y-3">
                    {pendingFeatures.map(feat => {
                      const post = feat.post as unknown as Post | undefined
                      if (!post) return null
                      const poster = post.profiles as any
                      return (
                        <div
                          key={feat.post_id}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl"
                          style={{ background: 'var(--surface-off)', border: '1px solid var(--border)' }}
                        >
                          {poster?.avatar_url ? (
                            <img src={poster.avatar_url} className="w-9 h-9 rounded-full object-cover shrink-0" loading="lazy" alt="" />
                          ) : (
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0" style={{ background: 'var(--surface-off)', color: 'var(--text-muted)' }}>
                              {poster?.full_name?.[0]?.toUpperCase() ?? '?'}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                              <button
                                onClick={() => navigate('/profile/' + poster?.username)}
                                className="hover:underline"
                              >
                                @{poster?.username}
                              </button>
                              {' '}wants to feature you in a post
                            </p>
                            {post.caption && (
                              <p className="text-[12px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>"{post.caption}"</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleAcceptFeature(feat.post_id)}
                              className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-white transition-colors"
                              style={{ background: 'var(--brand)' }}
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleDeclineFeature(feat.post_id)}
                              className="px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors"
                              style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {featuredIn.length === 0 && pendingFeatures.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <span className="flex w-10 h-10 mb-3" style={{ color: 'var(--text-faint)' }}><Icon.Star /></span>
                  <p className="font-semibold" style={{ color: 'var(--text-muted)' }}>Posts where you're featured will appear here</p>
                  <p className="text-[13px] mt-1" style={{ color: 'var(--text-faint)' }}>
                    When another creator tags {isOwnProfile ? 'you' : profile?.full_name} as a featured creator and you accept, it'll show up here.
                  </p>
                </div>
              )}

              {/* Accepted features grouped by field */}
              {Object.entries(featuredGroups).map(([discipline, feats]) => {
                const disc = discipline === '__other__' ? null : DISCIPLINE_MAP[discipline]
                const fieldLabel = disc?.label ?? 'Other'

                return (
                  <div key={discipline}>
                    {/* Field section header */}
                    <div className="flex items-center gap-2 mb-3">
                      {disc && <span className="flex w-4 h-4" style={{ color: 'var(--text-muted)' }}><disc.IconComp /></span>}
                      <h3 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>{fieldLabel}</h3>
                      <span className="text-[12px] ml-0.5" style={{ color: 'var(--text-faint)' }}>{feats.length}</span>
                    </div>

                    <div className="space-y-0">
                      {feats.map(feat => {
                        const post = feat.post as unknown as Post | undefined
                        if (!post) return null
                        const poster = post.profiles as any
                        return (
                          <div key={feat.post_id} className="relative">
                            {/* By @username credit + remove button for owner */}
                            <div className="flex items-center justify-between pt-2 pb-1 px-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>by</span>
                                <button
                                  onClick={() => navigate('/profile/' + poster?.username)}
                                  className="text-[11.5px] font-semibold hover:underline"
                                  style={{ color: 'var(--text-primary)', transition: 'color var(--transition)' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)' }}
                                >
                                  @{poster?.username}
                                </button>
                              </div>
                              {isOwnProfile && (
                                <button
                                  onClick={() => handleRemoveFeature(feat.post_id)}
                                  className="text-[11px] font-medium"
                                  style={{ color: 'var(--text-faint)', transition: 'color var(--transition)' }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#EF4444' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <PostCard post={post} onUpdated={() => {}} />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </motion.div>
          )
        })()}
      </div>

      {/* ── FRIENDS / FOLLOWERS MODAL ── */}
      <AnimatePresence>
        {listModal && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setListModal(null)}
          >
            <motion.div
              className="apple-card w-full max-w-sm max-h-[70vh] overflow-hidden flex flex-col"
              onClick={e => e.stopPropagation()}
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--divider)' }}>
                <h3 className="text-[16px] font-semibold capitalize" style={{ color: 'var(--text-primary)' }}>
                  {listModal === 'friends' ? 'Friends' : 'Followers'}
                </h3>
                <button
                  onClick={() => setListModal(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <span className="flex w-4 h-4"><Icon.X /></span>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-3 py-2">
                {listLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--divider)', borderTopColor: 'var(--brand)' }} />
                  </div>
                ) : listUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10" style={{ color: 'var(--text-faint)' }}>
                    <span className="flex w-8 h-8 mb-2"><Icon.Users /></span>
                    <p className="text-sm">No {listModal === 'friends' ? 'friends' : 'followers'} yet</p>
                  </div>
                ) : (
                  listUsers.map(u => (
                    <button
                      key={u.id}
                      onClick={() => { setListModal(null); navigate('/profile/' + u.username) }}
                      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl transition-colors"
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                    >
                      <div className="w-10 h-10 rounded-full overflow-hidden shrink-0" style={{ background: 'var(--surface-off)' }}>
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          : <div className="w-full h-full flex items-center justify-center text-sm font-bold" style={{ color: 'var(--brand)' }}>{initials(u.full_name)}</div>
                        }
                      </div>
                      <div className="text-left min-w-0">
                        <p className="text-[14px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{u.full_name}</p>
                        <p className="text-[12px] truncate" style={{ color: 'var(--text-faint)' }}>@{u.username}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AVATAR LIGHTBOX ── */}
      <AnimatePresence>
        {avatarLightbox && profile.avatar_url && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-[10000]"
            style={{
              backdropFilter: 'blur(28px) saturate(160%) brightness(0.45)',
              WebkitBackdropFilter: 'blur(28px) saturate(160%) brightness(0.45)',
              background: 'rgba(0,0,0,0.55)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAvatarLightbox(false)}
          >
            <button
              onClick={() => setAvatarLightbox(false)}
              className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center z-10 transition-colors"
              style={{ background: 'rgba(255,255,255,0.12)', border: '0.5px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
            >
              <span className="flex w-4 h-4 text-white"><Icon.X /></span>
            </button>
            <motion.div
              className="relative"
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.88, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 12 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="rounded-full max-w-[80vw] max-h-[80vh] object-contain"
                style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.12)' }}
                loading="lazy"
                decoding="async"
              />
              {isOwnProfile && (
                <button
                  onClick={() => { setAvatarLightbox(false); avatarInputRef.current?.click() }}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-sm font-medium text-white"
                  style={{ background: 'rgba(255,255,255,0.16)', backdropFilter: 'blur(8px)', border: '0.5px solid rgba(255,255,255,0.2)' }}
                >
                  Change photo
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── POST LIGHTBOX ── */}
      <AnimatePresence>
        {postLightbox && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center z-[10000]"
            style={{
              backdropFilter: 'blur(28px) saturate(160%) brightness(0.45)',
              WebkitBackdropFilter: 'blur(28px) saturate(160%) brightness(0.45)',
              background: 'rgba(0,0,0,0.55)',
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPostLightbox(null)}
          >
            <button
              onClick={() => setPostLightbox(null)}
              className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center z-10 transition-colors"
              style={{ background: 'rgba(255,255,255,0.12)', border: '0.5px solid rgba(255,255,255,0.18)', backdropFilter: 'blur(8px)' }}
            >
              <span className="flex w-4 h-4 text-white"><Icon.X /></span>
            </button>
            <motion.div
              className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3"
              onClick={e => e.stopPropagation()}
              initial={{ scale: 0.88, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 12 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {postLightbox.content_type === 'photo' && postLightbox.media_url ? (
                <img
                  src={postLightbox.display_url || postLightbox.media_url}
                  alt=""
                  className="max-w-[90vw] max-h-[85vh] object-contain"
                  style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.12)' }}
                  loading="lazy"
                  decoding="async"
                />
              ) : postLightbox.content_type === 'video' && postLightbox.media_url ? (
                <video
                  src={postLightbox.media_url}
                  controls
                  autoPlay
                  className="max-w-[90vw] max-h-[85vh]"
                  style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 8px 24px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.12)' }}
                />
              ) : postLightbox.content_type === 'poem' ? (
                <div className="p-10 max-w-lg" style={{ background: 'rgba(255,248,230,0.10)', backdropFilter: 'blur(20px)', border: '0.5px solid rgba(255,255,255,0.15)', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>
                  <p className="text-5xl text-amber-300/50 leading-none mb-4">"</p>
                  <p className="text-white/90 text-[17px] italic leading-relaxed">{postLightbox.poem_text}</p>
                </div>
              ) : (
                <div className="p-10 max-w-lg" style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', border: '0.5px solid rgba(255,255,255,0.15)', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>
                  <p className="text-white/90 text-[16px] leading-relaxed">{postLightbox.caption}</p>
                </div>
              )}
              {postLightbox.caption && postLightbox.content_type !== 'poem' && (
                <p className="text-white/60 text-[13.5px] text-center max-w-lg px-4">{postLightbox.caption}</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {showEditModal && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEditModal(false)}
          onSaved={async () => { await refreshProfile(); setShowEditModal(false) }}
        />
      )}

      {showUpload && (
        <UploadModal
          defaultDiscipline={uploadDefaultDiscipline ?? undefined}
          proLocked={uploadProLocked}
          onClose={() => {
            setShowUpload(false)
            setUploadDefaultDiscipline(null)
            setUploadProLocked(false)
            if (myProfile) {
              supabase.from('posts')
                .select('id, user_id, content_type, caption, poem_text, media_url, media_path, tags, like_count, comment_count, share_count, pro_upvote_count, is_pro_post, post_type, persona_discipline, visibility, group_id, group:group_id(id,name,slug), created_at')
                .eq('user_id', myProfile.id)
                .order('created_at', { ascending: false })
                .then(({ data }) => {
                  if (data) setPosts((data as any[]).map(p => ({ ...p, profiles: profile })) as Post[])
                })
            }
          }}
        />
      )}

      {/* ── Add Field Picker ── */}
      <AnimatePresence>
        {showAddFieldPicker && (
          <motion.div
            className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAddFieldPicker(false)}
          >
            <motion.div
              className="w-full max-w-sm max-h-[70vh] overflow-hidden flex flex-col"
              style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)' }}
              onClick={e => e.stopPropagation()}
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0" style={{ borderBottom: '1px solid var(--divider)' }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Add a field</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 2 }}>Post in a field to add it to your profile</p>
                </div>
                <button
                  onClick={() => setShowAddFieldPicker(false)}
                  style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-full)', color: 'var(--text-muted)' }}
                >
                  <span className="flex w-4 h-4"><Icon.X /></span>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-3 py-2">
                {Object.entries(DISCIPLINE_MAP)
                  .filter(([key]) => !portfolioFieldKeys.includes(key))
                  .map(([key, meta]) => (
                    <button
                      key={key}
                      onClick={() => { setShowAddFieldPicker(false); setAddFieldTarget(key) }}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl"
                      style={{ transition: 'background var(--transition)' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                    >
                      <span className="flex w-5 h-5 shrink-0" style={{ color: 'var(--text-muted)' }}><meta.IconComp /></span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{meta.label}</span>
                    </button>
                  ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add Field Confirm ── */}
      <AnimatePresence>
        {addFieldTarget && (
          <motion.div
            className="fixed inset-0 z-[1000] flex items-center justify-center px-4"
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAddFieldTarget(null)}
          >
            <motion.div
              onClick={e => e.stopPropagation()}
              style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', padding: '28px 24px', maxWidth: 340, width: '100%', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
              <span className="flex w-10 h-10 mx-auto mb-4" style={{ color: 'var(--brand)' }}>
                {(() => { const M = DISCIPLINE_MAP[addFieldTarget]; return M ? <M.IconComp /> : null })()}
              </span>
              <h3 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8 }}>
                Add {DISCIPLINE_MAP[addFieldTarget]?.label ?? addFieldTarget}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, lineHeight: 1.5 }}>
                Create a Pro Post in this field. Once published, it will appear in your Portfolio under{' '}
                <strong>{DISCIPLINE_MAP[addFieldTarget]?.label ?? addFieldTarget}</strong>.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setAddFieldTarget(null)}
                  style={{ flex: 1, height: 40, borderRadius: 'var(--radius-full)', border: '1.5px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', background: 'transparent' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setAddFieldTarget(null)
                    setUploadDefaultDiscipline(addFieldTarget)
                    setUploadProLocked(true)
                    setShowUpload(true)
                  }}
                  style={{ flex: 1, height: 40, borderRadius: 'var(--radius-full)', fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--brand)' }}
                >
                  Create Post
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* ── Profile 3-dot bottom sheet ── */}
      <BottomSheet open={showProfile3Dot} onClose={() => setShowProfile3Dot(false)}>
        <SheetRow icon={<Icon.CopyLink />} label="Copy profile link" onClick={copyProfileLink} />
        <SheetRow
          icon={<Icon.Prohibit />}
          label={`Block @${profile?.username}`}
          danger
          onClick={() => { setShowProfile3Dot(false); setShowBlockConfirm(true) }}
        />
        <SheetRow
          icon={<Icon.Flag />}
          label="Report profile"
          danger
          onClick={() => { setShowProfile3Dot(false); setShowProfileReport(true) }}
        />
        <SheetCancel onClose={() => setShowProfile3Dot(false)} />
      </BottomSheet>

      {/* ── Block confirmation ── */}
      <ConfirmSheet
        open={showBlockConfirm}
        onClose={() => setShowBlockConfirm(false)}
        onConfirm={handleBlockUser}
        title={`Block @${profile?.username}?`}
        description="They won't be able to see your profile or posts."
        confirmLabel="Block"
        loading={blocking}
      />

      {/* ── Report profile ── */}
      {profile && (
        <ReportSheet
          open={showProfileReport}
          onClose={() => setShowProfileReport(false)}
          targetType="profile"
          targetId={profile.id}
        />
      )}

      {/* ── Friends menu sheet ── */}
      <BottomSheet open={showFriendSheet} onClose={() => setShowFriendSheet(false)}>
        <SheetRow
          icon={<Icon.UserCheck />}
          label="Unfollow"
          onClick={() => { setShowFriendSheet(false); setShowUnfollowConfirm(true) }}
        />
        <SheetRow
          icon={<Icon.UserPlus />}
          label="Remove friend"
          danger
          onClick={() => { setShowFriendSheet(false); setShowUnfollowConfirm(true) }}
        />
        <SheetCancel onClose={() => setShowFriendSheet(false)} />
      </BottomSheet>

      {/* ── Unfollow / Remove friend confirmation ── */}
      <ConfirmSheet
        open={showUnfollowConfirm}
        onClose={() => setShowUnfollowConfirm(false)}
        onConfirm={async () => {
          setShowUnfollowConfirm(false)
          if (friendStatus === 'friends') {
            await handleRemoveFriend()
          } else {
            await handleToggleFollow()
          }
        }}
        title={friendStatus === 'friends' ? 'Remove friend?' : 'Unfollow?'}
        description={`You'll unfollow @${profile?.username}. You can follow again anytime.`}
        confirmLabel={friendStatus === 'friends' ? 'Remove' : 'Unfollow'}
      />

      {/* ── Endorse confirmation sheet ── */}
      <ConfirmSheet
        open={!!endorseConfirmField}
        onClose={() => setEndorseConfirmField(null)}
        onConfirm={async () => {
          if (endorseConfirmField) {
            await handleEndorse(endorseConfirmField)
            setEndorseConfirmField(null)
          }
        }}
        title={`Endorse @${profile?.username} in ${DISCIPLINE_MAP[endorseConfirmField ?? '']?.label ?? endorseConfirmField}?`}
        description="Your endorsement is public and permanent."
        confirmLabel="Endorse"
        loading={endorsing === endorseConfirmField}
      />
    </div>
  )
}

// ── Edit Profile Modal ───────────────────────────────────────────────────────
function EditProfileModal({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const { profile: myProfile } = useAuth()
  const [fullName, setFullName] = useState(profile.full_name)
  const [username, setUsername] = useState(profile.username)
  const [roleTitle, setRoleTitle] = useState(profile.role_title || '')
  const [workplace, setWorkplace] = useState((profile as any).workplace || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [website, setWebsite] = useState(profile.website || '')
  const [location, setLocation] = useState((profile as any).location || '')
  const [personalPublic, setPersonalPublic] = useState(profile.personal_profile_public !== false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || '')
  const [saving, setSaving] = useState(false)
  const [personas, setPersonas] = useState<DisciplinePersona[]>([])
  const [personaEdits, setPersonaEdits] = useState<Record<string, { years_exp: string; bio: string; credentials: string }>>({})

  useEffect(() => {
    if (!myProfile) return
    supabase.from('discipline_personas').select('*').eq('user_id', myProfile.id).order('post_count', { ascending: false })
      .then(({ data }) => {
        const list = (data || []) as DisciplinePersona[]
        setPersonas(list)
        const edits: Record<string, { years_exp: string; bio: string; credentials: string }> = {}
        list.forEach(p => {
          edits[p.id] = { years_exp: p.years_exp != null ? String(p.years_exp) : '', bio: p.bio ?? '', credentials: p.credentials ?? '' }
        })
        setPersonaEdits(edits)
      })
  }, [myProfile?.id])

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setAvatarFile(f)
    setAvatarPreview(URL.createObjectURL(f))
  }

  function setPersonaField(id: string, field: 'years_exp' | 'bio' | 'credentials', value: string) {
    setPersonaEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function save() {
    if (!myProfile) return
    setSaving(true)
    let avatarUrl = profile.avatar_url
    if (avatarFile) {
      const fileName = myProfile.id + '/avatar'
      const { thumbUrl } = await uploadPhoto(avatarFile, 'avatars', fileName)
      avatarUrl = thumbUrl + '?t=' + Date.now()
    }
    const { error } = await supabase.from('profiles').update({
      full_name: fullName,
      username: username.replace('@', '').toLowerCase(),
      role_title: roleTitle.trim() || null,
      workplace: workplace.trim() || null,
      location: location.trim() || null,
      bio: bio.slice(0, 160),
      website,
      avatar_url: avatarUrl,
      personal_profile_public: personalPublic,
      updated_at: new Date().toISOString(),
    }).eq('id', myProfile.id)
    if (error) { toast.error(error.message); setSaving(false); return }

    await Promise.all(personas.map(p => {
      const edits = personaEdits[p.id]
      if (!edits) return Promise.resolve()
      return supabase.from('discipline_personas').update({
        years_exp: edits.years_exp ? parseInt(edits.years_exp) : null,
        bio: edits.bio || null,
        credentials: edits.credentials || null,
      }).eq('id', p.id)
    }))

    toast.success('Profile updated')
    onSaved()
    setSaving(false)
  }

  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-[1000] p-4"
      style={{
        backdropFilter: 'blur(20px) saturate(140%) brightness(0.6)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%) brightness(0.6)',
        background: 'rgba(0,0,0,0.45)',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="apple-card w-full max-w-lg max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.15)' }}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-[17px] font-semibold text-gray-900 dark:text-white">Edit profile</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="flex w-4 h-4 text-gray-500"><Icon.X /></span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-burgundy-100 dark:bg-burgundy-900 flex items-center justify-center text-xl font-bold text-burgundy-700 dark:text-burgundy-300 shrink-0">
              {avatarPreview
                ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                : initials(fullName)
              }
            </div>
            <div>
              <label className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer inline-block">
                Change photo
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </label>
              <p className="text-xs text-gray-400 mt-1.5">JPG, PNG, WebP — max 5MB</p>
            </div>
          </div>

          {/* Personal section */}
          <div className="flex items-center gap-3 pt-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Personal</p>
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
          </div>

          <Field label="Display name"><input className="field-input-tw" value={fullName} onChange={e => setFullName(e.target.value)} /></Field>
          <Field label="Job title" hint="optional">
            <input className="field-input-tw" placeholder="e.g. Software Engineer, Cardiologist…" value={roleTitle} onChange={e => setRoleTitle(e.target.value)} />
          </Field>
          <Field label="Workplace" hint="optional">
            <input className="field-input-tw" placeholder="e.g. Google, NHS, Freelance…" value={workplace} onChange={e => setWorkplace(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Shows as "Software Engineer at Google" on your profile.</p>
          </Field>
          <Field label="Username"><input className="field-input-tw" value={username} onChange={e => setUsername(e.target.value)} /></Field>
          <Field label="Bio">
            <div className="relative">
              <textarea
                className="field-input-tw resize-none h-20"
                value={bio}
                onChange={e => setBio(e.target.value.slice(0, 160))}
                placeholder="Tell the world about your craft…"
              />
              <span className={`absolute bottom-2 right-2.5 text-[10.5px] ${bio.length >= 150 ? 'text-amber-500' : 'text-gray-300 dark:text-gray-600'}`}>
                {bio.length}/160
              </span>
            </div>
          </Field>
          <Field label="Location" hint="optional">
            <input className="field-input-tw" placeholder="e.g. London, New York…" value={location} onChange={e => setLocation(e.target.value)} />
          </Field>
          <Field label="Website">
            <input className="field-input-tw" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourportfolio.com" />
          </Field>

          {/* Settings */}
          <div className="flex items-center gap-3 pt-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Settings</p>
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
          </div>

          <button
            onClick={() => setPersonalPublic(v => !v)}
            className="w-full flex items-center justify-between py-2"
          >
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="flex w-4 h-4 text-gray-500">{personalPublic ? <Icon.Globe /> : <Icon.Lock />}</span>
              Personal profile is {personalPublic ? 'public' : 'private (friends only)'}
            </div>
            <div className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${personalPublic ? 'bg-brand-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${personalPublic ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>

          {/* Professional fields */}
          {personas.length > 0 && (
            <div className="pt-1">
              <div className="flex items-center gap-3 mb-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 shrink-0">Professional fields</p>
                <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
              </div>
              <div className="space-y-3">
                {personas.map(p => {
                  const meta = getProfMeta(p.discipline)
                  const edits = personaEdits[p.id] ?? { years_exp: '', bio: '', credentials: '' }
                  return (
                    <div key={p.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                        <span>{meta?.icon ?? '✦'}</span>
                        {meta?.label ?? p.discipline}
                        <span className="font-normal text-gray-400 dark:text-gray-500 text-xs">· {p.post_count} posts</span>
                      </div>
                      <div className="space-y-2">
                        <input className="field-input-tw text-xs" type="number" placeholder="Years of experience" value={edits.years_exp} onChange={e => setPersonaField(p.id, 'years_exp', e.target.value)} />
                        <textarea className="field-input-tw text-xs resize-none h-16" placeholder="Brief description of your work…" value={edits.bio} onChange={e => setPersonaField(p.id, 'bio', e.target.value)} />
                        <input className="field-input-tw text-xs" placeholder="Credentials / portfolio link" value={edits.credentials} onChange={e => setPersonaField(p.id, 'credentials', e.target.value)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-[2] py-3 bg-brand-600 text-white rounded-full text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {saving
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Save changes'
              }
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
        {label}
        {hint && <span className="font-normal text-gray-400 dark:text-gray-500 ml-1.5">{hint}</span>}
      </label>
      {children}
    </div>
  )
}
