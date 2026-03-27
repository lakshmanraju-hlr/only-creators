import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Profile, PROFESSIONS } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import toast from 'react-hot-toast'

export default function RightPanel() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [suggested, setSuggested] = useState<Profile[]>([])
  const [following, setFollowing] = useState<Set<string>>(new Set())

  useEffect(() => {
    // Load suggested creators — people NOT already followed, exclude self
    async function load() {
      if (!profile) return
      // Get who we already follow
      const { data: followData } = await supabase
        .from('follows').select('following_id').eq('follower_id', profile.id)
      const followedIds = new Set((followData || []).map(r => r.following_id))
      setFollowing(followedIds)

      // Get suggested creators (verified pros)
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_pro', true)
        .neq('id', profile.id)
        .order('follower_count', { ascending: false })
        .limit(6)

      const filtered = (data || []).filter(c => !followedIds.has(c.id)) as Profile[]
      setSuggested(filtered.slice(0, 5))
    }
    load()
  }, [profile?.id])

  async function toggleFollow(targetId: string, name: string) {
    if (!profile) return
    if (following.has(targetId)) {
      await supabase.from('follows').delete().match({ follower_id: profile.id, following_id: targetId })
      setFollowing(f => { const n = new Set(f); n.delete(targetId); return n })
      toast(`Unfollowed ${name}`)
    } else {
      await supabase.from('follows').insert({ follower_id: profile.id, following_id: targetId })
      await supabase.from('notifications').insert({ user_id: targetId, actor_id: profile.id, type: 'follow' })
      setFollowing(f => new Set([...f, targetId]))
      toast.success(`Following ${name}`)
    }
  }

  function initials(name: string) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  const profMeta = profile?.profession ? PROFESSIONS[profile.profession] : null

  const TRENDING = [
    { tag: '#PortraitSunday',   count: '4.2k' },
    { tag: '#AcousticSessions', count: '2.8k' },
    { tag: '#UrbanPoetry',      count: '1.9k' },
    { tag: '#GoldenHour',       count: '1.7k' },
    { tag: '#FilmCommunity',    count: '1.4k' },
    { tag: '#NewWork',          count: '982' },
  ]

  return (
    <>
      {/* Trending */}
      <div className="rp-section">
        <div className="rp-heading">Trending</div>
        {TRENDING.map((t, i) => (
          <div key={t.tag} className="trending-item">
            <span className="trending-rank">{i + 1}</span>
            <span className="trending-name" style={{ color: 'var(--brand)' }}>{t.tag}</span>
            <span className="trending-count">{t.count}</span>
          </div>
        ))}
      </div>

      {/* Suggested creators */}
      {suggested.length > 0 && (
        <div className="rp-section">
          <div className="rp-heading">Suggested creators</div>
          {suggested.map(c => {
            const p = c.profession ? PROFESSIONS[c.profession] : null
            return (
              <div key={c.id} className="sug-user">
                <div className="sug-av" style={{ cursor: 'pointer' }} onClick={() => navigate(`/profile/${c.username}`)}>
                  {c.avatar_url ? <img src={c.avatar_url} alt="" /> : initials(c.full_name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="sug-name">{c.full_name}</div>
                  <div className="sug-role">{p ? `${p.icon} ${p.label}` : 'Creator'}</div>
                </div>
                <button
                  className={`follow-btn ${following.has(c.id) ? 'following' : ''}`}
                  onClick={() => toggleFollow(c.id, c.full_name)}
                >
                  {following.has(c.id) ? 'Following' : 'Follow'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Pro status card */}
      {profMeta && (
        <div className="rp-section">
          <div className="rp-heading">Your Pro Status</div>
          <div className="pro-status-card">
            <div style={{ fontSize: 24, marginBottom: 8 }}>{profMeta.icon}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', marginBottom: 6 }}>
              Verified {profMeta.label}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7 }}>
              Your Pro Upvotes carry peer authority. Only fellow verified {profMeta.label}s can receive them.
            </div>
          </div>
        </div>
      )}

      {/* Stack info */}
      <div style={{ background: 'var(--surf-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)', marginBottom: 10 }}>
          Built with
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {['React 18','TypeScript','Supabase','PostgreSQL','Vercel','Real-time'].map(t => (
            <span key={t} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--surf-3)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px' }}>{t}</span>
          ))}
        </div>
      </div>
    </>
  )
}
