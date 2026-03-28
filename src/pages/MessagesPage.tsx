import { useEffect, useState, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { supabase, Profile, Message, Post } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import { getFriends } from '@/lib/friends'
import toast from 'react-hot-toast'

export default function MessagesPage() {
  const { profile } = useAuth()
  const [friends, setFriends] = useState<Profile[]>([])
  const [selectedFriend, setSelectedFriend] = useState<Profile | null>(null)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load friends list
  useEffect(() => {
    if (!profile) return
    async function load() {
      const ids = await getFriends(profile!.id)
      if (!ids.length) return
      const { data } = await supabase.from('profiles').select('*').in('id', ids)
      setFriends((data || []) as Profile[])
    }
    load()
  }, [profile?.id])

  // Open conversation with a friend
  async function openConversation(friend: Profile) {
    setSelectedFriend(friend)
    setMessages([])
    setLoading(true)
    const { data } = await supabase.rpc('get_or_create_conversation', { other_user_id: friend.id })
    const convId = data as string
    setConversationId(convId)

    const { data: msgs } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id, username, full_name, avatar_url), post:post_id(id, caption, content_type, media_url, profiles(username, full_name))')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    setMessages((msgs || []) as Message[])
    setLoading(false)
    // Mark as read
    await supabase.from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', convId).eq('user_id', profile!.id)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
    inputRef.current?.focus()
  }

  // Subscribe to new messages
  useEffect(() => {
    if (!conversationId) return
    const ch = supabase.channel('msgs-' + conversationId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        async (payload) => {
          const msg = payload.new as Message
          // Fetch sender info
          const { data: sender } = await supabase.from('profiles').select('id,username,full_name,avatar_url').eq('id', msg.sender_id).single()
          let post = null
          if (msg.post_id) {
            const { data: p } = await supabase.from('posts').select('id,caption,content_type,media_url,profiles(username,full_name)').eq('id', msg.post_id).single()
            post = p
          }
          setMessages(prev => [...prev, { ...msg, sender: sender as Profile, post: post as any }])
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [conversationId])

  async function send() {
    if (!profile || !conversationId || (!text.trim())) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: profile.id,
      body: text.trim(),
    })
    if (error) toast.error('Failed to send')
    else setText('')
    setSending(false)
  }

  function initials(name: string) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  return (
    <div className="messages-shell">
      {/* Friends sidebar */}
      <div className="messages-sidebar">
        <div className="messages-sidebar-header">
          <div style={{ fontWeight: 600, fontSize: 15 }}>Messages</div>
        </div>
        {friends.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13 }}>
            Add friends to start messaging
          </div>
        ) : friends.map(f => (
          <button
            key={f.id}
            className={`msg-friend-item ${selectedFriend?.id === f.id ? 'active' : ''}`}
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
            {/* Chat header */}
            <div className="messages-chat-header">
              <div className="post-avatar" style={{ width: 34, height: 34, fontSize: 12, flexShrink: 0 }}>
                {selectedFriend.avatar_url ? <img src={selectedFriend.avatar_url} alt="" /> : initials(selectedFriend.full_name)}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedFriend.full_name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--color-text-3)' }}>@{selectedFriend.username}</div>
              </div>
            </div>

            {/* Messages */}
            <div className="messages-body">
              {loading ? (
                <div className="loading-center"><div className="spinner" /></div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--color-text-3)', fontSize: 13, padding: 24 }}>
                  Send your first message to {selectedFriend.full_name}
                </div>
              ) : (
                messages.map(m => {
                  const isMine = m.sender_id === profile?.id
                  return (
                    <div key={m.id} className={`msg-row ${isMine ? 'mine' : 'theirs'}`}>
                      {!isMine && (
                        <div className="post-avatar" style={{ width: 26, height: 26, fontSize: 9, flexShrink: 0, alignSelf: 'flex-end' }}>
                          {(m.sender as any)?.avatar_url ? <img src={(m.sender as any).avatar_url} alt="" /> : initials((m.sender as any)?.full_name || '?')}
                        </div>
                      )}
                      <div className="msg-bubble-wrap">
                        {/* Shared post preview */}
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
                        {m.body && <div className={`msg-bubble ${isMine ? 'mine' : 'theirs'}`}>{m.body}</div>}
                        <div className={`msg-time ${isMine ? 'right' : ''}`}>
                          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="messages-input-row">
              <input
                ref={inputRef}
                className="messages-input"
                placeholder={`Message ${selectedFriend.full_name}…`}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              />
              <button className="comment-submit" onClick={send} disabled={sending || !text.trim()}>
                {sending ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.Send /></span>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
