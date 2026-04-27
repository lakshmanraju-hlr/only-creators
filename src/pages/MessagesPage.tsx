import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format, isToday, isYesterday, isThisWeek } from 'date-fns'
import { supabase, Profile, Message } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'
import { getProfMeta } from '@/lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────
interface ConvRow {
  id: string
  other: Profile
  lastMsg: Message | null
  unread: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

function tsLabel(iso: string) {
  const d = new Date(iso)
  if (isToday(d))       return format(d, 'h:mm a')
  if (isYesterday(d))   return 'Yesterday'
  if (isThisWeek(d))    return format(d, 'EEE')
  return format(d, 'MMM d')
}

function msgTimeLabel(iso: string) { return format(new Date(iso), 'h:mm a') }

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({ user, size = 44, online = false }: { user: Profile; size?: number; online?: boolean }) {
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: 'var(--radius-full)', overflow: 'hidden', background: 'var(--surface-off)', border: '1.5px solid var(--border)', flexShrink: 0 }}>
        {user.avatar_url
          ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.3, fontWeight: 700, color: 'var(--brand)' }}>{initials(user.full_name)}</div>
        }
      </div>
      {online && (
        <div style={{ position: 'absolute', bottom: 1, right: 1, width: 11, height: 11, borderRadius: 'var(--radius-full)', background: '#22C55E', border: '2px solid var(--surface)' }} />
      )}
    </div>
  )
}

