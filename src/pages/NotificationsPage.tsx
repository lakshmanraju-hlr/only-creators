import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { supabase, Notification } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'

export default function NotificationsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    async function load() {
      const { data } = await supabase
        .from('notifications')
        .select('*, actor:actor_id(id, full_name, username, avatar_url), post:post_id(id, user_id, profiles(username))')
        .eq('user_id', profile!.id)
        .order('created_at', { ascending: false })
        .limit(50)
      setNotifications((data || []) as Notification[])
      await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile!.id).eq('is_read', false)
      setLoading(false)
    }
    load()

    const ch = supabase.channel('notifs-' + profile.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + profile.id },
        payload => setNotifications(prev => [payload.new as Notification, ...prev]))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile?.id])

  type NotifMeta = { text: string; icon: React.ReactNode; color: string; bg: string; action?: () => void }

  function getNotifMeta(n: Notification): NotifMeta {
    const actor = (n as any).actor
    const post = (n as any).post
    const name = actor?.full_name || 'Someone'
    const postUsername = post?.profiles?.username || actor?.username
    const goToActor = () => { if (actor?.username) navigate('/profile/' + actor.username) }
    // Navigate to the post by going to the author's profile with a post anchor
    const goToPost = () => {
      if (postUsername) navigate('/profile/' + postUsername + '#post-' + n.post_id)
      else if (actor?.username) navigate('/profile/' + actor.username)
    }

    const iconStyle = { display: 'flex' as const, width: 16, height: 16 }
    switch (n.type) {
      case 'like': return { text: name + ' liked your post', icon: <span style={iconStyle}><Icon.Heart filled /></span>, color: 'var(--red-500)', bg: '#fff1f2', action: goToPost }
      case 'pro_upvote': return { text: name + ' gave your post a Pro Upvote', icon: <span style={iconStyle}><Icon.Award /></span>, color: 'var(--color-pro)', bg: 'var(--color-pro-light)', action: goToPost }
      case 'comment': return { text: name + ' commented on your post', icon: <span style={iconStyle}><Icon.MessageCircle /></span>, color: 'var(--blue-600)', bg: 'var(--blue-50)', action: goToPost }
      case 'follow': return { text: name + ' started following you', icon: <span style={iconStyle}><Icon.Profile /></span>, color: 'var(--green-600)', bg: 'var(--green-50)', action: goToActor }
      case 'share': return { text: name + ' shared your post', icon: <span style={iconStyle}><Icon.Share /></span>, color: 'var(--blue-600)', bg: 'var(--blue-50)', action: goToPost }
      case 'friend_request': return { text: name + ' sent you a friend request', icon: <span style={iconStyle}><Icon.UserPlus /></span>, color: 'var(--purple-600)', bg: 'var(--purple-50)', action: () => navigate('/friends') }
      case 'friend_accepted': return { text: name + ' accepted your friend request', icon: <span style={iconStyle}><Icon.UserCheck /></span>, color: 'var(--green-600)', bg: 'var(--green-50)', action: goToActor }
      default: return { text: 'New activity', icon: <span style={iconStyle}><Icon.Bell /></span>, color: 'var(--gray-500)', bg: 'var(--gray-100)' }
    }
  }

  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px' }}>
      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.4px', marginBottom: 4 }}>Notifications</div>
      <div style={{ fontSize: 13.5, color: 'var(--color-text-3)', marginBottom: 20 }}>Your latest activity and peer endorsements</div>

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : notifications.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><Icon.Bell /></div>
          <div className="empty-title">No notifications yet</div>
          <div className="empty-sub">When creators interact with your posts, you'll see it here</div>
        </div>
      ) : (
        <div style={{ background: 'var(--gray-0)', border: '1px solid var(--color-border)', borderRadius: 'var(--r-2xl)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>
          {notifications.map((n, i) => {
            const meta = getNotifMeta(n)
            const actor = (n as any).actor
            return (
              <div
                key={n.id}
                onClick={meta.action}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 16px',
                  borderBottom: i < notifications.length - 1 ? '1px solid var(--color-border)' : 'none',
                  cursor: meta.action ? 'pointer' : 'default',
                  background: !n.is_read ? 'var(--blue-50)' : 'transparent',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (meta.action) e.currentTarget.style.background = n.is_read ? 'var(--gray-50)' : 'var(--blue-100)' }}
                onMouseLeave={e => { e.currentTarget.style.background = !n.is_read ? 'var(--blue-50)' : 'transparent' }}
              >
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: !n.is_read ? 'var(--color-primary)' : 'transparent', flexShrink: 0, marginTop: 6 }} />
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {meta.icon}
                </div>
                {actor && (
                  <div className="post-avatar" style={{ width: 32, height: 32, fontSize: 11, flexShrink: 0, cursor: 'pointer' }}
                    onClick={e => { e.stopPropagation(); if (actor.username) navigate('/profile/' + actor.username) }}>
                    {actor.avatar_url ? <img src={actor.avatar_url} alt="" /> : initials(actor.full_name)}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-text)' }}>
                    <strong style={{ fontWeight: 600 }}>{(n as any).actor?.full_name || 'Someone'}</strong>
                    {' '}{meta.text.replace((n as any).actor?.full_name || 'Someone', '').trim()}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 3 }}>
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </div>
                </div>
                {meta.action && (
                  <div style={{ display: 'flex', width: 14, height: 14, color: 'var(--color-text-3)', flexShrink: 0, marginTop: 4 }}>
                    <Icon.ChevronRight />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
