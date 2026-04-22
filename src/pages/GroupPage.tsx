import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, Post, Group, getProfMeta } from '@/lib/supabase'
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
  const groupIdRef = useRef<string | null>(null)
  const groupRef = useRef<Group | null>(null)

  const reloadPosts = useCallback(async () => {
    const gid = groupIdRef.current
    if (!gid) return
    const { data, error } = await supabase.from('posts')
      .select('*, profiles!user_id(*)')
      .eq('group_id', gid)
      .order('created_at', { ascending: false })
      .limit(40)
    if (error) console.error('[GroupPage] reloadPosts error:', error)
    const g = groupRef.current
    setPosts(((data || []) as Post[]).map(p => ({ ...p, group: g ?? undefined })))
    const [gRes, mRes] = await Promise.all([
      supabase.from('groups').select('*').eq('id', gid).single(),
      supabase.from('group_members').select('user_id', { count: 'exact', head: true }).eq('group_id', gid),
    ])
    if (gRes.data) {
      const updated = { ...(gRes.data as Group), member_count: mRes.count ?? (gRes.data as Group).member_count }
      setGroup(updated)
      groupRef.current = updated
    }
  }, [])

  useEffect(() => {
    if (!slug) return
    async function load() {
      setLoading(true)
      const { data: gData } = await supabase.from('groups').select('*').eq('slug', slug).single()
      if (!gData) { setLoading(false); return }
      setGroup(gData as Group)
      groupIdRef.current = gData.id
      groupRef.current = gData as Group

      const [postsRes, memberRes, countRes] = await Promise.all([
        supabase.from('posts')
          .select('*, profiles!user_id(*)')
          .eq('group_id', gData.id)
          .order('created_at', { ascending: false })
          .limit(40),
        profile
          ? supabase.from('group_members').select('user_id').eq('group_id', gData.id).eq('user_id', profile.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('group_members').select('user_id', { count: 'exact', head: true }).eq('group_id', gData.id),
      ])
      if (postsRes.error) console.error('[GroupPage] load posts error:', postsRes.error)
      setPosts(((postsRes.data || []) as Post[]).map(p => ({ ...p, group: gData as Group })))
      setIsMember(!!memberRes.data)
      if (countRes.count !== null) {
        setGroup(g => g ? { ...g, member_count: countRes.count! } : g)
      }
      setLoading(false)
    }
    load()
  }, [slug, profile?.id])

  useEffect(() => {
    if (!group?.id) return
    const ch = supabase.channel('group-posts-' + group.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: 'group_id=eq.' + group.id },
        () => setTimeout(() => reloadPosts(), 300))
      .subscribe()
    const handler = () => reloadPosts()
    window.addEventListener('oc:post-created', handler)
    return () => { supabase.removeChannel(ch); window.removeEventListener('oc:post-created', handler) }
  }, [group?.id, reloadPosts])

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
      // Auto-create a discipline persona when joining a group — unlocks Pro posting in that discipline
      if (group.discipline) {
        await supabase.from('discipline_personas').upsert(
          { user_id: profile.id, discipline: group.discipline, level: 'newcomer' },
          { onConflict: 'user_id,discipline', ignoreDuplicates: true }
        )
      }
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

  const isCreator = !!(group && profile && group.created_by === profile.id)
  const canDelete = isCreator && !group?.is_seeded

  function initials(n: string | undefined) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  if (loading) return (
    <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
  )
  if (!group) return (
    <div className="flex flex-col items-center justify-center py-20">
      <p className="font-semibold text-gray-600 dark:text-gray-400">Group not found</p>
      <button className="mt-3 text-[13px] text-brand-600 font-medium" onClick={() => navigate('/explore')}>Back to Explore</button>
    </div>
  )

  return (
    <div className="max-w-[700px] mx-auto px-8 py-6">
      <button
        className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-5 transition-colors"
        onClick={() => navigate(-1)}
      >
        <span className="flex w-3.5 h-3.5"><Icon.ArrowLeft /></span> Back
      </button>

      {/* Group header card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl p-5 mb-5 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-[22px] font-bold text-gray-900 dark:text-white tracking-tight">{group.name}</h1>
            {group.description && <p className="text-[13.5px] text-gray-500 dark:text-gray-400 mt-1">{group.description}</p>}
            <p className="text-[12px] text-gray-400 dark:text-gray-500 mt-2">
              {group.post_count} post{group.post_count === 1 ? '' : 's'}
              {' · '}
              {group.member_count} member{group.member_count === 1 ? '' : 's'}
              {' · '}
              <span>{getProfMeta(group.discipline)?.label ?? group.discipline}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {profile && (isMember || isCreator) && (
              <button
                className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-full text-[13px] font-medium transition-colors"
                onClick={() => setShowUpload(true)}
              >
                <span className="flex w-3 h-3"><Icon.Plus /></span>
                Post here
              </button>
            )}
            {profile && !isCreator && (
              <button
                onClick={toggleMembership}
                disabled={joining}
                className={`px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors ${
                  isMember
                    ? 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    : 'bg-brand-600 hover:bg-brand-700 text-white'
                }`}
              >
                {joining ? <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" /> : isMember ? 'Leave' : 'Join'}
              </button>
            )}
            {canDelete && !confirmDelete && (
              <button
                className="flex w-8 h-8 items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950 rounded-full transition-colors"
                onClick={() => setConfirmDelete(true)}
              >
                <span className="flex w-3.5 h-3.5"><Icon.Trash /></span>
              </button>
            )}
          </div>
        </div>

        {confirmDelete && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
            <p className="text-[13px] text-gray-600 dark:text-gray-400 mb-3">
              Delete this group? Posts won't be deleted, but they'll be removed from the group.
            </p>
            <div className="flex gap-2">
              <button
                className="px-3.5 py-2 border border-gray-200 dark:border-gray-700 rounded-full text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                onClick={() => setConfirmDelete(false)} disabled={deleting}
              >Cancel</button>
              <button
                className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full text-[13px] font-medium transition-colors flex items-center gap-1.5"
                onClick={deleteGroup} disabled={deleting}
              >
                {deleting ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Deleting…</> : 'Yes, delete'}
              </button>
            </div>
          </div>
        )}

        {isCreator && (
          <div className="flex items-center gap-1.5 mt-3 text-[11px] font-semibold text-brand-600">
            <span className="flex w-3 h-3"><Icon.Award /></span>
            You created this group
          </div>
        )}
      </div>

      {/* Posts */}
      {posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <p className="font-semibold text-gray-600 dark:text-gray-400">No posts in this group yet</p>
          {profile && (isMember || isCreator) ? (
            <button className="mt-3 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-full text-[13px] font-medium transition-colors" onClick={() => setShowUpload(true)}>
              Be the first to post
            </button>
          ) : profile ? (
            <p className="text-sm mt-1 text-gray-400">Join the group to post here</p>
          ) : null}
        </div>
      ) : (
        posts.map(p => <PostCard key={p.id} post={p} onUpdated={reloadPosts} />)
      )}

      {showUpload && (
        <UploadModal
          onClose={() => { setShowUpload(false); setTimeout(() => reloadPosts(), 600) }}
          defaultGroup={group}
          defaultDiscipline={group.discipline ?? undefined}
          proLocked
        />
      )}
    </div>
  )
}
