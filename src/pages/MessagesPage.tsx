import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { supabase, Profile, Message } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import { getFriends } from '@/lib/friends'
import toast from 'react-hot-toast'

async function getOrCreateConversation(myId: string, otherId: string): Promise<string> {
  // Find my conversation IDs
  const { data: myRows } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', myId)

  const myConvIds = (myRows || []).map((r: any) => r.conversation_id)

  if (myConvIds.length > 0) {
    // With the updated cp_select policy we can see all participants in our conversations
    const { data: shared } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', otherId)
      .in('conversation_id', myConvIds)
      .limit(1)

    if (shared && shared.length > 0) return shared[0].conversation_id
  }

  // No existing conversation — create one
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({})
    .select('id')
    .single()
  if (convErr || !conv) throw new Error(convErr?.message || 'Failed to create conversation')

  await supabase.from('conversation_participants').insert([
    { conversation_id: conv.id, user_id: myId },
    { conversation_id: conv.id, user_id: otherId },
  ])

  return conv.id
}

export default function MessagesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [friends, setFriends] = useState<Profile[]>([])
  const [selectedFriend, setSelectedFriend] = useState<Profile | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const [friendsLoading, setFriendsLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const convIdRef = useRef<string | null>(null)

  // Load friends list
  useEffect(() => {
    if (!profile) return
    async function load() {
      setFriendsLoading(true)
      const ids = await getFriends(profile!.id)
      if (!ids.length) { setFriendsLoading(false); return }
      const { data } = await supabase.from('profiles').select('*').in('id', ids)
      const friendList = (data || []) as Profile[]
      setFriends(friendList)
      setFriendsLoading(false)

      // If ?with= param, auto-open that conversation
      const withUserId = searchParams.get('with')
      if (withUserId) {
        const target = friendList.find(f => f.id === withUserId)
        if (target) openConversation(target)
      }
    }
    load()
  }, [profile?.id])

  const openConversation = useCallback(async (friend: Profile) => {
    setSelectedFriend(friend)
    setMessages([])
    setLoading(true)

    let convId: string
    try {
      convId = await getOrCreateConversation(profile!.id, friend.id)
    } catch (err: any) {
      toast.error('Could not open conversation: ' + err.message)
      setLoading(false)
      return
    }
    setConversationId(convId)
    convIdRef.current = convId

    const { data: msgs, error: msgsError } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id, username, full_name, avatar_url), post:post_id(id, caption, content_type, media_url, profiles(username, full_name))')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    if (msgsError) toast.error('Failed to load messages')
    setMessages((msgs || []) as Message[])
    setLoading(false)

    // Mark as read
    await supabase.from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .eq('user_id', profile!.id)

    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    setTimeout(() => inputRef.current?.focus(), 150)
  }, [profile?.id])

  // Realtime subscription — attached once per conversation
  useEffect(() => {
    if (!conversationId || !profile) return

    const channelName = 'msgs-' + conversationId
    const ch = supabase.channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + conversationId },
        async (payload) => {
          const msg = payload.new as Message
          // Don't double-add messages we sent ourselves (optimistic insert handles that)
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev
            return [...prev, msg]
          })
          // Enrich with sender + post info
          const { data: sender } = await supabase
            .from('profiles').select('id,username,full_name,avatar_url').eq('id', msg.sender_id).single()
          let post = null
          if (msg.post_id) {
            const { data: p } = await supabase
              .from('posts').select('id,caption,content_type,media_url,profiles(username,full_name)').eq('id', msg.post_id).single()
            post = p
          }
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, sender: sender as Profile, post: post as any } : m))
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // subscription active
        }
      })

    return () => { supabase.removeChannel(ch) }
  }, [conversationId])

  async function send() {
    if (!profile || !conversationId || !text.trim()) return
    const body = text.trim()
    setText('')
    setSending(true)

    // Optimistic insert
    const tempId = 'temp-' + Date.now()
    const optimistic: Message = {
      id: tempId, conversation_id: conversationId,
      sender_id: profile.id, body, post_id: null,
      created_at: new Date().toISOString(),
      sender: profile,
    }
    setMessages(prev => [...prev, optimistic])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 30)

    const { data, error } = await supabase.from('messages')
      .insert({ conversation_id: conversationId, sender_id: profile.id, body })
      .select('id')
      .single()

    if (error) {
      toast.error('Failed to send: ' + error.message)
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setText(body)
    } else if (data) {
      // Replace optimistic with real id
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: data.id } : m))
    }
    setSending(false)
  }

  function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  return (
    <div className="messages-shell">
      {/* Friends sidebar */}
      <div className="messages-sidebar">
        <div className="messages-sidebar-header">
          <div style={{ fontWeight: 600, fontSize: 15 }}>Messages</div>
        </div>
        {friendsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" /></div>
        ) : friends.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>
            Add friends to start messaging
          </div>
        ) : friends.map(f => (
          <button
            key={f.id}
            className={'msg-friend-item ' + (selectedFriend?.id === f.id ? 'active' : '')}
            onClick={() => openConversation(f)}
          >
            <div className="post-avatar" style={{ width: 38, height: 38, fontSize: 13, flexShrink: 0 }}>
              {f.avatar_url ? <img src={f.avatar_url} alt="" /> : initials(f.full_name)}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontWeight: 500, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.full_name}</div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-3)' }}>@{f.username}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div className="messages-chat">
        {!selectedFriend ? (
          <div className="messages-empty">
            <div className="empty-icon" style={{ margin: '0 auto 14px' }}><Icon.MessageCircle /></div>
            <div className="empty-title">Select a friend to message</div>
            <div className="empty-sub">Your conversations with friends will appear here</div>
          </div>
        ) : (
          <>
            <div className="messages-chat-header">
              <div
                className="post-avatar"
                style={{ width: 34, height: 34, fontSize: 12, flexShrink: 0, cursor: 'pointer' }}
                onClick={() => navigate('/profile/' + selectedFriend.username)}
              >
                {selectedFriend.avatar_url ? <img src={selectedFriend.avatar_url} alt="" /> : initials(selectedFriend.full_name)}
              </div>
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => navigate('/profile/' + selectedFriend.username)}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedFriend.full_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-3)' }}>@{selectedFriend.username}</div>
              </div>
            </div>

            <div className="messages-body">
              {loading ? (
                <div className="loading-center"><div className="spinner" /></div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13, padding: 24 }}>
                  Send your first message to {selectedFriend.full_name}
                </div>
              ) : messages.map(m => {
                const isMine = m.sender_id === profile?.id
                return (
                  <div key={m.id} className={'msg-row ' + (isMine ? 'mine' : 'theirs')}>
                    {!isMine && (
                      <div
                        className="post-avatar"
                        style={{ width: 26, height: 26, fontSize: 9, flexShrink: 0, alignSelf: 'flex-end', cursor: 'pointer' }}
                        onClick={() => navigate('/profile/' + selectedFriend.username)}
                      >
                        {(m.sender as any)?.avatar_url
                          ? <img src={(m.sender as any).avatar_url} alt="" />
                          : initials((m.sender as any)?.full_name || '?')}
                      </div>
                    )}
                    <div className="msg-bubble-wrap">
                      {m.post_id && (m.post as any) && (
                        <div className="msg-post-preview">
                          <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginBottom: 4 }}>Shared post</div>
                          <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {(m.post as any)?.caption || (m.post as any)?.content_type}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>
                            by @{(m.post as any)?.profiles?.username}
                          </div>
                        </div>
                      )}
                      {m.body && <div className={'msg-bubble ' + (isMine ? 'mine' : 'theirs')}>{m.body}</div>}
                      <div className={'msg-time ' + (isMine ? 'right' : '')}>
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            <div className="messages-input-row">
              <input
                ref={inputRef}
                className="messages-input"
                placeholder={'Message ' + selectedFriend.full_name + '…'}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              />
              <button className="comment-submit" onClick={send} disabled={sending || !text.trim()}>
                {sending
                  ? <div className="spinner" style={{ width: 12, height: 12 }} />
                  : <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.Send /></span>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
