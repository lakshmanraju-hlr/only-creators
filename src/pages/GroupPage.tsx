import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, Post, Group } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import PostCard from '@/components/PostCard'
import toast from 'react-hot-toast'

export default function GroupPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [group, setGroup] = useState<Group | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
        .order('pro_upvote_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30)
      setPosts((pData || []) as Post[])
      setLoading(false)
    }
    load()
  }, [slug])

  async function deleteGroup() {
    if (!group || !profile) return
    setDeleting(true)
    // Detach posts from this group before deleting
    await supabase.from('posts').update({ group_id: null }).eq('group_id', group.id)
    const { error } = await supabase.from('groups').delete().eq('id', group.id)
    setDeleting(false)
    if (error) { toast.error('Failed to delete group: ' + error.message); return }
    toast.success('Group deleted')
    navigate(-1)
  }

  const canDelete = !!(group && profile && !group.is_seeded && group.created_by === profile.id)

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
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div className="group-header-name">#{group.name}</div>
            {group.description && <div className="group-header-desc">{group.description}</div>}
            <div className="group-header-meta">{group.post_count} posts · {group.discipline}</div>
          </div>
          {canDelete && !confirmDelete && (
            <button
              className="btn btn-ghost btn-sm"
              style={{ color:'var(--red-500)', flexShrink:0 }}
              onClick={() => setConfirmDelete(true)}
            >
              <span style={{ display:'flex', width:13, height:13 }}><Icon.Trash /></span>
              Delete
            </button>
          )}
        </div>
        {confirmDelete && (
          <div className="group-delete-confirm">
            <div style={{ fontSize:13, color:'var(--color-text-2)', marginBottom:10 }}>
              Delete this group? Posts won't be deleted, but they'll be removed from the group.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </button>
              <button className="btn btn-sm" style={{ background:'var(--red-500)', color:'#fff' }} onClick={deleteGroup} disabled={deleting}>
                {deleting ? <><span className="spinner" /> Deleting…</> : 'Yes, delete'}
              </button>
            </div>
          </div>
        )}
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
