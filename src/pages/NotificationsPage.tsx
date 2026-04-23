import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { supabase, Notification } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'
import { acceptFriendRequest, declineFriendRequest } from '@/lib/friends'

// ── Types ─────────────────────────────────────────────────────────────────────
type EnrichedNotif = Notification & {
  actor: { id: string; full_name: string; username: string; avatar_url: string | null } | null
  post: { id: string; user_id: string; thumb_url?: string; media_url?: string; profiles: { username: string } | null } | null
}

type GroupedNotif = {
  key: string
  type: string
  post_id: string | null
  lead: EnrichedNotif
  others: EnrichedNotif[]
  latest_at: string
  is_read: boolean
}

// ── Badge config per type ─────────────────────────────────────────────────────
function getBadge(type: string): { icon: React.ReactNode; bg: string; color: string } {
  switch (type) {
    case 'like':          return { icon: <Icon.Heart filled />,      bg: '#EF4444', color: '#fff' }
    case 'pro_upvote':    return { icon: <Icon.Star filled />,       bg: 'var(--brand)', color: '#fff' }
    case 'comment':       return { icon: <Icon.MessageCircle />,     bg: '#10B981', color: '#fff' }
    case 'follow':        return { icon: <Icon.UserPlus />,          bg: '#3B82F6', color: '#fff' }
    case 'friend_request':return { icon: <Icon.UserPlus />,          bg: '#6B7280', color: '#fff' }
    case 'friend_accepted':return{ icon: <Icon.UserCheck />,         bg: '#10B981', color: '#fff' }
    case 'share':         return { icon: <Icon.Share />,             bg: '#3B82F6', color: '#fff' }
    case 'feature_tag':   return { icon: <Icon.Star filled />,       bg: '#6366F1', color: '#fff' }
    case 'peer_verify':   return { icon: <Icon.Award />,             bg: '#F59E0B', color: '#fff' }
    default:              return { icon: <Icon.Bell />,              bg: 'var(--text-faint)', color: '#fff' }
  }
}

