import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Profile, getProfMeta } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

export default function RightPanel() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [suggested, setSuggested] = useState<Profile[]>([])
  const [following, setFollowing] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!profile) return
    async function load() {
      const { data: followData } = await supabase.from('follows').select('following_id').eq('follower_id', profile!.id)
      const followedIds = new Set((followData || []).map((r: any) => r.following_id))
      setFollowing(followedIds)
      const { data } = await supabase.from('profiles').select('*').neq('id', profile!.id).order('follower_count', { ascending: false }).limit(8)
      const filtered = (data || []).filter((c: any) => !followedIds.has(c.id)).slice(0, 5) as Profile[]
      setSuggested(filtered)
    }
    load()
  }, [profile?.id])

  async function toggleFollow(targetId: string, name: string) {
    if (!profile) return
    if (following.has(targetId)) {
      await supabase.from('follows').delete().match({ follower_id: profile.id, following_id: targetId })
      setFollowing(f => { const n = new Set(f); n.delete(targetId); return n }); toast(`Unfollowed ${name}`)
    } else {
      await supabase.from('follows').insert({ follower_id: profile.id, following_id: targetId })
      await supabase.from('notifications').insert({ user_id: targetId, actor_id: profile.id, type: 'follow' })
      setFollowing(f => new Set([...f, targetId])); toast.success(`Following ${name}`)
    }
  }

  function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  const TRENDING = [
    { tag: '#PortraitSunday', count: '4.2k' }, { tag: '#AcousticSessions', count: '2.8k' },
    { tag: '#UrbanPoetry', count: '1.9k' }, { tag: '#GoldenHour', count: '1.7k' },
    { tag: '#FilmCommunity', count: '1.4k' }, { tag: '#NewWork', count: '982' },
  ]

  return (
    <>
      <div className="rp-section">
        <div className="rp-heading">Trending</div>
        {TRENDING.map((t, i) => (
          <div key={t.tag} className="trending-item">
            <span className="trending-rank">{i + 1}</span>
            <span className="trending-name">{t.tag}</span>
            <span className="trending-count">{t.count}</span>
          </div>
        ))}
      </div>

      {suggested.length > 0 && (
        <div className="rp-section">
          <div className="rp-heading">Suggested creators</div>
          {suggested.map(c => {
            const p = getProfMeta(c.profession)
            return (
              <div key={c.id} className="sug-user">
                <div className="sug-av" style={{ cursor:'pointer' }} onClick={() => navigate(`/profile/${c.username}`)}>
                  {c.avatar_url ? <img src={c.avatar_url} alt="" /> : initials(c.full_name)}
                </div>
                <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => navigate(`/profile/${c.username}`)}>
                  <div className="sug-name">{c.full_name}</div>
                  <div className="sug-role">{p ? p.label : 'Creator'}</div>
                </div>
                <button className={`follow-btn ${following.has(c.id) ? 'following' : ''}`} onClick={() => toggleFollow(c.id, c.full_name)}>
                  {following.has(c.id) ? 'Following' : 'Follow'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {profile?.profession && (() => { const pm = getProfMeta(profile.profession); return pm ? (
        <div className="rp-section">
          <div className="rp-heading">Your Pro Status</div>
          <div style={{ background:'var(--color-pro-light)', border:'1px solid var(--color-pro-border)', borderRadius:'var(--r-lg)', padding:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <span style={{ display:'flex', width:16, height:16, color:'var(--color-pro)' }}><Icon.Award /></span>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--amber-600)' }}>{pm.label}</span>
            </div>
            <div style={{ fontSize:12, color:'var(--gray-600)', lineHeight:1.7 }}>
              Your Pro Upvotes carry peer authority. Only other verified {pm.label}s receive them.
            </div>
          </div>
        </div>
      ) : null })()}
    </>
  )
}
