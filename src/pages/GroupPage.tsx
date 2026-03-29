import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, Post, Group, Profile } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import PostCard from '@/components/PostCard'
import UploadModal from '@/components/UploadModal'
import toast from 'react-hot-toast'

export default function GroupPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [group, setGroup] = useState<Group | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [isMember, setIsMember] = useState(false)
  const [joining, setJoining] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!slug) return
    async function load() {
      setLoading(true)
      const { data: gData } = await supabase.from('groups').select('*').eq('slug', slug).single()
      if (!gData) { setLoading(false); return }
      setGroup(gData as Group)

      const [postsRes, memberRes] = await Promise.all([
        supabase.from('posts')
          .select('*, profiles(*), group:group_id(*)')
          .eq('group_id', gData.id)
          .order('pro_upvote_count', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(40),
        profile
          ? supabase.from('group_members').select('user_id').eq('group_id', gData.id).eq('user_id', profile.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      setPosts((postsRes.data || []) as Post[])
      setIsMember(!!memberRes.data)
      setLoading(false)
    }
    load()
  }, [slug, profile?.id])

  async function toggleMembership() {
    if (!profile || !group) return
    setJoining(true)
    if (isMember) {
      const { error } = await supabase.from('group_members').delete().match({ group_id: group.id, user_id: profile.id })
      if (error) { toast.error(error.message); setJoining(false); return }
      setIsMember(false)
      setGroup(g => g ? { ...g, member_count: Math.max(0, g.member_count - 1) } : g)
      toast('Left ' + group.name)
    } else {
      const { error } = await supabase.from('group_members').insert({ group_id: group.id, user_id: profile.id })
      if (error) { toast.error(error.message); setJoining(false); return }
      setIsMember(true)
      setGroup(g => g ? { ...g, member_count: g.member_count + 1 } : g)
      toast.success('Joined ' + group.name + '!')
    }
    setJoining(false)
  }

  async function deleteGroup() {
    if (!group || !profile) return
    setDeleting(true)
    await supabase.from('posts').update({ group_id: null }).eq('group_id', group.id)
    const { error } = await supabase.from('groups').delete().eq('id', group.id)
    setDeleting(false)
    if (error) { toast.error('Failed to delete group: ' + error.message); return }
    toast.success('Group deleted')
    navigate(-1)
  }

  function reloadPosts() {
    if (!group) return
    supabase.from('posts')
      .select('*, profiles(*), group:group_id(*)')
      .eq('group_id', group.id)
      .order('pro_upvote_count', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(40)
      .then(({ data }) => setPosts((data || []) as Post[]))
  }

  const isCreator = !!(group && profile && group.created_by === profile.id)
  const canDelete = isCreator && !group?.is_seeded

  function initials(n: string | undefined) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

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
            <div className="group-header-name">{group.name}</div>
            {group.description && <div className="group-header-desc">{group.description}</div>}
            <div className="group-header-meta">
              {group.post_count} post{group.post_count === 1 ? '' : 's'}
              {' · '}
              {group.member_count} member{group.member_count === 1 ? '' : 's'}
              {' · '}
              <span style={{ color:'var(--color-text-3)' }}>{group.discipline}</span>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
            {/* Post in group — available to members and creator */}
            {(isMember || isCreator) && (
              <button className="btn btn-primary btn-sm" style={{ gap:5 }} onClick={() => setShowUpload(true)}>
                <span style={{ display:'flex', width:13, height:13 }}><Icon.Plus /></span>
                Post here
              </button>
            )}
            {/* Join / Leave — not shown to creator */}
            {profile && !isCreator && (
              <button
                className={isMember ? 'btn btn-ghost btn-sm' : 'btn btn-sm'}
                style={isMember ? { color:'var(--color-text-2)' } : { background:'var(--color-primary)', color:'#fff' }}
                onClick={toggleMembership}
                disabled={joining}
              >
                {joining ? <span className="spinner" /> : isMember ? 'Leave' : 'Join'}
              </button>
            )}
            {canDelete && !confirmDelete && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ color:'var(--red-500)' }}
                onClick={() => setConfirmDelete(true)}
              >
                <span style={{ display:'flex', width:13, height:13 }}><Icon.Trash /></span>
              </button>
            )}
          </div>
        </div>

        {confirmDelete && (
          <div className="group-delete-confirm">
            <div style={{ fontSize:13, color:'var(--color-text-2)', marginBottom:10 }}>
              Delete this group? Posts won't be deleted, but they'll be removed from the group.
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</button>
              <button className="btn btn-sm" style={{ background:'var(--red-500)', color:'#fff' }} onClick={deleteGroup} disabled={deleting}>
                {deleting ? <><span className="spinner" /> Deleting…</> : 'Yes, delete'}
              </button>
            </div>
          </div>
        )}

        {/* Creator badge */}
        {isCreator && (
          <div style={{ marginTop:10, fontSize:11, color:'var(--color-primary)', fontWeight:600, display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ display:'flex', width:11, height:11 }}><Icon.Award /></span>
            You created this group
          </div>
        )}
      </div>

      <div style={{ marginTop:20 }}>
        {posts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No posts in this group yet</div>
            {(isMember || isCreator) ? (
              <div style={{ marginTop:12 }}>
                <button className="btn btn-primary btn-sm" onClick={() => setShowUpload(true)}>Be the first to post</button>
              </div>
            ) : (
              <div className="empty-sub">Join the group to post here</div>
            )}
          </div>
        ) : (
          posts.map(p => (
            <PostCard
              key={p.id}
              post={p}
              onUpdated={reloadPosts}
            />
          ))
        )}
      </div>

      {showUpload && (
        <UploadModal
          onClose={() => { setShowUpload(false); reloadPosts() }}
          defaultGroup={group}
        />
      )}
    </div>
  )
}