// ── Shared post card in chat ──────────────────────────────────────────────────
function SharedPostCard({ post, onClick }: { post: any; onClick: () => void }) {
  const fieldMeta = getProfMeta(post.persona_discipline)
  const proCount = post.pro_upvote_count ?? 0

  return (
    <div
      onClick={onClick}
      style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)', maxWidth: 280, cursor: 'pointer' }}
    >
      {post.media_url && (
        <div style={{ aspectRatio: '4/3', overflow: 'hidden', background: 'var(--surface-off)' }}>
          <img src={post.thumb_url || post.media_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
        </div>
      )}
      <div style={{ padding: '10px 12px' }}>
        {(fieldMeta || proCount > 0) && (
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-faint)', marginBottom: 4 }}>
            {fieldMeta?.label}{fieldMeta && proCount > 0 ? ' · ' : ''}
            {proCount > 0 ? `Pro-voted ${proCount >= 1000 ? (proCount / 1000).toFixed(1) + 'k' : proCount}` : ''}
          </p>
        )}
        {post.caption && (
          <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {post.caption}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MessagesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [convs, setConvs] = useState<ConvRow[]>([])
  const [convsLoading, setConvsLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [activeFriend, setActiveFriend] = useState<Profile | null>(null)
  const [convId, setConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [msgsLoading, setMsgsLoading] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set())

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const convIdRef = useRef<string | null>(null)

  // ── Presence (online status) ────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return
    const ch = supabase.channel('presence-global', { config: { presence: { key: profile.id } } })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState()
        const ids = new Set(Object.keys(state))
        setOnlineIds(ids)
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setOnlineIds(s => new Set([...s, key]))
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setOnlineIds(s => { const n = new Set(s); n.delete(key); return n })
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ user_id: profile.id, online_at: new Date().toISOString() })
        }
      })
    return () => { supabase.removeChannel(ch) }
  }, [profile?.id])

  // ── Load conversations ──────────────────────────────────────────────────────
  const loadConvs = useCallback(async () => {
    if (!profile) return
    setConvsLoading(true)

    // Get all conversation_ids for this user
    const { data: parts } = await supabase
      .from('conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('user_id', profile.id)

    if (!parts?.length) { setConvsLoading(false); return }
    const convIds = parts.map((p: any) => p.conversation_id as string)
    const lastReadMap: Record<string, string> = {}
    parts.forEach((p: any) => { lastReadMap[p.conversation_id] = p.last_read_at })

    // Get the other participant for each conversation
    const { data: otherParts } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id, profiles:user_id(id,username,full_name,avatar_url,role_title)')
      .in('conversation_id', convIds)
      .neq('user_id', profile.id)

    // Get last message per conversation
    const { data: lastMsgs } = await supabase
      .from('messages')
      .select('*, post:post_id(id,caption,content_type,media_url,thumb_url,persona_discipline,pro_upvote_count,profiles:user_id(username,full_name))')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: false })

    // Build last message map (first occurrence = latest)
    const lastMsgMap: Record<string, Message> = {}
    ;(lastMsgs || []).forEach((m: any) => {
      if (!lastMsgMap[m.conversation_id]) lastMsgMap[m.conversation_id] = m as Message
    })

    // Count unreads per conv
    const unreadMap: Record<string, number> = {}
    ;(lastMsgs || []).forEach((m: any) => {
      const lastRead = lastReadMap[m.conversation_id]
      if (m.sender_id !== profile.id && (!lastRead || m.created_at > lastRead)) {
        unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1
      }
    })

    const rows: ConvRow[] = (otherParts || [])
      .map((p: any) => ({
        id: p.conversation_id,
        other: p.profiles as Profile,
        lastMsg: lastMsgMap[p.conversation_id] ?? null,
        unread: unreadMap[p.conversation_id] ?? 0,
      }))
      .filter(r => r.other)
      .sort((a, b) => {
        const at = a.lastMsg?.created_at ?? ''
        const bt = b.lastMsg?.created_at ?? ''
        return bt.localeCompare(at)
      })

    setConvs(rows)
    setConvsLoading(false)
  }, [profile?.id])

  useEffect(() => { loadConvs() }, [loadConvs])

  // Auto-open ?with= param
  useEffect(() => {
    const withId = searchParams.get('with')
    if (!withId || !convs.length) return
    const row = convs.find(c => c.other.id === withId)
    if (row) openConversation(row.other)
  }, [convs, searchParams])

  // ── Open conversation ───────────────────────────────────────────────────────
  const openConversation = useCallback(async (friend: Profile) => {
    setActiveFriend(friend)
    setMessages([])
    setMsgsLoading(true)
    setText('')

    const { data, error } = await supabase.rpc('get_or_create_conversation', { other_user_id: friend.id })
    if (error) { toast.error('Could not open conversation'); setMsgsLoading(false); return }
    const cid = data as string
    setConvId(cid)
    convIdRef.current = cid

    const { data: msgs } = await supabase
      .from('messages')
      .select(`
        *,
        sender:sender_id(id,username,full_name,avatar_url),
        post:post_id(
          id,user_id,caption,content_type,media_url,thumb_url,
          persona_discipline,pro_upvote_count,
          profiles:user_id(id,username,full_name)
        )
      `)
      .eq('conversation_id', cid)
      .order('created_at', { ascending: true })

    setMessages((msgs || []) as Message[])
    setMsgsLoading(false)

    // Mark as read
    await supabase.from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', cid).eq('user_id', profile!.id)

    // Update unread count locally
    setConvs(prev => prev.map(c => c.id === cid ? { ...c, unread: 0 } : c))

    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 80)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [profile?.id])

  // ── Realtime messages ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!convId || !profile) return
    const ch = supabase.channel('chat-' + convId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + convId },
        async (payload) => {
          const msg = payload.new as Message
          if (msg.sender_id === profile.id) return // already optimistically added
          // Enrich
          const { data: sender } = await supabase.from('profiles').select('id,username,full_name,avatar_url').eq('id', msg.sender_id).single()
          let post = null
          if (msg.post_id) {
            const { data: p } = await supabase.from('posts')
              .select('id,user_id,caption,content_type,media_url,thumb_url,persona_discipline,pro_upvote_count,profiles:user_id(id,username,full_name)')
              .eq('id', msg.post_id).single()
            post = p
          }
          setMessages(prev => [...prev, { ...msg, sender: sender as Profile, post: post as any }])
          // Mark read immediately since chat is open
          supabase.from('conversation_participants')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', convId).eq('user_id', profile.id)
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [convId, profile?.id])

  // Realtime conv list updates (new messages from others)
  useEffect(() => {
    if (!profile) return
    const ch = supabase.channel('conv-list-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        () => { loadConvs() })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile?.id, loadConvs])

  // ── Send ────────────────────────────────────────────────────────────────────
  async function send() {
    if (!profile || !convId || !text.trim() || sending) return
    const body = text.trim()
    setText('')
    setSending(true)

    const tempId = 'temp-' + Date.now()
    const optimistic: Message = {
      id: tempId, conversation_id: convId,
      sender_id: profile.id, body, post_id: null,
      created_at: new Date().toISOString(),
      sender: profile,
    }
    setMessages(prev => [...prev, optimistic])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)

    const { data, error } = await supabase.from('messages')
      .insert({ conversation_id: convId, sender_id: profile.id, body })
      .select('id').single()

    if (error) {
      toast.error('Failed to send')
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setText(body)
    } else if (data) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id } : m))
      if (activeFriend) {
        await supabase.from('notifications').insert({ user_id: activeFriend.id, actor_id: profile.id, type: 'message', post_id: null })
      }
    }
    setSending(false)
  }

  // ── Filter ──────────────────────────────────────────────────────────────────
  const filteredConvs = search.trim()
    ? convs.filter(c =>
        c.other.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        c.other.username?.toLowerCase().includes(search.toLowerCase())
      )
    : convs

  // ── Last message preview text ───────────────────────────────────────────────
  function previewText(c: ConvRow): string {
    const m = c.lastMsg
    if (!m) return 'Start a conversation'
    if (m.post_id) return 'Shared a post'
    if (m.body) return (m.sender_id === profile?.id ? 'You: ' : '') + m.body
    return ''
  }

  const activeIsOnline = activeFriend ? onlineIds.has(activeFriend.id) : false

  // ── Render ──────────────────────────────────────────────────────────────────
  // On mobile: show list OR chat (full-screen toggle)
  // On desktop (md+): side-by-side split pane
  const showList = !activeFriend
  const showChat = !!activeFriend

  // Conversation list panel
  const ConvList = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)' }}>
      {/* List header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 56, borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
        <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Messages</span>
        <button
          style={{ display: 'flex', width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', background: 'transparent' }}
        >
          <span style={{ display: 'flex', width: 20, height: 20 }}><Icon.PenLine /></span>
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 12px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surface-off)', borderRadius: 'var(--radius-full)', border: '1px solid var(--border)' }}>
          <span style={{ display: 'flex', width: 15, height: 15, color: 'var(--text-faint)', flexShrink: 0 }}><Icon.Search /></span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search messages..."
            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13.5, color: 'var(--text-primary)', fontFamily: 'var(--font)' }}
          />
        </div>
      </div>

      {/* Conversation rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {convsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--divider)', borderTopColor: 'var(--brand)' }} />
          </div>
        ) : filteredConvs.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px', gap: 8 }}>
            <span style={{ display: 'flex', width: 36, height: 36, color: 'var(--text-faint)' }}><Icon.MessageCircle /></span>
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-faint)' }}>
              {search ? 'No conversations found' : 'No conversations yet'}
            </p>
          </div>
        ) : filteredConvs.map(c => {
          const isActive = activeFriend?.id === c.other.id
          const isOnline = onlineIds.has(c.other.id)
          const preview = previewText(c)
          const isSharedPost = c.lastMsg?.post_id != null && !c.lastMsg?.body

          return (
            <button
              key={c.id}
              onClick={() => openConversation(c.other)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                padding: '12px 16px', borderBottom: '1px solid var(--divider)',
                background: isActive ? 'rgba(78,11,22,0.04)' : 'transparent',
                textAlign: 'left', transition: 'background var(--transition)', cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              <Avatar user={c.other} size={46} online={isOnline} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.other.full_name || c.other.username}
                  </span>
                  {c.lastMsg && (
                    <span style={{ fontSize: 11.5, color: 'var(--text-faint)', flexShrink: 0, marginLeft: 8 }}>
                      {tsLabel(c.lastMsg.created_at)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {isSharedPost && (
                    <div style={{ width: 20, height: 20, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-off)', flexShrink: 0, border: '1px solid var(--border)' }}>
                      {(c.lastMsg?.post as any)?.thumb_url && (
                        <img src={(c.lastMsg?.post as any).thumb_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )}
                    </div>
                  )}
                  <span style={{ fontSize: 13, color: c.unread > 0 ? 'var(--text-primary)' : 'var(--text-faint)', fontWeight: c.unread > 0 ? 500 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {preview}
                  </span>
                  {c.unread > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20, padding: '0 4px', borderRadius: 'var(--radius-full)', background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {c.unread > 9 ? '9+' : c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )

  // Chat pane
  const ChatPane = activeFriend ? (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)' }}>
      {/* Chat header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px 0 4px', height: 56, borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
        <button
          onClick={() => { setActiveFriend(null); setConvId(null) }}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', background: 'transparent', flexShrink: 0 }}
        >
          <span style={{ display: 'flex', width: 18, height: 18 }}><Icon.ArrowLeft /></span>
        </button>
        <button onClick={() => navigate('/profile/' + activeFriend.username)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', flex: 1, minWidth: 0 }}>
          <Avatar user={activeFriend} size={36} online={activeIsOnline} />
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeFriend.full_name || activeFriend.username}
            </p>
            <p style={{ fontSize: 12, color: activeIsOnline ? '#22C55E' : 'var(--text-faint)', fontWeight: 500 }}>
              {activeIsOnline ? 'Online' : '@' + activeFriend.username}
            </p>
          </div>
        </button>
      </div>

      {/* Messages body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px 8px' }} className="scrollbar-hide">
        {msgsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
            <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--divider)', borderTopColor: 'var(--brand)' }} />
          </div>
        ) : messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40, gap: 6 }}>
            <Avatar user={activeFriend} size={52} />
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{activeFriend.full_name || activeFriend.username}</p>
            <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>@{activeFriend.username}</p>
            <p style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 8 }}>Send a message to start chatting</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {messages.map((m, i) => {
              const isMine = m.sender_id === profile?.id
              const post = m.post as any
              const prevMsg = messages[i - 1]
              const showTime = !prevMsg || new Date(m.created_at).getTime() - new Date(prevMsg.created_at).getTime() > 5 * 60 * 1000

              return (
                <div key={m.id}>
                  {showTime && (
                    <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', margin: '12px 0 6px', fontWeight: 500 }}>
                      {msgTimeLabel(m.created_at)}
                    </p>
                  )}
                  <div style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginBottom: 2 }}>
                    {!isMine && (
                      <button onClick={() => navigate('/profile/' + activeFriend.username)} style={{ flexShrink: 0, marginBottom: 2 }}>
                        <Avatar user={activeFriend} size={28} online={false} />
                      </button>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '72%', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                      {m.post_id && post && (
                        <SharedPostCard
                          post={post}
                          onClick={() => {
                            const posterUsername = post.profiles?.username
                            if (posterUsername) navigate('/profile/' + posterUsername + '#post-' + post.id)
                          }}
                        />
                      )}
                      {m.body && (
                        <div style={{
                          padding: '10px 14px',
                          borderRadius: 18,
                          borderBottomRightRadius: isMine ? 4 : 18,
                          borderBottomLeftRadius: isMine ? 18 : 4,
                          background: isMine ? 'var(--brand)' : 'var(--surface-off)',
                          color: isMine ? '#fff' : 'var(--text-primary)',
                          fontSize: 14,
                          lineHeight: 1.45,
                          wordBreak: 'break-word',
                        }}>
                          {m.body}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--divider)', background: 'var(--surface)', flexShrink: 0, paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))' }}>
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Message..."
          style={{
            flex: 1, height: 42, padding: '0 16px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--surface-off)', border: '1px solid var(--border)',
            fontSize: 14, color: 'var(--text-primary)',
            fontFamily: 'var(--font)', outline: 'none',
            transition: 'border-color var(--transition)',
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'rgba(78,11,22,0.25)' }}
          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border)' }}
        />
        <button
          onClick={send}
          disabled={sending || !text.trim()}
          style={{
            width: 42, height: 42, borderRadius: 'var(--radius-full)',
            background: text.trim() ? 'var(--brand)' : 'var(--surface-off)',
            color: text.trim() ? '#fff' : 'var(--text-faint)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'background var(--transition), color var(--transition)',
            opacity: sending ? 0.6 : 1,
          }}
        >
          {sending
            ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            : <span style={{ display: 'flex', width: 17, height: 17 }}><Icon.Send /></span>
          }
        </button>
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
      <span style={{ display: 'flex', width: 44, height: 44, color: 'var(--text-faint)' }}><Icon.MessageCircle /></span>
      <p style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 15 }}>Your messages</p>
      <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Select a conversation to start chatting</p>
    </div>
  )

  return (
    <div style={{ height: 'calc(100dvh - 56px)', overflow: 'hidden', background: 'var(--surface)' }}>
      {/* Mobile: full-screen list OR full-screen chat */}
      <div className="md:hidden" style={{ height: '100%' }}>
        {showList ? ConvList : ChatPane}
      </div>

      {/* Desktop: split pane */}
      <div className="hidden md:flex" style={{ height: '100%' }}>
        <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--divider)', height: '100%' }}>
          {ConvList}
        </div>
        <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
          {ChatPane}
        </div>
      </div>
    </div>
  )
}
