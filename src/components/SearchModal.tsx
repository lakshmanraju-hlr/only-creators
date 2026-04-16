import { useState, useEffect, useRef } from 'react'
import { useLazyLoad } from '@/hooks/useLazyLoad'
import { useNavigate } from 'react-router-dom'
import { supabase, Profile } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { getFriendStatus, sendFriendRequest, acceptFriendRequest, declineFriendRequest } from '@/lib/friends'
import toast from 'react-hot-toast'
import { Icon } from '@/lib/icons'

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
      .select('id, username, full_name, avatar_url, profession, role_title, is_pro, follower_count, friend_count')
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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm px-4 pt-20"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[560px] bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-800">

        {/* Search input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <span className="flex w-[18px] h-[18px] text-gray-400 shrink-0"><Icon.Search /></span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or @username…"
            className="flex-1 bg-transparent outline-none text-[15px] text-gray-900 dark:text-white placeholder:text-gray-400"
            onKeyDown={e => e.key === 'Escape' && onClose()}
          />
          {query && (
            <button onClick={() => setQuery('')} className="flex w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors">
              <Icon.X />
            </button>
          )}
        </div>

        {/* Results */}
        <div className="max-h-[480px] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : results.length === 0 && query ? (
            <div className="flex flex-col items-center py-10 px-6">
              <span className="flex w-8 h-8 text-gray-300 dark:text-gray-600 mb-2.5"><Icon.Search /></span>
              <p className="text-[14px] text-gray-500 dark:text-gray-400">No creators found for <strong className="text-gray-700 dark:text-gray-300">"{query}"</strong></p>
            </div>
          ) : results.length === 0 ? (
            <p className="text-center py-10 px-6 text-[14px] text-gray-400">Type a name or username to search creators</p>
          ) : (
            results.map((p, i) => {
              const status = friendStatuses[p.id] || 'none'
              const btn = friendBtn[status]
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3.5 px-5 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${i < results.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}`}
                >
                  <button
                    className="w-11 h-11 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[15px] font-semibold text-blue-700 dark:text-blue-300 shrink-0"
                    onClick={() => goToProfile(p.username)}
                  >
                    {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : initials(p.full_name)}
                  </button>
                  <button className="flex-1 min-w-0 text-left" onClick={() => goToProfile(p.username)}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-[14px] text-gray-900 dark:text-white">{p.full_name}</span>
                      {status === 'friends' && (
                        <span className="text-[9px] font-semibold px-1.5 py-px bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full">✦ Friends</span>
                      )}
                    </div>
                    <p className="text-[12px] text-gray-400 dark:text-gray-500 font-mono">@{p.username}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {(p as any).role_title && <span className="text-[12px] text-gray-500 dark:text-gray-400">{(p as any).role_title}</span>}
                      <span className="text-[11px] text-gray-400">{p.follower_count} followers</span>
                    </div>
                  </button>
                  <div className="flex gap-1.5 shrink-0">
                    {status !== 'friends' && (
                      <button
                        onClick={() => handleFriendAction(p)}
                        className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
                          btn.cls === 'btn-primary'
                            ? 'bg-brand-600 hover:bg-brand-700 text-white'
                            : 'border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                      >
                        {btn.label}
                      </button>
                    )}
                    <button
                      onClick={() => goToProfile(p.username)}
                      className="px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
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
        <div className="flex gap-4 px-5 py-2.5 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-400">
          <span>↵ View profile</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  )
}
