import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, Post, Profile, Group, getProfMeta } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import PostCard from '@/components/PostCard'
import UploadModal from '@/components/UploadModal'

function Avatar({ profile, size = 36 }: { profile: Profile; size?: number }) {
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

export default function CommunityPage() {
  const { slug } = useParams<{ slug: string }>()
  const { profile: myProfile } = useAuth()
  const navigate = useNavigate()

  const [community, setCommunity]   = useState<Group | null>(null)
  const [isFollowing, setIsFollowing] = useState(false)
  const [following, setFollowing]   = useState(false)
  const [tab, setTab]               = useState<'posts' | 'creators'>('posts')
  const [posts, setPosts]           = useState<Post[]>([])
  const [creators, setCreators]     = useState<Profile[]>([])
  const [loading, setLoading]       = useState(true)
  const [showUpload, setShowUpload] = useState(false)

  // ── Load community ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return
    supabase.from('groups').select('*').eq('slug', slug).single()
      .then(({ data }) => {
        setCommunity(data as Group)
      })
  }, [slug])

  // ── Check follow status ─────────────────────────────────────────────────
  useEffect(() => {
    if (!myProfile || !community) return
    supabase.from('subgroup_follows')
      .select('user_id', { count: 'exact', head: true })
      .eq('user_id', myProfile.id)
      .eq('subgroup_id', community.id)
      .then(({ count }) => setIsFollowing((count ?? 0) > 0))
  }, [myProfile?.id, community?.id])

  // ── Load posts tab ──────────────────────────────────────────────────────
  const fetchPosts = useCallback(async () => {
    if (!community) return
    setLoading(true)
    const { data } = await supabase
      .from('post_subgroups')
      .select(`post_id, posts!inner(
        id,user_id,content_type,caption,poem_text,media_url,thumb_url,display_url,
        tags,like_count,comment_count,pro_upvote_count,is_pro_post,post_type,
        persona_discipline,visibility,group_id,created_at,
        profiles!user_id(id,username,full_name,avatar_url,role_title,is_pro,verification_count)
      )`)
      .eq('subgroup_id', community.id)
      .order('added_at', { ascending: false })
      .limit(30)

    const fetched = (data || []).map((r: any) => r.posts).filter(Boolean) as Post[]
    // Mark interactions
    if (myProfile && fetched.length > 0) {
      const ids = fetched.map(p => p.id)
      const [lRes, uRes] = await Promise.all([
        supabase.from('likes').select('post_id').eq('user_id', myProfile.id).in('post_id', ids),
        supabase.from('pro_upvotes').select('post_id').eq('user_id', myProfile.id).in('post_id', ids),
      ])
      const liked = new Set((lRes.data || []).map((r: any) => r.post_id))
      const upvoted = new Set((uRes.data || []).map((r: any) => r.post_id))
      setPosts(fetched.map(p => ({ ...p, user_liked: liked.has(p.id), user_pro_upvoted: upvoted.has(p.id) })))
    } else {
      setPosts(fetched)
    }
    setLoading(false)
  }, [community?.id, myProfile?.id])

  // ── Load creators tab ───────────────────────────────────────────────────
  const fetchCreators = useCallback(async () => {
    if (!community) return
    setLoading(true)
    const { data } = await supabase
      .from('user_subgroups')
      .select('user_id, profiles!user_id(id,username,full_name,avatar_url,bio,role_title,is_pro,follower_count,verification_count)')
      .eq('subgroup_id', community.id)
      .limit(40)

    const fetched = (data || []).map((r: any) => r.profiles).filter(Boolean) as Profile[]
    // Sort by follower_count desc
    fetched.sort((a, b) => (b.follower_count ?? 0) - (a.follower_count ?? 0))
    setCreators(fetched)
    setLoading(false)
  }, [community?.id])

  useEffect(() => {
    if (!community) return
    if (tab === 'posts') fetchPosts()
    else fetchCreators()
  }, [tab, community?.id, fetchPosts, fetchCreators])

  // ── Follow / Unfollow ───────────────────────────────────────────────────
  async function toggleFollow() {
    if (!myProfile || !community) return
    setFollowing(true)
    if (isFollowing) {
      await supabase.from('subgroup_follows')
        .delete().match({ user_id: myProfile.id, subgroup_id: community.id })
      setIsFollowing(false)
      setCommunity(c => c ? { ...c, follower_count: Math.max(0, (c.follower_count ?? 1) - 1) } : c)
    } else {
      await supabase.from('subgroup_follows')
        .insert({ user_id: myProfile.id, subgroup_id: community.id })
      setIsFollowing(true)
      setCommunity(c => c ? { ...c, follower_count: (c.follower_count ?? 0) + 1 } : c)
    }
    setFollowing(false)
  }

  if (!community && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        <p className="text-[15px] font-semibold text-text-primary">Community not found</p>
        <button onClick={() => navigate('/explore')} className="mt-4 text-[13px] text-accent hover:underline">
          Back to Explore
        </button>
      </div>
    )
  }

  const disciplineLabel = community ? getProfMeta(community.discipline)?.label ?? community.discipline : ''
  const disciplineIcon  = community ? getProfMeta(community.discipline)?.icon ?? '✦' : ''

  return (
    <div className="max-w-[614px] mx-auto md:py-4">

      {/* ── Community header ─────────────────────────────────── */}
      <div
        className="px-4 md:px-0 pt-6 pb-5 border-b border-border"
        style={{ background: 'linear-gradient(135deg, rgba(24,24,27,0.03) 0%, transparent 60%)' }}
      >
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 mb-4 text-[12px] text-text-secondary">
          <button onClick={() => navigate('/explore')} className="hover:text-text-primary transition-colors">
            Explore
          </button>
          <span className="flex w-3 h-3"><Icon.ChevronRight /></span>
          <span>{disciplineIcon} {disciplineLabel}</span>
          <span className="flex w-3 h-3"><Icon.ChevronRight /></span>
          <span className="text-text-primary font-medium">{community?.name}</span>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-[22px] font-bold text-text-primary leading-tight">
              {community?.name}
            </h1>
            {community?.description && (
              <p className="text-[13.5px] text-text-secondary mt-1 leading-relaxed">
                {community.description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-3 text-[13px] text-text-secondary">
              <span>
                <span className="font-semibold text-text-primary">
                  {(community?.follower_count ?? 0).toLocaleString()}
                </span>{' '}
                followers
              </span>
              <span>
                <span className="font-semibold text-text-primary">
                  {(community?.post_count ?? 0).toLocaleString()}
                </span>{' '}
                posts
              </span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            <button
              onClick={toggleFollow}
              disabled={following}
              className={`px-4 py-2 rounded-full text-[13.5px] font-semibold transition-all border ${
                isFollowing
                  ? 'border-border bg-surface-elevated text-text-secondary hover:border-red-300 hover:text-red-600'
                  : 'border-accent bg-accent text-white hover:bg-accent-hover'
              }`}
            >
              {following ? '…' : isFollowing ? 'Following' : 'Follow'}
            </button>
            {myProfile && (
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 text-[12px] text-text-secondary hover:text-text-primary transition-colors"
              >
                <span className="flex w-3 h-3"><Icon.Plus /></span>
                Post here
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background border-b border-border flex">
        {(['posts', 'creators'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-3 text-[14px] font-bold transition-colors relative capitalize"
            style={{ color: tab === t ? '#111111' : '#9CA3AF' }}
          >
            {t}
            {tab === t && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ──────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-border-strong border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'posts' ? (
        posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <span className="flex w-10 h-10 mb-3 text-border-strong"><Icon.Camera /></span>
            <p className="font-bold text-text-primary text-[15px]">No Pro Posts yet</p>
            <p className="text-[13px] text-text-secondary mt-1">Be the first to post in this community.</p>
            {myProfile && (
              <button
                onClick={() => setShowUpload(true)}
                className="mt-5 px-5 py-2 bg-accent hover:bg-accent-hover text-white text-[13.5px] font-bold rounded-badge transition-colors"
              >
                Post here
              </button>
            )}
          </div>
        ) : (
          posts.map(post => (
            <PostCard key={post.id} post={post} onUpdated={fetchPosts} />
          ))
        )
      ) : (
        // Creators tab
        creators.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <span className="flex w-10 h-10 mb-3 text-border-strong"><Icon.Profile /></span>
            <p className="font-bold text-text-primary text-[15px]">No creators yet</p>
            <p className="text-[13px] text-text-secondary mt-1">Creators who post here will appear in this list.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {creators.map(creator => (
              <div key={creator.id} className="flex items-center gap-3 px-4 py-3.5">
                <button onClick={() => navigate(`/profile/${creator.username}`)}>
                  <Avatar profile={creator} size={44} />
                </button>
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => navigate(`/profile/${creator.username}`)}
                    className="font-semibold text-[14px] text-text-primary hover:underline block truncate"
                  >
                    {creator.full_name}
                  </button>
                  <p className="text-[12px] text-text-secondary truncate">
                    @{creator.username}
                    {creator.role_title ? ` · ${creator.role_title}` : ''}
                  </p>
                  {creator.bio && (
                    <p className="text-[12px] text-text-secondary mt-0.5 truncate">{creator.bio}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[11.5px] text-text-secondary">
                    {(creator.follower_count ?? 0).toLocaleString()} followers
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <div className="h-20 md:h-0" />

      {/* ── Upload modal pre-filled with this community ───────── */}
      {showUpload && community && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          defaultGroup={community}
          defaultDiscipline={community.discipline}
        />
      )}
    </div>
  )
}
