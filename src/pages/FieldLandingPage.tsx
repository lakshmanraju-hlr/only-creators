import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, Post, Group, getProfMeta } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import PostCard from '@/components/PostCard'
import UploadModal from '@/components/UploadModal'

export default function FieldLandingPage() {
  const { discipline } = useParams<{ discipline: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [communities, setCommunities] = useState<Group[]>([])
  const [topPosts, setTopPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [memberCount, setMemberCount] = useState(0)
  const [postCount, setPostCount] = useState(0)

  const fieldMeta = getProfMeta(discipline ?? '')

  const load = useCallback(async () => {
    if (!discipline) return
    setLoading(true)

    const [commRes, postRes, memberRes] = await Promise.all([
      supabase.from('groups').select('*').eq('discipline', discipline)
        .order('post_count', { ascending: false }).limit(12),
      supabase.from('posts').select(`
        id, user_id, content_type, caption, media_url, thumb_url, display_url,
        like_count, comment_count, pro_upvote_count, is_pro_post, post_type,
        persona_discipline, visibility, created_at,
        profiles!user_id(id, username, full_name, avatar_url, is_pro, verification_count)
      `)
        .eq('persona_discipline', discipline)
        .or('is_pro_post.eq.true,post_type.eq.pro')
        .order('pro_upvote_count', { ascending: false })
        .order('like_count', { ascending: false })
        .limit(18),
      supabase.from('discipline_personas').select('id', { count: 'exact', head: true })
        .eq('discipline', discipline),
    ])

    setCommunities((commRes.data || []) as Group[])
    setTopPosts((postRes.data || []) as unknown as Post[])
    setMemberCount(memberRes.count ?? 0)
    const total = (commRes.data || []).reduce((s, g: any) => s + (g.post_count ?? 0), 0)
    setPostCount(total)
    setLoading(false)
  }, [discipline])

  useEffect(() => { load() }, [load])

  const pillBase = 'px-3 py-1 rounded-full text-[12.5px] font-semibold whitespace-nowrap border'

  if (!discipline || !fieldMeta) return (
    <div className="flex flex-col items-center justify-center py-20 text-text-secondary">
      <p className="font-semibold">Field not found</p>
    </div>
  )

  return (
    <div className="max-w-[614px] mx-auto">
      {/* Back nav */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface border-b border-border">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-[13px] text-text-secondary hover:text-text-primary transition-colors">
          ←
          Back
        </button>
        <h1 className="text-[16px] font-bold text-text-primary flex items-center gap-2">
          {fieldMeta.icon} {fieldMeta.label}
        </h1>
      </div>

      {/* Field header stats + CTAs */}
      <div className="bg-surface border-b border-border px-4 py-4">
        <div className="flex gap-8 mb-4">
          <div className="text-center">
            <p className="text-[17px] font-bold text-text-primary">{memberCount.toLocaleString()}</p>
            <p className="text-[11px] text-text-hint">Members</p>
          </div>
          <div className="text-center">
            <p className="text-[17px] font-bold text-text-primary">{postCount.toLocaleString()}</p>
            <p className="text-[11px] text-text-hint">Posts</p>
          </div>
          <div className="text-center">
            <p className="text-[17px] font-bold text-text-primary">{communities.length}</p>
            <p className="text-[11px] text-text-hint">Communities</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowUpload(true)}
            className="flex-1 py-2 rounded-[8px] text-[13px] font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: 'var(--brand)' }}
          >
            + Post here
          </button>
          <button
            onClick={() => navigate(`/explore?discipline=${discipline}`)}
            className="flex-1 py-2 rounded-[8px] text-[13px] font-semibold border border-border text-text-primary hover:bg-surface-elevated transition-colors"
          >
            Browse posts
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-border-strong border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Browse communities */}
          {communities.length > 0 && (
            <div className="px-4 py-4 border-b border-border">
              <p className="text-[13px] font-bold text-text-primary mb-3">Browse communities</p>
              <div className="grid grid-cols-2 gap-3">
                {communities.map(c => (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/c/${c.slug}`)}
                    className="bg-surface border border-border rounded-[8px] p-3 text-left hover:border-accent/30 hover:bg-surface-elevated transition-colors"
                  >
                    <p className="text-[13px] font-bold text-text-primary">{c.name}</p>
                    <p className="text-[11px] text-text-hint mt-0.5">
                      {c.post_count > 0 ? `${c.post_count.toLocaleString()} posts` : 'New'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Top posts grid */}
          {topPosts.length > 0 && (
            <div className="px-4 py-4">
              <p className="text-[13px] font-bold text-text-primary mb-3">Top posts · {fieldMeta.label}</p>

              {selectedPost ? (
                <div>
                  <button
                    onClick={() => setSelectedPost(null)}
                    className="text-[13px] font-semibold text-text-secondary hover:text-text-primary mb-3 flex items-center gap-1 transition-colors"
                  >
                    ← Back to grid
                  </button>
                  <PostCard post={selectedPost} onUpdated={load} />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-0.5 bg-border -mx-4 px-4">
                  {topPosts.map(post => {
                    const thumb = post.thumb_url || post.media_url || ''
                    const isVideo = post.content_type === 'video'
                    return (
                      <button
                        key={post.id}
                        onClick={() => setSelectedPost(post)}
                        className="relative aspect-square bg-surface-elevated overflow-hidden group"
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-text-hint text-[11px] px-1 text-center">
                            {post.caption?.slice(0, 30) || 'Post'}
                          </div>
                        )}
                        {isVideo && (
                          <div className="absolute top-1.5 left-1.5 text-white/85 text-[14px]">▷</div>
                        )}
                        {post.pro_upvote_count > 0 && (
                          <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-[#C9A84C]/85">
                            <span className="text-white text-[9px] font-bold leading-none">↑ {post.pro_upvote_count}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {communities.length === 0 && topPosts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-[15px] font-bold text-text-primary">{fieldMeta.icon} {fieldMeta.label}</p>
              <p className="text-[13px] text-text-secondary mt-2">No content yet. Be the first to post here!</p>
            </div>
          )}
        </>
      )}

      <div className="h-20 md:h-0" />

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          defaultDiscipline={discipline}
          proLocked
        />
      )}
    </div>
  )
}
