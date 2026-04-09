import { useEffect, useState, useRef } from 'react'
import { supabase, Profile, Message } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

interface Props {
  chatWith: Profile
  onClose: () => void
}

export default function FloatingChat({ chatWith, onClose }: Props) {
  const { profile } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const convIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!profile || !chatWith) return
    async function load() {
      setLoading(true)
      setMessages([])
      const { data, error } = await supabase.rpc('get_or_create_conversation', { other_user_id: chatWith.id })
      if (error) { toast.error('Could not open conversation'); setLoading(false); return }
      const convId = data as string
      setConversationId(convId)
      convIdRef.current = convId

      const { data: msgs } = await supabase
        .from('messages')
        .select('*, sender:sender_id(id, username, full_name, avatar_url)')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true })

      setMessages((msgs || []) as Message[])
      setLoading(false)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
      setTimeout(() => inputRef.current?.focus(), 150)
    }
    load()
  }, [chatWith.id, profile?.id])

  useEffect(() => {
    if (!conversationId) return
    const ch = supabase.channel('float-chat-' + conversationId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + conversationId },
        async (payload) => {
          const msg = payload.new as Message
          setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
          const { data: sender } = await supabase.from('profiles').select('id,username,full_name,avatar_url').eq('id', msg.sender_id).single()
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, sender: sender as Profile } : m))
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [conversationId])

  async function send() {
    if (!profile || !conversationId || !text.trim() || sending) return
    const body = text.trim()
    setText('')
    setSending(true)
    const tempId = 'temp-' + Date.now()
    const temp: Message = {
      id: tempId, conversation_id: conversationId,
      sender_id: profile.id, body, post_id: null,
      created_at: new Date().toISOString(), sender: profile,
    }
    setMessages(prev => [...prev, temp])
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)

    const { data, error } = await supabase.from('messages')
      .insert({ conversation_id: conversationId, sender_id: profile.id, body })
      .select('*').single()
    if (error) toast.error(error.message)
    else setMessages(prev => prev.map(m => m.id === tempId ? (data as Message) : m))
    setSending(false)
  }

  function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  return (
    <div
      className="fixed bottom-0 right-8 w-[380px] bg-white dark:bg-gray-900 rounded-t-2xl z-[200] border border-black/[0.08] dark:border-white/[0.08]"
      style={{
        boxShadow: '0 -4px 32px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.08)',
        transform: minimized ? 'translateY(calc(100% - 56px))' : 'translateY(0)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Header */}
      <div
        className="h-14 px-4 flex items-center justify-between bg-white dark:bg-gray-900 rounded-t-2xl border-b border-gray-100 dark:border-gray-800 cursor-pointer select-none"
        onClick={() => setMinimized(m => !m)}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[10px] font-bold text-blue-700 dark:text-blue-300 overflow-hidden">
              {chatWith.avatar_url ? <img src={chatWith.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(chatWith.full_name)}
            </div>
            <span className="absolute -bottom-px -right-px w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white dark:border-gray-900" />
          </div>
          <div>
            <p className="text-[14px] font-bold text-gray-900 dark:text-white leading-tight">{chatWith.full_name}</p>
            <p className="text-[9px] text-green-500 font-bold uppercase tracking-wide">Online</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <button
            onClick={e => { e.stopPropagation(); setMinimized(m => !m) }}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <span className="flex w-3.5 h-3.5"><Icon.Minus /></span>
          </button>
          <button
            onClick={e => { e.stopPropagation(); onClose() }}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <span className="flex w-3.5 h-3.5"><Icon.X /></span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="h-80 bg-[#fafafa] dark:bg-gray-950 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 [&::-webkit-scrollbar]:w-1">
          {loading ? (
            <div className="flex justify-center items-center h-full">
              <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <div className="w-10 h-10 rounded-full bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center">
                <span className="flex w-4 h-4 text-brand-600"><Icon.MessageCircle /></span>
              </div>
              <p className="text-[12px] text-gray-400">Start a conversation</p>
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_id === profile?.id ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] px-3 py-2 rounded-2xl text-[13px] leading-snug ${
                  msg.sender_id === profile?.id
                    ? 'bg-brand-600 text-white rounded-br-[4px]'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-[4px]'
                }`}>
                  {msg.body}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-800 rounded-xl px-3 py-2">
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Type a message..."
            className="flex-1 bg-transparent border-none outline-none text-[13px] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="w-6 h-6 flex items-center justify-center text-brand-600 disabled:opacity-30 hover:scale-110 transition-transform"
          >
            <span className="flex w-4 h-4"><Icon.Send /></span>
          </button>
        </div>
      </div>
    </div>
  )
}
