import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, Post, Group, getProfMeta } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import PostCard from '@/components/PostCard'

const DISCIPLINES = [
  { key: 'photography', label: 'Photography' },
  { key: 'music',       label: 'Music' },
  { key: 'dance',       label: 'Dance' },
  { key: 'art',         label: 'Art' },
  { key: 'film',        label: 'Film' },
  { key: 'design',      label: 'Design' },
  { key: 'writing',     label: 'Writing' },
  { key: 'fitness',     label: 'Fitness' },
  { key: 'culinary',    label: 'Culinary' },
  { key: 'technology',  label: 'Technology' },
  { key: 'fashion',     label: 'Fashion' },
  { key: 'sports',      label: 'Sports' },
]

export default function ExplorePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(() => {
    const d = searchParams.get('discipline')
    return d && DISCIPLINES.find(disc => disc.key === d) ? d : null
  })
  const [selectedSubgroup, setSelectedSubgroup]     = useState<Group | null>(null)
  const [subgroups, setSubgroups]                   = useState<Group[]>([])
  const [posts, setPosts]                           = useState<Post[]>([])
  const [loading, setLoading]                       = useState(false)
  const [searchQuery, setSearchQuery]               = useState('')
  const [selectedPost, setSelectedPost]             = useState<Post | null>(null)

  // ── Sync discipline from URL param ─────────────────────────────────────
  const disciplineParam = searchParams.get('discipline')
  useEffect(() => {
    const d = disciplineParam
    setSelectedDiscipline(d && DISCIPLINES.find(disc => disc.key === d) ? d : null)
  }, [disciplineParam])

  // ── Load subgroups when discipline filter changes ───────────────────────
  useEffect(() => {
    setSelectedSubgroup(null)
    if (!selectedDiscipline) { setSubgroups([]); return }
    supabase.from('groups').select('*').eq('discipline', selectedDiscipline)
      .order('post_count', { ascending: false }).limit(30)
      .then(({ data }) => setSubgroups((data || []) as Group[]))
  }, [selectedDiscipline])

  // ── Fetch explore posts ─────────────────────────────────────────────────
  const fetchPosts = useCallback(async () => {
    setLoading(true)
    const since48h = new Date(Date.now() - 48 * 3_600_000).toISOString()

    // Get IDs of users and communities the current user already follows
    let followingIds: string[] = []
    let followedSubgroupIds: string[] = []
    if (profile) {
      const [fRes, sfRes] = await Promise.all([
        supabase.from('follows').select('following_id').eq('follower_id', profile.id),
        supabase.from('subgroup_follows').select('subgroup_id').eq('user_id', profile.id),
      ])
      followingIds        = (fRes.data  || []).map((r: any) => r.following_id as string)
      followedSubgroupIds = (sfRes.data || []).map((r: any) => r.subgroup_id as string)
    }

    if (selectedSubgroup) {
      // Filter by specific subgroup via post_subgroups join
      const { data: psData } = await supabase
        .from('post_subgroups')
        .select(`post_id, posts!inner(
          id,user_id,content_type,caption,poem_text,media_url,thumb_url,display_url,
          tags,like_count,comment_count,pro_upvote_count,is_pro_post,post_type,
          persona_discipline,visibility,group_id,created_at,
          profiles!user_id(id,username,full_name,avatar_url,role_title,is_pro,verification_count)
        )`)
        .eq('subgroup_id', selectedSubgroup.id)

      let merged: Post[] = ((psData || []).map((r: any) => r.posts).filter(Boolean) as unknown) as Post[]

      // Filter: pro only, not from followed users, not in followed communities
      merged = merged.filter(p =>
        (p.is_pro_post || p.post_type === 'pro') &&
        !followingIds.includes(p.user_id)
      )

      // Score by engagement in last 48h (approximate — use total counts as proxy)
      merged.sort((a, b) => (b.like_count + b.comment_count) - (a.like_count + a.comment_count))
      setPosts(merged.slice(0, 30))
      setLoading(false)
      return
    }

    // General explore: pro posts not from followed users
    let query = supabase.from('posts')
      .select(`id,user_id,content_type,caption,poem_text,media_url,media_path,thumb_url,display_url,
        tags,like_count,comment_count,share_count,pro_upvote_count,is_pro_post,is_pro,post_type,
        persona_discipline,visibility,group_id,created_at,
        profiles!user_id(id,username,full_name,avatar_url,role_title,is_pro,verification_count)`)
      .or('is_pro_post.eq.true,post_type.eq.pro')
      .order('like_count', { ascending: false })
      .order('comment_count', { ascending: false })
      .limit(60)

    if (selectedDiscipline) {
      query = query.eq('persona_discipline', selectedDiscipline)
    }

    const { data } = await query
    let allPosts = (data as unknown || []) as Post[]

    // Exclude posts from followed users
    if (followingIds.length > 0) {
      allPosts = allPosts.filter(p => !followingIds.includes(p.user_id))
    }

    // Exclude posts whose only community is a followed one (skip if complex; just show all non-followed-user posts)
    // Sort by total engagement
    allPosts.sort((a, b) => (b.like_count + b.comment_count) - (a.like_count + a.comment_count))

    setPosts(allPosts.slice(0, 30))
    setLoading(false)
  }, [profile?.id, selectedDiscipline, selectedSubgroup?.id])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const pillBase = 'px-3 py-1 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors border shrink-0'
  const pillActive = `${pillBase} bg-accent border-accent text-white`
  const pillInactive = `${pillBase} bg-transparent border-border text-text-secondary hover:border-border-strong hover:text-text-primary`

  const filteredPosts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return posts
    return posts.filter(p =>
      (p.caption?.toLowerCase().includes(q)) ||
      (p.profiles?.full_name?.toLowerCase().includes(q))
    )
  }, [posts, searchQuery])

  return (
    <div className="max-w-[614px] mx-auto md:py-4">

      {/* ── Sticky header: search + field pills ────────────── */}
      <div className="sticky top-0 z-20 bg-surface border-b border-border">
        {/* Search bar */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 bg-surface-elevated border border-border rounded-full px-3.5 py-2">
            <span className="flex w-[15px] h-[15px] text-text-hint shrink-0"><Icon.Search /></span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search creators, posts, fields..."
              className="flex-1 bg-transparent text-[13px] text-text-primary placeholder:text-text-hint outline-none"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="shrink-0 text-text-secondary hover:text-text-primary">
                <span className="flex w-[14px] h-[14px]"><Icon.X /></span>
              </button>
            )}
          </div>
        </div>

        {/* Discipline filter pills */}
        <div className="flex gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide">
          <button
            className={!selectedDiscipline ? pillActive : pillInactive}
            onClick={() => { setSelectedDiscipline(null); setSelectedSubgroup(null) }}
          >
            All
          </button>
          {DISCIPLINES.map(d => (
            <button
              key={d.key}
              className={selectedDiscipline === d.key ? pillActive : pillInactive}
              onClick={() => {
                const next = selectedDiscipline === d.key ? null : d.key
                setSelectedDiscipline(next)
                setSelectedSubgroup(null)
                if (next) navigate(`/explore?discipline=${next}`, { replace: true })
                else navigate('/explore', { replace: true })
              }}
            >
              {getProfMeta(d.key)?.icon} {d.label}
            </button>
          ))}
        </div>

        {/* Subgroup pills */}
        {selectedDiscipline && subgroups.length > 0 && (
          <div className="flex gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide border-t border-border pt-2">
            <button
              className={!selectedSubgroup ? pillActive : pillInactive}
              onClick={() => setSelectedSubgroup(null)}
            >
              All
            </button>
            {subgroups.map(g => (
              <button
                key={g.id}
                className={selectedSubgroup?.id === g.id ? pillActive : pillInactive}
                onClick={() => setSelectedSubgroup(prev => prev?.id === g.id ? null : g)}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Field landing link (when discipline selected) ─────── */}
      {selectedDiscipline && !selectedSubgroup && (
        <div className="mx-3 mt-3 px-4 py-2.5 rounded-xl bg-surface-elevated border border-border flex items-center justify-between">
          <div>
            <p className="text-[13px] font-semibold text-text-primary">
              {getProfMeta(selectedDiscipline)?.icon} {getProfMeta(selectedDiscipline)?.label} Field
            </p>
            <p className="text-[11px] text-text-hint">{subgroups.length} communities</p>
          </div>
          <button
            onClick={() => navigate(`/field/${selectedDiscipline}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-accent border border-accent/30 rounded-full hover:bg-accent/5 transition-colors"
          >
            Field page
            <span className="flex w-3 h-3"><Icon.ChevronRight /></span>
          </button>
        </div>
      )}

      {/* ── Community page link (when subgroup selected) ────── */}
      {selectedSubgroup && (
        <div className="mx-3 mt-3 px-4 py-3 rounded-xl bg-surface-elevated border border-border flex items-center justify-between">
          <div>
            <p className="text-[14px] font-semibold text-text-primary">{selectedSubgroup.name}</p>
            <p className="text-[12px] text-text-secondary">
              {selectedSubgroup.follower_count.toLocaleString()} followers · {selectedSubgroup.post_count} posts
            </p>
          </div>
          <button
            onClick={() => navigate(`/c/${selectedSubgroup.slug}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-semibold text-accent border border-accent/30 rounded-full hover:bg-accent/5 transition-colors"
          >
            Community page
            <span className="flex w-3 h-3"><Icon.ChevronRight /></span>
          </button>
        </div>
      )}

      {/* ── 3-column grid or loading/empty ─────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-border-strong border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <span className="flex w-10 h-10 mb-3 text-border-strong"><Icon.Explore /></span>
          <p className="font-bold text-text-primary text-[15px]">Nothing here yet</p>
          <p className="text-[13px] text-text-secondary mt-1">
            {selectedSubgroup
              ? 'No Pro Posts in this community yet.'
              : 'Try a different field, or check back later.'}
          </p>
        </div>
      ) : selectedPost ? (
        /* ── Full-screen post view ─────────────────────────── */
        <div>
          <button
            onClick={() => setSelectedPost(null)}
            className="flex items-center gap-2 px-3 py-2.5 text-[13px] font-semibold text-text-secondary hover:text-text-primary transition-colors border-b border-border w-full"
          >
            ← Back to grid
          </button>
          <PostCard post={selectedPost} onUpdated={fetchPosts} />
        </div>
      ) : (
        /* ── 3-column photo grid ─────────────────────────────── */
        <div className="grid grid-cols-3 gap-0.5 bg-border">
          {filteredPosts.map(post => {
            const thumb = post.thumb_url || post.media_url || ''
            const isVideo = post.content_type === 'video'
            const fieldMeta = getProfMeta(post.persona_discipline)
            return (
              <button
                key={post.id}
                onClick={() => setSelectedPost(post)}
                className="relative aspect-square bg-surface-elevated overflow-hidden group"
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-surface-elevated text-text-hint px-2">
                    <span className="text-[11px] font-semibold text-center leading-tight">
                      {fieldMeta?.icon} {post.caption?.slice(0, 40) || 'Post'}
                    </span>
                  </div>
                )}

                {/* Video play indicator */}
                {isVideo && (
                  <div className="absolute top-1.5 left-1.5">
                    <span className="text-white/85 text-[14px]">▷</span>
                  </div>
                )}

                {/* Pro vote badge */}
                {post.pro_upvote_count > 0 && (
                  <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#C9A84C]/85">
                    <span className="text-white text-[9px] font-bold leading-none">↑ {post.pro_upvote_count}</span>
                  </div>
                )}

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              </button>
            )
          })}
        </div>
      )}

      <div className="h-20 md:h-0" />
    </div>
  )
}