// ── Group same type+post notifications ────────────────────────────────────────
function groupNotifs(notifs: EnrichedNotif[]): GroupedNotif[] {
  const map = new Map<string, GroupedNotif>()
  const order: string[] = []

  for (const n of notifs) {
    // Only group likes and pro_upvotes on the same post
    const groupable = (n.type === 'like' || n.type === 'pro_upvote') && n.post_id
    const key = groupable ? `${n.type}:${n.post_id}` : n.id

    if (map.has(key)) {
      const g = map.get(key)!
      g.others.push(n)
      if (n.created_at > g.latest_at) g.latest_at = n.created_at
      if (!n.is_read) g.is_read = false
    } else {
      map.set(key, { key, type: n.type, post_id: n.post_id, lead: n, others: [], latest_at: n.created_at, is_read: n.is_read ?? true })
      order.push(key)
    }
  }

  return order.map(k => map.get(k)!)
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState<EnrichedNotif[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<Record<string, boolean>>({})
  const [followingBack, setFollowingBack] = useState<Set<string>>(new Set())

  function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('notifications')
      .select(`
        *,
        actor:actor_id(id, full_name, username, avatar_url),
        post:post_id(id, user_id, thumb_url, media_url, profiles:user_id(username))
      `)
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(80)

    const loaded = (data || []) as EnrichedNotif[]
    setNotifs(loaded)
    setLoading(false)

    // Mark all read
    await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', profile.id).eq('is_read', false)

    // Check which actors we already follow back
    const followerIds = loaded
      .filter(n => n.type === 'follow' && n.actor)
      .map(n => n.actor!.id)
    if (followerIds.length > 0) {
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', profile.id)
        .in('following_id', followerIds)
      setFollowingBack(new Set((follows || []).map((r: any) => r.following_id as string)))
    }
  }, [profile?.id])

  useEffect(() => {
    load()
  }, [load])

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return
    const ch = supabase.channel('notifs-rt-' + profile.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: 'user_id=eq.' + profile.id,
      }, async (payload) => {
        const { data } = await supabase
          .from('notifications')
          .select(`
            *,
            actor:actor_id(id, full_name, username, avatar_url),
            post:post_id(id, user_id, thumb_url, media_url, profiles:user_id(username))
          `)
          .eq('id', (payload.new as any).id)
          .single()
        if (data) {
          setNotifs(prev => [data as EnrichedNotif, ...prev])
          // Mark read immediately since page is open
          supabase.from('notifications').update({ is_read: true }).eq('id', (payload.new as any).id)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile?.id])

  // ── Follow back ────────────────────────────────────────────────────────────
  async function handleFollowBack(actorId: string) {
    if (!profile || acting[actorId]) return
    setActing(a => ({ ...a, [actorId]: true }))
    await supabase.from('follows').insert({ follower_id: profile.id, following_id: actorId })
    await supabase.from('notifications').insert({ user_id: actorId, actor_id: profile.id, type: 'follow' })
    setFollowingBack(s => new Set([...s, actorId]))
    setActing(a => ({ ...a, [actorId]: false }))
    toast.success('Following back!')
  }

  // ── Friend request ─────────────────────────────────────────────────────────
  async function handleAcceptFriend(n: EnrichedNotif) {
    if (!n.actor || acting[n.id]) return
    setActing(a => ({ ...a, [n.id]: true }))
    try {
      await acceptFriendRequest(profile!.id, n.actor.id)
      toast.success(`You're now friends with ${n.actor.full_name}`)
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, type: 'friend_accepted', is_read: true } : x))
    } catch { toast.error('Failed to accept') }
    setActing(a => ({ ...a, [n.id]: false }))
  }

  async function handleDeclineFriend(n: EnrichedNotif) {
    if (!n.actor || acting[n.id]) return
    setActing(a => ({ ...a, [n.id]: true }))
    try {
      await declineFriendRequest(profile!.id, n.actor.id)
      setNotifs(prev => prev.filter(x => x.id !== n.id))
    } catch { toast.error('Failed to decline') }
    setActing(a => ({ ...a, [n.id]: false }))
  }

  // ── Feature tag ────────────────────────────────────────────────────────────
  async function handleAcceptFeature(n: EnrichedNotif) {
    if (acting[n.id]) return
    setActing(a => ({ ...a, [n.id]: true }))
    await supabase.from('post_features').update({ status: 'accepted' })
      .eq('post_id', n.post_id!).eq('featured_user_id', profile!.id)
    setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
    toast.success('Feature tag accepted')
    setActing(a => ({ ...a, [n.id]: false }))
  }

  async function handleDeclineFeature(n: EnrichedNotif) {
    if (acting[n.id]) return
    setActing(a => ({ ...a, [n.id]: true }))
    await supabase.from('post_features').update({ status: 'declined' })
      .eq('post_id', n.post_id!).eq('featured_user_id', profile!.id)
    setNotifs(prev => prev.filter(x => x.id !== n.id))
    setActing(a => ({ ...a, [n.id]: false }))
  }

  // ── Navigate on click ──────────────────────────────────────────────────────
  function getRowAction(g: GroupedNotif): (() => void) | undefined {
    const n = g.lead
    const actor = n.actor
    const post = n.post
    const postUser = post?.profiles?.username || actor?.username
    switch (g.type) {
      case 'like':
      case 'pro_upvote':
      case 'comment':
      case 'share':
      case 'feature_tag':
        if (postUser && n.post_id) return () => navigate('/profile/' + postUser + '#post-' + n.post_id)
        break
      case 'follow':
      case 'friend_accepted':
      case 'peer_verify':
        if (actor?.username) return () => navigate('/profile/' + actor.username)
        break
      case 'message':
        if (actor?.id) return () => navigate('/messages?with=' + actor.id)
        break
    }
  }

  // ── Text builder ───────────────────────────────────────────────────────────
  function getText(g: GroupedNotif): React.ReactNode {
    const n = g.lead
    const actor = n.actor
    const name = actor?.username || 'someone'
    const count = g.others.length

    switch (g.type) {
      case 'like':
        return count > 0
          ? <><strong>{name}</strong> and <strong>{count} others</strong> liked your post</>
          : <><strong>{name}</strong> liked your post</>
      case 'pro_upvote':
        return count > 0
          ? <><strong>{name}</strong> and <strong>{count} others</strong> Pro-voted your post</>
          : <><strong>{name}</strong> Pro-voted your {n.post ? '' : ''}post</>
      case 'comment':
        return <><strong>{name}</strong> commented on your post</>
      case 'follow':
        return <><strong>{name}</strong> started following you</>
      case 'friend_request':
        return <><strong>{name}</strong> sent you a friend request</>
      case 'friend_accepted':
        return <>You are now friends with <strong>{name}</strong></>
      case 'share':
        return <><strong>{name}</strong> shared your post</>
      case 'feature_tag':
        return <><strong>{name}</strong> featured you in a post</>
      case 'peer_verify':
        return <><strong>{name}</strong> verified you as a peer in your field</>
      case 'message':
        return <><strong>{name}</strong> sent you a message</>
      default:
        return <>New activity from <strong>{name}</strong></>
    }
  }

  function getSubText(g: GroupedNotif): string | null {
    const n = g.lead
    switch (g.type) {
      case 'pro_upvote':
        return n.post ? 'Pro vote from a verified Expert' : null
      case 'comment':
        return (n as any).comment_body ? `"${(n as any).comment_body}"` : null
      default: return null
    }
  }

  // ── Section split ─────────────────────────────────────────────────────────
  const grouped = groupNotifs(notifs)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const newItems = grouped.filter(g => !g.is_read || g.latest_at >= cutoff)
  const earlierItems = grouped.filter(g => g.is_read && g.latest_at < cutoff)

  // ── Row renderer ──────────────────────────────────────────────────────────
  function NotifRow({ g }: { g: GroupedNotif }) {
    const n = g.lead
    const actor = n.actor
    const post = n.post
    const badge = getBadge(g.type)
    const rowAction = getRowAction(g)
    const subText = getSubText(g)
    const thumb = post?.thumb_url || post?.media_url
    const timeLabel = formatDistanceToNow(new Date(g.latest_at), { addSuffix: true })

    const isFriendRequest = g.type === 'friend_request'
    const isFollow = g.type === 'follow'
    const isFeatureTag = g.type === 'feature_tag'
    const alreadyFollowing = isFollow && actor && followingBack.has(actor.id)

    return (
      <div
        onClick={!isFriendRequest && !isFeatureTag ? rowAction : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '13px 16px',
          borderBottom: '1px solid var(--divider)',
          cursor: (!isFriendRequest && !isFeatureTag && rowAction) ? 'pointer' : 'default',
          background: !g.is_read ? 'rgba(78,11,22,0.03)' : 'transparent',
          transition: 'background var(--transition)',
        }}
        onMouseEnter={e => { if (!isFriendRequest && !isFeatureTag && rowAction) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-off)' }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = !g.is_read ? 'rgba(78,11,22,0.03)' : 'transparent' }}
      >
        {/* Avatar + badge */}
        <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); if (actor?.username) navigate('/profile/' + actor.username) }}
            style={{ width: 44, height: 44, borderRadius: 'var(--radius-full)', overflow: 'hidden', background: 'var(--surface-off)', display: 'block', border: '1.5px solid var(--border)', flexShrink: 0 }}
          >
            {actor?.avatar_url
              ? <img src={actor.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--brand)' }}>{initials(actor?.full_name || '?')}</div>
            }
          </button>
          {/* Badge icon */}
          <div style={{
            position: 'absolute', bottom: -2, right: -2,
            width: 18, height: 18, borderRadius: 'var(--radius-full)',
            background: badge.bg, color: badge.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid var(--surface)',
          }}>
            <span style={{ display: 'flex', width: 9, height: 9 }}>{badge.icon}</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.45, marginBottom: 1 }}>
            {getText(g)}
          </p>
          {subText && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
              {subText}
            </p>
          )}
          <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}>{timeLabel}</p>

          {/* Friend request actions */}
          {isFriendRequest && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={e => { e.stopPropagation(); handleAcceptFriend(n) }}
                disabled={acting[n.id]}
                style={{ height: 30, padding: '0 16px', borderRadius: 'var(--radius-full)', background: 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 700, opacity: acting[n.id] ? 0.5 : 1 }}
              >
                Accept
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleDeclineFriend(n) }}
                disabled={acting[n.id]}
                style={{ height: 30, padding: '0 14px', borderRadius: 'var(--radius-full)', border: '1.5px solid var(--border)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, background: 'transparent', opacity: acting[n.id] ? 0.5 : 1 }}
              >
                Decline
              </button>
            </div>
          )}

          {/* Feature tag actions */}
          {isFeatureTag && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                onClick={e => { e.stopPropagation(); handleAcceptFeature(n) }}
                disabled={acting[n.id]}
                style={{ height: 30, padding: '0 16px', borderRadius: 'var(--radius-full)', background: 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 700, opacity: acting[n.id] ? 0.5 : 1 }}
              >
                Accept
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleDeclineFeature(n) }}
                disabled={acting[n.id]}
                style={{ height: 30, padding: '0 14px', borderRadius: 'var(--radius-full)', border: '1.5px solid var(--border)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600, background: 'transparent', opacity: acting[n.id] ? 0.5 : 1 }}
              >
                Decline
              </button>
            </div>
          )}
        </div>

        {/* Right side: thumb OR follow-back button */}
        {isFollow && !alreadyFollowing && (
          <button
            onClick={e => { e.stopPropagation(); handleFollowBack(actor!.id) }}
            disabled={acting[actor!.id]}
            style={{ flexShrink: 0, height: 32, padding: '0 16px', borderRadius: 'var(--radius-full)', border: '1.5px solid var(--border)', color: 'var(--text-primary)', fontSize: 12.5, fontWeight: 700, background: 'transparent', whiteSpace: 'nowrap', opacity: acting[actor!.id] ? 0.5 : 1, transition: 'background var(--transition)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            Follow back
          </button>
        )}
        {isFollow && alreadyFollowing && (
          <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--text-faint)', fontWeight: 500 }}>Following</span>
        )}
        {!isFollow && !isFriendRequest && !isFeatureTag && thumb && (
          <div
            style={{ flexShrink: 0, width: 52, height: 52, borderRadius: 8, overflow: 'hidden', background: 'var(--surface-off)', border: '1px solid var(--border)' }}
          >
            <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          </div>
        )}
      </div>
    )
  }

  // ── Section ────────────────────────────────────────────────────────────────
  function Section({ label, items }: { label: string; items: GroupedNotif[] }) {
    if (items.length === 0) return null
    return (
      <div>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-faint)', padding: '16px 16px 8px' }}>
          {label}
        </p>
        {items.map(g => <NotifRow key={g.key} g={g} />)}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--divider)', borderTopColor: 'var(--brand)' }} />
    </div>
  )

  if (grouped.length === 0) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, textAlign: 'center', gap: 8 }}>
      <span style={{ display: 'flex', width: 40, height: 40, color: 'var(--text-faint)' }}><Icon.Bell /></span>
      <p style={{ fontWeight: 600, color: 'var(--text-muted)' }}>No notifications yet</p>
      <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>When creators interact with your posts, you'll see it here</p>
    </div>
  )

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', background: 'var(--surface)' }}>
      <Section label="New" items={newItems} />
      <Section label="Earlier" items={earlierItems} />
    </div>
  )
}
