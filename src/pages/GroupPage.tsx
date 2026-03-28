import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, Post, Group } from '@/lib/supabase'
import { Icon } from '@/lib/icons'
import PostCard from '@/components/PostCard'

export default function GroupPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [group, setGroup] = useState<Group | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    async function load() {
      setLoading(true)
      const { data: gData } = await supabase.from('groups').select('*').eq('slug', slug).single()
      if (!gData) { setLoading(false); return }
      setGroup(gData as Group)
      const { data: pData } = await supabase
        .from('posts')
        .select('*, profiles(*), group:group_id(*)')
        .eq('group_id', gData.id)
        .order('created_at', { ascending: false })
        .limit(30)
      setPosts((pData || []) as Post[])
      setLoading(false)
    }
    load()
  }, [slug])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!group) return (
    <div className="empty-state" style={{ marginTop:60 }}>
      <div className="empty-title">Group not found</div>
      <button className="btn btn-ghost btn-sm" style={{ marginTop:12 }} onClick={() => navigate('/explore')}>Back to Explore</button>
    </div>
  )

  return (
    <div style={{ maxWidth:640, margin:'0 auto', padding:'20px 16px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
          <span style={{ display:'flex', width:14, height:14 }}><Icon.ArrowLeft /></span> Back
        </button>
      </div>

      <div className="group-header">
        <div className="group-header-name">#{group.name}</div>
        {group.description && <div className="group-header-desc">{group.description}</div>}
        <div className="group-header-meta">{group.post_count} posts · {group.discipline}</div>
      </div>

      <div style={{ marginTop:20 }}>
        {posts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No posts in this group yet</div>
            <div className="empty-sub">Be the first to post here</div>
          </div>
        ) : (
          posts.map(p => (
            <PostCard
              key={p.id}
              post={p}
              onUpdated={() => setPosts(ps => ps.filter(x => x.id !== p.id))}
            />
          ))
        )}
      </div>
    </div>
  )
}
