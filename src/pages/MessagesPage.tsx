import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { supabase, Profile, Message } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import { getFriends } from '@/lib/friends'
import toast from 'react-hot-toast'

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

    const { data, error } = await supabase.rpc('get_or_create_conversation', { other_user_id: friend.id })
    if (error) { toast.error('Could not open conversation: ' + error.message); setLoading(false); return }
    const convId = data as string
    setConversationId(convId)
    convIdRef.current = convId

    const { data: msgs, error: msgsError } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id, username, full_name, avatar_url), post:post_id(id, caption, content_type, media_url, profiles!user_id(username, full_name))')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })

    if (msgsError) toast.error('Failed to load messages: ' + msgsError.message)
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
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* Friends sidebar */}
      <div className="w-64 shrink-0 border-r border-gray-100 dark:border-gray-800 flex flex-col bg-white dark:bg-gray-900 overflow-y-auto">
        <div className="px-4 py-3.5 border-b border-gray-100 dark:border-gray-800">
          <p className="font-semibold text-[15px] text-gray-900 dark:text-white">Messages</p>
        </div>
        {friendsLoading ? (
          <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : friends.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-gray-400">Add friends to start messaging</p>
        ) : friends.map(f => (
          <button
            key={f.id}
            onClick={() => openConversation(f)}
            className={`flex items-center gap-3 px-4 py-3 w-full text-left transition-colors ${
              selectedFriend?.id === f.id
                ? 'bg-brand-50 dark:bg-brand-600/10'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
            }`}
          >
            <div className="w-[38px] h-[38px] rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[13px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
              {f.avatar_url ? <img src={f.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(f.full_name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[13.5px] text-gray-900 dark:text-white truncate">{f.full_name}</p>
              <p className="text-[11.5px] text-gray-400 dark:text-gray-500">@{f.username}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-950">
        {!selectedFriend ? (
          <div className="flex flex-col items-center justify-center h-full">
            <span className="flex w-10 h-10 mb-3 text-gray-300 dark:text-gray-600"><Icon.MessageCircle /></span>
            <p className="font-semibold text-gray-600 dark:text-gray-400">Select a friend to message</p>
            <p className="text-sm mt-1 text-gray-400">Your conversations with friends will appear here</p>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
              <button
                className="w-[34px] h-[34px] rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[12px] font-semibold text-blue-700 dark:text-blue-300 shrink-0"
                onClick={() => navigate('/profile/' + selectedFriend.username)}
              >
                {selectedFriend.avatar_url ? <img src={selectedFriend.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(selectedFriend.full_name)}
              </button>
              <button className="flex-1 text-left" onClick={() => navigate('/profile/' + selectedFriend.username)}>
                <p className="font-semibold text-[14px] text-gray-900 dark:text-white">{selectedFriend.full_name}</p>
                <p className="text-[11.5px] text-gray-400 dark:text-gray-500">@{selectedFriend.username}</p>
              </button>
            </div>

            {/* Messages body */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {loading ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
              ) : messages.length === 0 ? (
                <p className="text-center text-[13px] text-gray-400 py-6">Send your first message to {selectedFriend.full_name}</p>
              ) : messages.map(m => {
                const isMine = m.sender_id === profile?.id
                return (
                  <div key={m.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                    {!isMine && (
                      <button
                        className="w-[26px] h-[26px] rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[9px] font-semibold text-blue-700 dark:text-blue-300 shrink-0"
                        onClick={() => navigate('/profile/' + selectedFriend.username)}
                      >
                        {(m.sender as any)?.avatar_url
                          ? <img src={(m.sender as any).avatar_url} alt="" className="w-full h-full object-cover" />
                          : initials((m.sender as any)?.full_name || '?')}
                      </button>
                    )}
                    <div className={`flex flex-col gap-1 max-w-[70%] ${isMine ? 'items-end' : 'items-start'}`}>
                      {m.post_id && (m.post as any) && (
                        <div className="px-3 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-left">
                          <p className="text-[10px] text-gray-400 mb-1">Shared post</p>
                          <p className="text-[13px] font-medium text-gray-900 dark:text-white truncate">{(m.post as any)?.caption || (m.post as any)?.content_type}</p>
                          <p className="text-[11px] text-gray-400">by @{(m.post as any)?.profiles?.username}</p>
                        </div>
                      )}
                      {m.body && (
                        <div className={`px-3.5 py-2.5 rounded-2xl text-[13.5px] leading-snug ${
                          isMine
                            ? 'bg-brand-600 text-white rounded-br-sm'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-sm'
                        }`}>
                          {m.body}
                        </div>
                      )}
                      <p className={`text-[10.5px] text-gray-400 px-1`}>
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input row */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
              <input
                ref={inputRef}
                className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-4 py-2.5 text-[13.5px] text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-brand-600 dark:focus:border-brand-400 transition-colors"
                placeholder={'Message ' + selectedFriend.full_name + '…'}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              />
              <button
                onClick={send}
                disabled={sending || !text.trim()}
                className="w-9 h-9 rounded-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 flex items-center justify-center text-white transition-colors shrink-0"
              >
                {sending
                  ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                  : <span className="flex w-3.5 h-3.5"><Icon.Send /></span>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
