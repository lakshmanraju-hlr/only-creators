import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { supabase, Notification } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'
import {
  acceptFriendRequest,
  declineFriendRequest,
} from '@/lib/friends'

export default function NotificationsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<Record<string, boolean>>({})

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

  async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', profile!.id)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    toast.success('All notifications marked as read')
  }

  async function handleAcceptFriend(n: Notification) {
    const actor = (n as any).actor
    if (!actor || acting[n.id]) return
    setActing(a => ({ ...a, [n.id]: true }))
    try {
      // Find the friend request
      const { data: req } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('sender_id', actor.id)
        .eq('receiver_id', profile!.id)
        .eq('status', 'pending')
        .single()
      if (req) {
        await acceptFriendRequest(profile!.id, actor.id)
        toast.success(`You are now friends with ${actor.full_name}`)
        setNotifications(prev =>
          prev.map(x => x.id === n.id
            ? { ...x, type: 'friend_accepted', is_read: true }
            : x
          )
        )
      }
    } catch {
      toast.error('Failed to accept request')
    } finally {
      setActing(a => ({ ...a, [n.id]: false }))
    }
  }

  async function handleDeclineFriend(n: Notification) {
    const actor = (n as any).actor
    if (!actor || acting[n.id]) return
    setActing(a => ({ ...a, [n.id]: true }))
    try {
      const { data: req } = await supabase
        .from('friend_requests')
        .select('id')
        .eq('sender_id', actor.id)
        .eq('receiver_id', profile!.id)
        .eq('status', 'pending')
        .single()
      if (req) {
        await declineFriendRequest(profile!.id, actor.id)
        setNotifications(prev => prev.filter(x => x.id !== n.id))
      }
    } catch {
      toast.error('Failed to decline request')
    } finally {
      setActing(a => ({ ...a, [n.id]: false }))
    }
  }

  async function handleAcceptFeature(n: Notification) {
    if (acting[n.id]) return
    setActing(a => ({ ...a, [n.id]: true }))
    try {
      await supabase.from('post_features')
        .update({ status: 'accepted' })
        .eq('post_id', n.post_id!)
        .eq('featured_user_id', profile!.id)
      setNotifications(prev =>
        prev.map(x => x.id === n.id ? { ...x, is_read: true } : x)
      )
      toast.success('Feature tag accepted — it will appear in your Featured In tab')
    } catch {
      toast.error('Failed to accept feature tag')
    } finally {
      setActing(a => ({ ...a, [n.id]: false }))
    }
  }

  async function handleDeclineFeature(n: Notification) {
    if (acting[n.id]) return
    setActing(a => ({ ...a, [n.id]: true }))
    try {
      await supabase.from('post_features')
        .update({ status: 'declined' })
        .eq('post_id', n.post_id!)
        .eq('featured_user_id', profile!.id)
      setNotifications(prev => prev.filter(x => x.id !== n.id))
    } catch {
      toast.error('Failed to decline feature tag')
    } finally {
      setActing(a => ({ ...a, [n.id]: false }))
    }
  }

  type NotifMeta = {
    text: string
    icon: React.ReactNode
    iconColor: string
    iconBg: string
    action?: () => void
    isProVote?: boolean
    isFriendRequest?: boolean
    isFriendAccepted?: boolean
    isFeatureTag?: boolean
  }

  function getNotifMeta(n: Notification): NotifMeta {
    const actor = (n as any).actor
    const post = (n as any).post
    const name = actor?.full_name || 'Someone'
    const postUsername = post?.profiles?.username || actor?.username
    const goToActor = () => { if (actor?.username) navigate('/profile/' + actor.username) }
    const goToPost = () => {
      if (postUsername) navigate('/profile/' + postUsername + '#post-' + n.post_id)
      else if (actor?.username) navigate('/profile/' + actor.username)
    }

    switch (n.type) {
      case 'like':
        return { text: `${name} liked your post`, icon: <Icon.Heart filled />, iconColor: '#EF4444', iconBg: '#FEF2F2', action: goToPost }
      case 'pro_upvote':
        return { text: `${name} gave your post a Pro Vote`, icon: <Icon.Star filled />, iconColor: '#F59E0B', iconBg: '#FEF3C7', action: goToPost, isProVote: true }
      case 'comment':
        return { text: `${name} commented on your post`, icon: <Icon.MessageCircle />, iconColor: '#2563EB', iconBg: '#EFF6FF', action: goToPost }
      case 'follow':
        return { text: `${name} started following you`, icon: <Icon.UserPlus />, iconColor: '#10B981', iconBg: '#ECFDF5', action: goToActor }
      case 'share':
        return { text: `${name} shared your post`, icon: <Icon.Share />, iconColor: '#2563EB', iconBg: '#EFF6FF', action: goToPost }
      case 'friend_request':
        return { text: `${name} sent you a friend request`, icon: <Icon.UserPlus />, iconColor: '#6B7280', iconBg: '#F8F8F6', isFriendRequest: true }
      case 'friend_accepted':
        return { text: `You are now friends with ${name}`, icon: <Icon.UserCheck />, iconColor: '#10B981', iconBg: '#ECFDF5', action: goToActor, isFriendAccepted: true }
      case 'peer_verify':
        return { text: `${name} verified you as a peer in your field`, icon: <Icon.Award />, iconColor: '#F59E0B', iconBg: '#FEF3C7', action: goToActor, isProVote: true }
      case 'message':
        return { text: `${name} sent you a message`, icon: <Icon.MessageCircle />, iconColor: '#2563EB', iconBg: '#EFF6FF', action: () => navigate('/messages?with=' + actor?.id) }
      case 'feature_tag':
        return { text: `${name} featured you in a post`, icon: <Icon.Star filled />, iconColor: '#6366F1', iconBg: '#EEF2FF', isFeatureTag: true }
      default:
        return { text: 'New activity', icon: <Icon.Bell />, iconColor: '#6B7280', iconBg: '#F8F8F6' }
    }
  }

  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  const hasUnread = notifications.some(n => !n.is_read)

  return (
    <div className="max-w-[680px] mx-auto px-4 md:px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-[#111111]">Notifications</h1>
          <p className="text-[13px] text-[#6B7280] mt-0.5">Your latest activity and peer endorsements</p>
        </div>
        {hasUnread && (
          <button
            onClick={markAllRead}
            className="text-[13px] font-semibold text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-7 h-7 border-2 border-[#1A1A1A] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <span className="flex w-10 h-10 mb-3 text-[#D1D5DB]"><Icon.Bell /></span>
          <p className="font-semibold text-[#6B7280]">No notifications yet</p>
          <p className="text-[13px] mt-1 text-[#9CA3AF]">When creators interact with your posts, you'll see it here</p>
        </div>
      ) : (
        <div
          className="rounded-[12px] overflow-hidden"
          style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          {notifications.map((n, i) => {
            const meta = getNotifMeta(n)
            const actor = (n as any).actor
            const isLast = i === notifications.length - 1

            return (
              <div
                key={n.id}
                className="flex items-start gap-3 px-4 py-3.5 transition-colors relative"
                style={{
                  background: !n.is_read ? '#F0F7FF' : 'transparent',
                  borderBottom: isLast ? 'none' : '1px solid #E5E7EB',
                  // Pro vote gets amber left border
                  borderLeft: meta.isProVote ? '4px solid #F59E0B' : '4px solid transparent',
                  cursor: meta.action ? 'pointer' : 'default',
                  paddingLeft: meta.isProVote ? 12 : 16,
                }}
                onClick={meta.action}
              >
                {/* Unread dot */}
                <div
                  className="w-1.5 h-1.5 rounded-full mt-2 shrink-0"
                  style={{ background: !n.is_read ? '#2563EB' : 'transparent' }}
                />

                {/* Type icon */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: meta.iconBg, color: meta.iconColor }}
                >
                  <span className="flex w-4 h-4">{meta.icon}</span>
                </div>

                {/* Actor avatar */}
                {actor && (
                  <button
                    className="w-8 h-8 rounded-full overflow-hidden bg-[#DBEAFE] flex items-center justify-center text-[11px] font-semibold text-[#1D4ED8] shrink-0"
                    onClick={e => { e.stopPropagation(); if (actor.username) navigate('/profile/' + actor.username) }}
                  >
                    {actor.avatar_url
                      ? <img src={actor.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                      : initials(actor.full_name)
                    }
                  </button>
                )}

                {/* Text + time + actions */}
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] leading-snug text-[#111111]">
                    <span className="font-semibold">{actor?.full_name || 'Someone'}</span>
                    {' '}
                    {meta.text.replace(actor?.full_name || 'Someone', '').trim()}
                    {meta.isFriendAccepted && ' 🎉'}
                  </p>
                  <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>

                  {/* Friend request inline actions */}
                  {meta.isFriendRequest && (
                    <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleAcceptFriend(n)}
                        disabled={acting[n.id]}
                        className="flex items-center gap-1.5 h-8 px-4 rounded-[8px] text-[13px] font-semibold text-white transition-all disabled:opacity-50 active:scale-95"
                        style={{ background: '#10B981' }}
                      >
                        {acting[n.id]
                          ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <><span className="flex w-3.5 h-3.5"><Icon.Check /></span> Accept</>
                        }
                      </button>
                      <button
                        onClick={() => handleDeclineFriend(n)}
                        disabled={acting[n.id]}
                        className="flex items-center gap-1.5 h-8 px-4 rounded-[8px] text-[13px] font-semibold text-[#1A1A1A] border border-[#E5E7EB] transition-all disabled:opacity-50 hover:bg-[#F8F8F6] active:scale-95"
                      >
                        <span className="flex w-3.5 h-3.5"><Icon.X /></span>
                        Decline
                      </button>
                    </div>
                  )}

                  {/* Feature tag inline actions */}
                  {meta.isFeatureTag && (
                    <div className="flex gap-2 mt-2" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleAcceptFeature(n)}
                        disabled={acting[n.id]}
                        className="flex items-center gap-1.5 h-8 px-4 rounded-[8px] text-[13px] font-semibold text-white transition-all disabled:opacity-50 active:scale-95"
                        style={{ background: '#6366F1' }}
                      >
                        {acting[n.id]
                          ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <><span className="flex w-3.5 h-3.5"><Icon.Check /></span> Accept</>
                        }
                      </button>
                      <button
                        onClick={() => handleDeclineFeature(n)}
                        disabled={acting[n.id]}
                        className="flex items-center gap-1.5 h-8 px-4 rounded-[8px] text-[13px] font-semibold text-[#1A1A1A] border border-[#E5E7EB] transition-all disabled:opacity-50 hover:bg-[#F8F8F6] active:scale-95"
                      >
                        <span className="flex w-3.5 h-3.5"><Icon.X /></span>
                        Decline
                      </button>
                      {n.post_id && (
                        <button
                          onClick={() => { const post = (n as any).post; if (post?.profiles?.username) navigate('/profile/' + post.profiles.username + '#post-' + n.post_id) }}
                          className="text-[12px] text-[#6B7280] hover:text-[#111111] underline transition-colors self-center"
                        >
                          View post
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Chevron for tappable cards */}
                {meta.action && !meta.isFriendRequest && (
                  <span className="flex w-3.5 h-3.5 text-[#9CA3AF] shrink-0 mt-1"><Icon.ChevronRight /></span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
