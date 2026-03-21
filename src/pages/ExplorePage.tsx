import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, Post, Profile, PROFESSIONS, Profession } from '@/lib/supabase'
import PostCard from '@/components/PostCard'

const DISCIPLINES = [
  { key: 'photographer',  icon: '📸', name: 'Photography',     count: '4.1k' },
  { key: 'singer',        icon: '🎤', name: 'Vocals & Singing', count: '2.8k' },
  { key: 'poet',          icon: '✍️', name: 'Poetry & Writing', count: '1.6k' },
  { key: 'visual-artist', icon: '🎨', name: 'Visual Arts',      count: '3.2k' },
  { key: 'filmmaker',     icon: '🎬', name: 'Film & Video',     count: '980'  },
  { key: 'musician',      icon: '🎸', name: 'Music',            count: '2.3k' },
  { key: 'dancer',        icon: '💃', name: 'Dance',            count: '1.1k' },
  { key: 'comedian',      icon: '🎭', name: 'Performance',      count: '740'  },
]

export default function ExplorePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedDiscipline = searchParams.get('discipline') as Profession | null
  const [posts, setPosts] = useState<Post[]>([])
  const [creators, setCreators] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'posts' | 'creators'>('posts')

  useEffect(() => {
    if (!selectedDiscipline) return

    async function load() {
      setLoading(true)

      if (view === 'posts') {
        const { data: disciplineUsers } = await supabase
          .from('profiles')
          .select('id')
          .eq('profession', selectedDiscipline)

        const userIds = (disciplineUsers || []).map((u: any) => u.id)

        if (userIds.length === 0) {
          setPosts([])
          setLoading(false)
          return
        }

        const { data } = await supabase
          .from('posts')
          .select('*, profiles(*)')
          .in('user_id', userIds)
          .order('pro_upvote_count', { ascending: false })
          .limit(20)

        setPosts((data || []) as Post[])
      } else {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('profession', selectedDiscipline)
          .order('follower_count', { ascending: false })
          .limit(30)

        setCreators((data || []) as Profile[])
      }

      setLoading(false)
    }

    load()
  }, [selectedDiscipline, view])

  function initials(name: string) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  if (selectedDiscipline) {
    const meta = PROFESSIONS[selectedDiscipline]
    return (
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setSearchParams({})}>← Back</button>
          <span style={{ fontSize: 28 }}>{meta?.icon}</span>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22 }}>{meta?.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Verified professionals</div>
          </div>
        </div>

        <div className="feed-tabs" style={{ marginBottom: 20 }}>
          <div className={`feed-tab ${view === 'posts' ? 'active' : ''}`} onClick={() => setView('posts')}>Top posts</div>
          <div className={`feed-tab ${view === 'creators' ? 'active' : ''}`} onClick={() => setView('creators')}>Creators</div>
        </div>

        {loading ? (
          <div className="loading-center"><div className="spinner" /></div>
        ) : view === 'posts' ? (
          posts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">{meta?.icon}</div>
              <div className="empty-title">No posts yet in this discipline</div>
              <div className="empty-sub">Be the first to post as a verified {meta?.label}</div>
            </div>
          ) : (
            posts.map(p => <PostCard key={p.id} post={p} />)
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {creators.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">{meta?.icon}</div>
                <div className="empty-title">No verified {meta?.label}s yet</div>
              </div>
            ) : creators.map(c => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                background: 'var(--surf-1)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-xl)', marginBottom: 8,
              }}>
                <div className="post-avatar" style={{ width: 46, height: 46, fontSize: 15, flexShrink: 0 }}>
                  {c.avatar_url ? <img src={c.avatar_url} alt="" /> : initials(c.full_name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>@{c.username}</div>
                  {c.bio && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.bio}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{c.follower_count}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>followers</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 30, marginBottom: 4 }}>Explore disciplines</div>
      <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 28 }}>Discover verified creators across every creative field</div>
      <div className="explore-grid">
        {DISCIPLINES.map(d => (
          <div key={d.key} className="explore-card" onClick={() => setSearchParams({ discipline: d.key })}>
            <div className="explore-icon">{d.icon}</div>
            <div className="explore-name">{d.name}</div>
            <div className="explore-count">{d.count} creators</div>
            <div className="explore-pro">◆ Pro verified</div>
          </div>
        ))}
      </div>
    </div>
  )
}
