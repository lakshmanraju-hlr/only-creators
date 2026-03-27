import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { supabase, Notification } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'

export default function NotificationsPage() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    async function load() {
      const { data } = await supabase
        .from('notifications')
        .select('*, actor:actor_id(full_name, username, avatar_url)')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      setNotifications((data || []) as Notification[])

      // Mark all as read
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile!.id).eq('is_read', false)
      setLoading(false)
    }
    load()
  }, [profile?.id])

  // Real-time notifications
  useEffect(() => {
    if (!profile) return
    const channel = supabase.channel('notifications-' + profile.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${profile.id}`
      }, payload => {
        setNotifications(prev => [payload.new as Notification, ...prev])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  function notifText(n: Notification): { text: string; icon: string } {
    const actor = (n as any).actor
    const name = actor?.full_name || 'Someone'
    switch (n.type) {
      case 'like':            return { text: `${name} liked your post`, icon: '♥' }
      case 'pro_upvote':      return { text: `${name} gave your post a ◆ Pro Upvote`, icon: '◆' }
      case 'comment':         return { text: `${name} commented on your post`, icon: '💬' }
      case 'follow':          return { text: `${name} started following you`, icon: '◉' }
      case 'share':           return { text: `${name} shared your post`, icon: '↗' }
      case 'friend_request':  return { text: `${name} sent you a friend request`, icon: '✦' }
      case 'friend_accepted': return { text: `${name} accepted your friend request — you're now friends!`, icon: '✦' }
      default:                return { text: 'New notification', icon: '🔔' }
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 28, marginBottom: 4 }}>Notifications</div>
      <div style={{ fontSize: 14, color: 'var(--text-2)', marginBottom: 24 }}>Your latest activity and peer endorsements</div>

      {notifications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔔</div>
          <div className="empty-title">No notifications yet</div>
          <div className="empty-sub">When creators interact with your posts, you'll see it here</div>
        </div>
      ) : (
        <div style={{ background: 'var(--surf-1)', border: '1px solid var(--border)', borderRadius: 'var(--r-xl)', padding: '4px 16px' }}>
          {notifications.map(n => {
            const { text, icon } = notifText(n)
            const isPro = n.type === 'pro_upvote'
            return (
              <div key={n.id} className="notif-item">
                {!n.is_read ? <div className="notif-dot-badge" /> : <div className="notif-empty" />}
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: isPro ? 'var(--gold-bg)' : 'var(--surf-3)', border: `1px solid ${isPro ? 'var(--gold-border)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0, color: isPro ? 'var(--gold)' : 'var(--text-2)' }}>
                  {icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="notif-text" style={{ color: isPro ? undefined : undefined }}>
                    {isPro
                      ? <><strong>{(n as any).actor?.full_name || 'Someone'}</strong> gave your post a <span className="notif-gold">◆ Pro Upvote</span></>
                      : text
                    }
                  </div>
                  <div className="notif-meta">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
