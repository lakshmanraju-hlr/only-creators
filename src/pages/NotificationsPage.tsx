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
        async (payload) => {
          const { data } = await supabase
            .from('notifications')
            .select('*, actor:actor_id(id, full_name, username, avatar_url), post:post_id(id, user_id, profiles(username))')
            .eq('id', (payload.new as any).id)
            .single()
          if (data) setNotifications(prev => [data as Notification, ...prev])
        })
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
      case 'peer_verify': return { text: name + ' verified you as a peer in your field', icon: <span style={iconStyle}><Icon.Award /></span>, color: 'var(--color-pro)', bg: 'var(--color-pro-light)', action: goToActor }
      case 'message': return { text: name + ' sent you a message', icon: <span style={iconStyle}><Icon.MessageCircle /></span>, color: 'var(--blue-600)', bg: 'var(--blue-50)', action: () => navigate('/messages?with=' + actor?.id) }
      default: return { text: 'New activity', icon: <span style={iconStyle}><Icon.Bell /></span>, color: 'var(--gray-500)', bg: 'var(--gray-100)' }
    }
  }

  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  return (
    <div className="max-w-[700px] mx-auto px-8 py-6">
      <h1 className="text-[22px] font-bold tracking-tight text-gray-900 dark:text-white mb-1">Notifications</h1>
      <p className="text-[13.5px] text-gray-400 dark:text-gray-500 mb-5">Your latest activity and peer endorsements</p>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <span className="flex w-10 h-10 mb-3 text-gray-300 dark:text-gray-600"><Icon.Bell /></span>
          <p className="font-semibold text-gray-600 dark:text-gray-400">No notifications yet</p>
          <p className="text-sm mt-1 text-gray-400">When creators interact with your posts, you'll see it here</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl overflow-hidden shadow-xs">
          {notifications.map((n, i) => {
            const meta = getNotifMeta(n)
            const actor = (n as any).actor
            return (
              <div
                key={n.id}
                onClick={meta.action}
                className={[
                  'flex items-start gap-3 px-4 py-3.5 transition-colors',
                  i < notifications.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : '',
                  meta.action ? 'cursor-pointer' : 'cursor-default',
                  !n.is_read ? 'bg-brand-50 dark:bg-brand-600/10 hover:bg-brand-100 dark:hover:bg-brand-600/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50',
                ].join(' ')}
              >
                <div className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${!n.is_read ? 'bg-brand-600' : 'bg-transparent'}`} />
                <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: meta.bg, color: meta.color }}>
                  {meta.icon}
                </div>
                {actor && (
                  <button
                    className="w-8 h-8 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[11px] font-semibold text-blue-700 dark:text-blue-300 shrink-0"
                    onClick={e => { e.stopPropagation(); if (actor.username) navigate('/profile/' + actor.username) }}
                  >
                    {actor.avatar_url ? <img src={actor.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(actor.full_name)}
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] leading-snug text-gray-900 dark:text-white">
                    <span className="font-semibold">{(n as any).actor?.full_name || 'Someone'}</span>
                    {' '}{meta.text.replace((n as any).actor?.full_name || 'Someone', '').trim()}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                {meta.action && (
                  <span className="flex w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0 mt-1"><Icon.ChevronRight /></span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
