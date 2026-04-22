import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Post, Group, getProfMeta } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import PostCard from '@/components/PostCard'

const DISCIPLINES = [
  { key: 'photographer',  label: 'Photography' },
  { key: 'singer',        label: 'Vocals & Singing' },
  { key: 'musician',      label: 'Music' },
  { key: 'poet',          label: 'Poetry & Writing' },
  { key: 'visual-artist', label: 'Visual Arts' },
  { key: 'filmmaker',     label: 'Film & Video' },
  { key: 'dancer',        label: 'Dance' },
  { key: 'comedian',      label: 'Performance' },
  { key: 'culinary',      label: 'Culinary Arts' },
  { key: 'fitness',       label: 'Fitness & Sports' },
  { key: 'technology',    label: 'Technology' },
  { key: 'fashion',       label: 'Fashion & Style' },
  { key: 'architecture',  label: 'Architecture' },
  { key: 'medicine',      label: 'Medicine & Health' },
  { key: 'education',     label: 'Education' },
  { key: 'law',           label: 'Law & Justice' },
  { key: 'science',       label: 'Science & Research' },
  { key: 'business',      label: 'Business' },
  { key: 'wellness',      label: 'Wellness & Mind' },
]

export default function ExplorePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null)
  const [selectedSubgroup, setSelectedSubgroup]     = useState<Group | null>(null)
  const [subgroups, setSubgroups]                   = useState<Group[]>([])
  const [posts, setPosts]                           = useState<Post[]>([])
  const [loading, setLoading]                       = useState(false)

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

  const pillBase = 'px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors border shrink-0'
  const pillActive = `${pillBase} bg-accent border-accent text-white`
  const pillInactive = `${pillBase} bg-surface-elevated border-border text-text-secondary hover:border-border-strong hover:text-text-primary`

  return (
    <div className="max-w-[614px] mx-auto md:py-4">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 md:px-0">
        <h1 className="text-[20px] font-bold text-text-primary mb-1">Explore</h1>
        <p className="text-[13px] text-text-secondary">
          Pro Posts from creators you haven't followed yet — ranked by engagement.
        </p>
      </div>

      {/* ── Discipline filter pills ─────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border py-3">
        <div className="flex gap-2 px-4 md:px-0 overflow-x-auto scrollbar-hide">
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
              onClick={() => setSelectedDiscipline(prev => prev === d.key ? null : d.key)}
            >
              {getProfMeta(d.key)?.icon} {d.label}
            </button>
          ))}
        </div>

        {/* Subgroup pills — shown when a discipline is selected */}
        {selectedDiscipline && subgroups.length > 0 && (
          <div className="flex gap-2 px-4 md:px-0 mt-2 overflow-x-auto scrollbar-hide">
            <button
              className={!selectedSubgroup ? pillActive : pillInactive}
              onClick={() => setSelectedSubgroup(null)}
            >
              All communities
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

      {/* ── Community page link (when subgroup selected) ────── */}
      {selectedSubgroup && (
        <div className="mx-4 md:mx-0 mt-3 px-4 py-3 rounded-xl bg-surface-elevated border border-border flex items-center justify-between">
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

      {/* ── Posts ──────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-border-strong border-t-transparent rounded-full animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <span className="flex w-10 h-10 mb-3 text-border-strong"><Icon.Explore /></span>
          <p className="font-bold text-text-primary text-[15px]">Nothing here yet</p>
          <p className="text-[13px] text-text-secondary mt-1">
            {selectedSubgroup
              ? 'No Pro Posts in this community yet.'
              : 'Try a different field, or check back later.'}
          </p>
        </div>
      ) : (
        posts.map(post => (
          <PostCard key={post.id} post={post} onUpdated={fetchPosts} />
        ))
      )}

      <div className="h-20 md:h-0" />
    </div>
  )
}
