import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Profile, PROFESSIONS } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { getFriendStatus, sendFriendRequest, acceptFriendRequest, declineFriendRequest } from '@/lib/friends'
import toast from 'react-hot-toast'

interface Props { onClose: () => void }

export default function SearchModal({ onClose }: Props) {
  const { profile: me } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [friendStatuses, setFriendStatuses] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(() => search(query.trim()), 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  async function search(q: string) {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, profession, is_pro, follower_count, friend_count')
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .neq('id', me?.id || '')
      .limit(10)

    const found = (data || []) as Profile[]
    setResults(found)

    // Load friend statuses for all results
    if (me && found.length > 0) {
      const statuses: Record<string, string> = {}
      await Promise.all(found.map(async (p) => {
        statuses[p.id] = await getFriendStatus(me.id, p.id)
      }))
      setFriendStatuses(statuses)
    }
    setLoading(false)
  }

  async function handleFriendAction(target: Profile) {
    if (!me) return
    const status = friendStatuses[target.id] || 'none'
    try {
      if (status === 'none') {
        await sendFriendRequest(me.id, target.id, target.full_name)
        setFriendStatuses(s => ({ ...s, [target.id]: 'pending_sent' }))
        toast.success(`Friend request sent to ${target.full_name}`)
      } else if (status === 'pending_sent') {
        await declineFriendRequest(me.id, target.id)
        setFriendStatuses(s => ({ ...s, [target.id]: 'none' }))
        toast('Request cancelled')
      } else if (status === 'pending_received') {
        await acceptFriendRequest(me.id, target.id)
        setFriendStatuses(s => ({ ...s, [target.id]: 'friends' }))
        toast.success(`You and ${target.full_name} are now friends! 🎉`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    }
  }

  function goToProfile(username: string) {
    navigate(`/profile/${username}`)
    onClose()
  }

  function initials(name: string) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  const friendBtn: Record<string, { label: string; cls: string }> = {
    none:             { label: '+ Add friend',      cls: 'btn-ghost' },
    pending_sent:     { label: 'Requested ✕',        cls: 'btn-ghost' },
    pending_received: { label: '✓ Accept',           cls: 'btn-primary' },
    friends:          { label: '✦ Friends',          cls: 'btn-gold' },
  }

  return (
    <div
      className="modal-overlay"
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ alignItems: 'flex-start', paddingTop: 80 }}
    >
      <div className="modal" style={{ width: 560, padding: 0, overflow: 'hidden' }}>

        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ color: 'var(--text-3)', fontSize: 18, flexShrink: 0 }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or @username…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 15, fontFamily: 'var(--font-sans)',
            }}
            onKeyDown={e => e.key === 'Escape' && onClose()}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ color: 'var(--text-3)', fontSize: 18, padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          )}
        </div>

        {/* Results */}
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <div className="spinner" />
            </div>
          ) : results.length === 0 && query ? (
            <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-3)' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>◎</div>
              <div style={{ fontSize: 14 }}>No creators found for <strong style={{ color: 'var(--text-2)' }}>"{query}"</strong></div>
            </div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-3)', fontSize: 14 }}>
              Type a name or username to search creators
            </div>
          ) : (
            results.map((p, i) => {
              const prof = p.profession ? PROFESSIONS[p.profession as keyof typeof PROFESSIONS] : null
              const status = friendStatuses[p.id] || 'none'
              const btn = friendBtn[status]
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 20px',
                    borderBottom: i < results.length - 1 ? '1px solid var(--border)' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surf-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Avatar — click to view profile */}
                  <div
                    className="post-avatar"
                    style={{ width: 44, height: 44, fontSize: 15, flexShrink: 0, cursor: 'pointer' }}
                    onClick={() => goToProfile(p.username)}
                  >
                    {p.avatar_url ? <img src={p.avatar_url} alt="" /> : initials(p.full_name)}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => goToProfile(p.username)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{p.full_name}</span>
                      {status === 'friends' && <span className="pro-chip" style={{ fontSize: 9 }}>✦ Friends</span>}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>@{p.username}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      {prof && (
                        <span className={`pill pill-${prof.pillClass}`} style={{ fontSize: 10 }}>
                          {prof.icon} {prof.label}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {p.follower_count} followers
                      </span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {status !== 'friends' && (
                      <button
                        className={`btn btn-sm ${btn.cls}`}
                        onClick={() => handleFriendAction(p)}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {btn.label}
                      </button>
                    )}
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => goToProfile(p.username)}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      View profile
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer hint */}
        <div style={{
          padding: '10px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-3)',
        }}>
          <span>↵ View profile</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  )
}
