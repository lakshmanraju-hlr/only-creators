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
  const [tab, setTab] = useState<'requests' | 'friends'>('requests')
  const [requests, setRequests] = useState<any[]>([])
  const [friends, setFriends] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!profile) return
    setLoading(true)
    if (tab === 'requests') {
      const data = await getPendingRequests(profile.id)
      setRequests(data)
    } else {
      const friendIds = await getFriends(profile.id)
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
        () => { if (tab === 'requests') load() })
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
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, marginBottom: 4 }}>Friends</div>
      <div style={{ fontSize: 13.5, color: 'var(--color-text-3)', marginBottom: 20 }}>
        Friends is a mutual connection — both people must agree.
      </div>

      <div className="feed-tabs" style={{ marginBottom: 24 }}>
        <div className={'feed-tab ' + (tab === 'requests' ? 'active' : '')} onClick={() => setTab('requests')}>
          Friend requests {requests.length > 0 && tab !== 'requests' && <span className="nav-badge" style={{ marginLeft: 6 }}>{requests.length}</span>}
        </div>
        <div className={'feed-tab ' + (tab === 'friends' ? 'active' : '')} onClick={() => setTab('friends')}>
          My friends {friends.length > 0 && <span style={{ color: 'var(--color-text-3)', marginLeft: 4 }}>({friends.length})</span>}
        </div>
      </div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : tab === 'requests' ? (
        requests.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Icon.UserPlus /></div>
            <div className="empty-title">No pending friend requests</div>
            <div className="empty-sub">When someone sends you a friend request, it will appear here</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.map(req => {
              const sender = req.sender
              return (
                <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--gray-0)', border: '1px solid var(--color-border)', borderRadius: 'var(--r-xl)', padding: '16px 18px' }}>
                  <div className="post-avatar" style={{ width: 46, height: 46, fontSize: 16, flexShrink: 0, cursor: 'pointer' }}
                    onClick={() => sender?.username && navigate('/profile/' + sender.username)}>
                    {sender?.avatar_url ? <img src={sender.avatar_url} alt="" /> : initials(sender?.full_name || '?')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => sender?.username && navigate('/profile/' + sender.username)}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{sender?.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-3)', fontFamily: 'var(--font-mono)' }}>@{sender?.username}</div>
                    {(sender as any)?.role_title && <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginTop: 2 }}>{(sender as any).role_title}</div>}
                    <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>{formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDecline(req.sender_id)}>Decline</button>
                    <button className="btn btn-primary btn-sm" onClick={() => handleAccept(req.sender_id, sender?.full_name)}>Accept</button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      ) : (
        friends.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><Icon.Friends /></div>
            <div className="empty-title">No friends yet</div>
            <div className="empty-sub">Visit someone's profile and send them a friend request</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {friends.map(f => {
              return (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--gray-0)', border: '1px solid var(--color-border)', borderRadius: 'var(--r-xl)', padding: '14px 18px' }}>
                  <div className="post-avatar" style={{ width: 42, height: 42, fontSize: 14, flexShrink: 0, cursor: 'pointer' }}
                    onClick={() => navigate('/profile/' + f.username)}>
                    {f.avatar_url ? <img src={f.avatar_url} alt="" /> : initials(f.full_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => navigate('/profile/' + f.username)}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{f.full_name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-3)', fontFamily: 'var(--font-mono)' }}>@{f.username}</div>
                    {(f as any).role_title && <div style={{ fontSize: 12, color: 'var(--color-text-2)', marginTop: 2 }}>{(f as any).role_title}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/messages?with=' + f.id)}>
                      <span style={{ display: 'flex', width: 13, height: 13 }}><Icon.MessageCircle /></span> Message
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => navigate('/profile/' + f.username)}>Profile</button>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
