import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/lib/AuthContext'
import { supabase, Profile } from '@/lib/supabase'
import { getPendingRequests, acceptFriendRequest, declineFriendRequest, getFriends } from '@/lib/friends'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { Icon } from '@/lib/icons'

export default function FriendsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'requests' | 'friends'>('friends')
  const [requests, setRequests] = useState<any[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [friends, setFriends] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  async function loadPendingCount(pid: string) {
    const data = await getPendingRequests(pid)
    setPendingCount(data.length)
    return data
  }

  async function load() {
    if (!profile) return
    setLoading(true)
    if (tab === 'requests') {
      const data = await loadPendingCount(profile.id)
      setRequests(data)
    } else {
      // Load friends + pending count in parallel
      const [friendIds] = await Promise.all([
        getFriends(profile.id),
        loadPendingCount(profile.id),
      ])
      if (friendIds.length === 0) { setFriends([]); setLoading(false); return }
      const { data } = await supabase.from('profiles').select('*').in('id', friendIds)
      setFriends((data || []) as Profile[])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [profile?.id, tab])

  useEffect(() => {
    if (!profile) return
    const channel = supabase.channel('friend-requests')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friend_requests', filter: 'receiver_id=eq.' + profile.id },
        () => { loadPendingCount(profile.id); if (tab === 'requests') load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id, tab])

  async function handleAccept(senderId: string, senderName: string) {
    if (!profile) return
    await acceptFriendRequest(profile.id, senderId)
    setRequests(r => r.filter(req => req.sender_id !== senderId))
    toast.success('You and ' + senderName + ' are now friends!')
  }

  async function handleDecline(senderId: string) {
    if (!profile) return
    await declineFriendRequest(profile.id, senderId)
    setRequests(r => r.filter(req => req.sender_id !== senderId))
    toast('Request declined')
  }

  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  return (
    <div className="px-8 py-6">
      <h1 className="text-[22px] font-bold text-gray-900 dark:text-white tracking-tight mb-1">Friends</h1>
      <p className="text-[13.5px] text-gray-400 dark:text-gray-500 mb-5">Friends is a mutual connection — both people must agree.</p>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-800 mb-6">
        <button
          onClick={() => setTab('friends')}
          className={`px-4 py-2.5 text-[13.5px] font-medium border-b-2 mb-[-1px] transition-colors ${
            tab === 'friends' ? 'text-brand-600 dark:text-brand-400 border-brand-600 dark:border-brand-400' : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          My friends {friends.length > 0 && <span className="text-gray-400 ml-1">({friends.length})</span>}
        </button>
        <button
          onClick={() => setTab('requests')}
          className={`px-4 py-2.5 text-[13.5px] font-medium border-b-2 mb-[-1px] transition-colors flex items-center gap-2 ${
            tab === 'requests' ? 'text-brand-600 dark:text-brand-400 border-brand-600 dark:border-brand-400' : 'text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-600 dark:hover:text-gray-300'
          }`}
        >
          Requests
          {pendingCount > 0 && <span className="text-[10px] font-semibold bg-brand-600 text-white px-1.5 py-px rounded-full">{pendingCount}</span>}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : tab === 'requests' ? (
        requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <span className="flex w-10 h-10 mb-3 text-gray-300 dark:text-gray-600"><Icon.UserPlus /></span>
            <p className="font-semibold text-gray-600 dark:text-gray-400">No pending friend requests</p>
            <p className="text-sm mt-1 text-gray-400">When someone sends you a request, it'll appear here</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {requests.map(req => {
              const sender = req.sender
              return (
                <div key={req.id} className="flex items-center gap-3.5 px-4 py-4 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xs">
                  <button onClick={() => sender?.username && navigate('/profile/' + sender.username)} className="w-12 h-12 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[15px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
                    {sender?.avatar_url ? <img src={sender.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(sender?.full_name || '?')}
                  </button>
                  <button className="flex-1 min-w-0 text-left" onClick={() => sender?.username && navigate('/profile/' + sender.username)}>
                    <p className="font-semibold text-[14px] text-gray-900 dark:text-white">{sender?.full_name}</p>
                    <p className="text-[12px] text-gray-400 dark:text-gray-500 font-mono">@{sender?.username}</p>
                    {(sender as any)?.role_title && <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{(sender as any).role_title}</p>}
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}</p>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleDecline(req.sender_id)} className="px-3.5 py-2 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      Decline
                    </button>
                    <button onClick={() => handleAccept(req.sender_id, sender?.full_name)} className="px-3.5 py-2 bg-brand-600 text-white rounded-full text-sm font-medium hover:bg-brand-700 transition-colors">
                      Accept
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        friends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <span className="flex w-10 h-10 mb-3 text-gray-300 dark:text-gray-600"><Icon.Friends /></span>
            <p className="font-semibold text-gray-600 dark:text-gray-400">No friends yet</p>
            <p className="text-sm mt-1 text-gray-400">Visit someone's profile and send them a friend request</p>
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map(f => (
              <div key={f.id} className="flex items-center gap-3.5 px-4 py-3.5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-xs hover:border-gray-200 dark:hover:border-gray-700 transition-all">
                <button onClick={() => navigate('/profile/' + f.username)} className="w-11 h-11 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[14px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
                  {f.avatar_url ? <img src={f.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(f.full_name)}
                </button>
                <button className="flex-1 min-w-0 text-left" onClick={() => navigate('/profile/' + f.username)}>
                  <p className="font-semibold text-[14px] text-gray-900 dark:text-white">{f.full_name}</p>
                  <p className="text-[12px] text-gray-400 dark:text-gray-500 font-mono">@{f.username}</p>
                  {(f as any).role_title && <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">{(f as any).role_title}</p>}
                </button>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => navigate('/messages?with=' + f.id)} className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <span className="flex w-3.5 h-3.5"><Icon.MessageCircle /></span>
                    Message
                  </button>
                  <button onClick={() => navigate('/profile/' + f.username)} className="px-3.5 py-2 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    Profile
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
