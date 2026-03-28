import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase, Post, Profile, Group, PROFESSIONS, Profession } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import PostCard from '@/components/PostCard'
import CreateGroupModal from '@/components/CreateGroupModal'

type DisciplineIcon = () => JSX.Element

const DISCIPLINES: { key: string; Icon: DisciplineIcon; name: string; count: string }[] = [
  { key: 'photographer',  Icon: Icon.Camera,     name: 'Photography',     count: '4.1k' },
  { key: 'singer',        Icon: Icon.Mic,        name: 'Vocals & Singing', count: '2.8k' },
  { key: 'poet',          Icon: Icon.PenLine,    name: 'Poetry & Writing', count: '1.6k' },
  { key: 'visual-artist', Icon: Icon.Paintbrush, name: 'Visual Arts',      count: '3.2k' },
  { key: 'filmmaker',     Icon: Icon.Film,       name: 'Film & Video',     count: '980'  },
  { key: 'musician',      Icon: Icon.Music,      name: 'Music',            count: '2.3k' },
  { key: 'dancer',        Icon: Icon.Star,       name: 'Dance',            count: '1.1k' },
  { key: 'comedian',      Icon: Icon.Drama,      name: 'Performance',      count: '740'  },
]

export default function ExplorePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedDiscipline = searchParams.get('discipline') as Profession | null
  const [posts, setPosts] = useState<Post[]>([])
  const [creators, setCreators] = useState<Profile[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'posts' | 'creators' | 'groups'>('posts')
  const [showCreateGroup, setShowCreateGroup] = useState(false)

  useEffect(() => {
    if (!selectedDiscipline) return
    async function load() {
      setLoading(true)
      if (view === 'posts') {
        const { data: du } = await supabase.from('profiles').select('id').eq('profession', selectedDiscipline)
        const uids = (du || []).map((u: any) => u.id)
        if (uids.length === 0) { setPosts([]); setLoading(false); return }
        const { data } = await supabase.from('posts').select('*, profiles(*), group:group_id(*)').in('user_id', uids).order('pro_upvote_count', { ascending: false }).limit(20)
        setPosts((data || []) as Post[])
      } else if (view === 'creators') {
        const { data } = await supabase.from('profiles').select('*').eq('profession', selectedDiscipline).order('follower_count', { ascending: false }).limit(30)
        setCreators((data || []) as Profile[])
      } else {
        const { data } = await supabase.from('groups').select('*').eq('discipline', selectedDiscipline).order('post_count', { ascending: false })
        setGroups((data || []) as Group[])
      }
      setLoading(false)
    }
    load()
  }, [selectedDiscipline, view])

  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  if (selectedDiscipline) {
    const meta = PROFESSIONS[selectedDiscipline]
    const disc = DISCIPLINES.find(d => d.key === selectedDiscipline)
    return (
      <div style={{ maxWidth:640, margin:'0 auto', padding:'20px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSearchParams({})}>
            <span style={{ display:'flex', width:14, height:14 }}><Icon.ArrowLeft /></span> Back
          </button>
          {disc && <div style={{ width:36, height:36, background:'var(--color-primary-light)', borderRadius:'var(--r-md)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <span style={{ display:'flex', width:18, height:18, color:'var(--color-primary)' }}><disc.Icon /></span>
          </div>}
          <div>
            <div style={{ fontWeight:600, fontSize:16 }}>{meta?.label}</div>
            <div style={{ fontSize:12, color:'var(--color-text-3)' }}>Verified professionals</div>
          </div>
        </div>
        <div className="feed-tabs" style={{ marginBottom:18 }}>
          <div className={`feed-tab ${view === 'posts' ? 'active' : ''}`} onClick={() => setView('posts')}>Top posts</div>
          <div className={`feed-tab ${view === 'creators' ? 'active' : ''}`} onClick={() => setView('creators')}>Creators</div>
          <div className={`feed-tab ${view === 'groups' ? 'active' : ''}`} onClick={() => setView('groups')}>Groups</div>
        </div>
        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : view === 'posts' ? (
          posts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">{disc && <disc.Icon />}</div>
              <div className="empty-title">No posts yet</div>
              <div className="empty-sub">Be the first verified {meta?.label} to post</div>
            </div>
          ) : posts.map(p => <PostCard key={p.id} post={p} />)
        ) : view === 'creators' ? (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {creators.length === 0 ? (
              <div className="empty-state"><div className="empty-title">No verified {meta?.label}s yet</div></div>
            ) : creators.map(c => (
              <div key={c.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', background:'var(--gray-0)', border:'1px solid var(--color-border)', borderRadius:'var(--r-xl)', boxShadow:'var(--shadow-xs)' }}>
                <div className="post-avatar" style={{ width:44, height:44, fontSize:15, flexShrink:0 }}>
                  {c.avatar_url ? <img src={c.avatar_url} alt="" /> : initials(c.full_name)}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{c.full_name}</div>
                  <div style={{ fontSize:12, color:'var(--color-text-3)', fontFamily:'var(--font-mono)' }}>@{c.username}</div>
                  {c.bio && <div style={{ fontSize:13, color:'var(--color-text-2)', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.bio}</div>}
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontWeight:600, fontSize:16 }}>{c.follower_count}</div>
                  <div style={{ fontSize:10, color:'var(--color-text-3)', textTransform:'uppercase', letterSpacing:'0.05em' }}>followers</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {profile?.profession === selectedDiscipline && (
              <button className="btn btn-primary btn-sm" style={{ alignSelf:'flex-end' }} onClick={() => setShowCreateGroup(true)}>
                <span style={{ display:'flex', width:13, height:13 }}><Icon.Plus /></span>
                New group
              </button>
            )}
            {groups.length === 0 ? (
              <div className="empty-state"><div className="empty-title">No groups yet</div></div>
            ) : groups.map(g => (
              <div key={g.id} className="group-card" onClick={() => navigate('/groups/' + g.slug)}>
                <div className="group-card-name">{g.name}</div>
                <div className="group-card-desc">{g.description}</div>
                <div className="group-card-meta">{g.post_count} posts</div>
              </div>
            ))}
          </div>
        )}
        {showCreateGroup && selectedDiscipline && (
          <CreateGroupModal
            discipline={selectedDiscipline}
            onClose={() => setShowCreateGroup(false)}
            onCreated={g => { setGroups(gs => [g, ...gs]); setShowCreateGroup(false) }}
          />
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth:820, margin:'0 auto', padding:'20px 20px' }}>
      <div style={{ fontSize:22, fontWeight:600, letterSpacing:'-0.4px', marginBottom:4 }}>Explore disciplines</div>
      <div style={{ fontSize:13.5, color:'var(--color-text-3)', marginBottom:24 }}>Discover verified creators across every creative field</div>
      <div className="explore-grid">
        {DISCIPLINES.map(d => (
          <div key={d.key} className="explore-card" onClick={() => setSearchParams({ discipline: d.key })}>
            <div className="explore-icon-wrap"><span style={{ display:'flex', width:22, height:22 }}><d.Icon /></span></div>
            <div className="explore-name">{d.name}</div>
            <div className="explore-count">{d.count} creators</div>
            <div className="explore-pro">Pro verified</div>
          </div>
        ))}
      </div>
    </div>
  )
}
