import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env.local and fill in your credentials.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Profession =
  | 'singer' | 'musician' | 'photographer' | 'poet'
  | 'visual-artist' | 'filmmaker' | 'dancer' | 'comedian'

export type ContentType = 'text' | 'photo' | 'audio' | 'video' | 'poem' | 'document'

export type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends'

export interface Profile {
  id: string
  username: string
  full_name: string
  bio: string
  avatar_url: string
  website: string
  profession: Profession | null
  professions: string[]
  is_pro: boolean
  personal_profile_public: boolean
  follower_count: number
  following_count: number
  friend_count: number
  post_count: number
  created_at: string
}

export interface Post {
  id: string
  user_id: string
  content_type: ContentType
  caption: string
  poem_text: string
  media_url: string
  media_path: string
  tags: string[]
  like_count: number
  comment_count: number
  share_count: number
  pro_upvote_count: number
  is_pro_post: boolean
  visibility: 'public' | 'friends'
  group_id?: string | null
  group?: Group
  created_at: string
  profiles?: Profile
  user_liked?: boolean
  user_pro_upvoted?: boolean
}

export interface Comment {
  id: string
  post_id: string
  user_id: string
  body: string
  created_at: string
  profiles?: Profile
}

export interface FriendRequest {
  id: string
  sender_id: string
  receiver_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  sender?: Profile
  receiver?: Profile
}

export interface Group {
  id: string
  discipline: string
  name: string
  slug: string
  description: string
  is_seeded: boolean
  created_by: string | null
  member_count: number
  post_count: number
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  actor_id: string
  type: 'like' | 'pro_upvote' | 'comment' | 'follow' | 'share' | 'friend_request' | 'friend_accepted'
  post_id: string | null
  is_read: boolean
  created_at: string
  actor?: Profile
  post?: Post
}

export const PROFESSIONS: Record<Profession, { label: string; icon: string; pillClass: string }> = {
  singer:          { label: 'Vocalist / Singer',    icon: '🎤', pillClass: 'pill-singer' },
  musician:        { label: 'Musician',              icon: '🎸', pillClass: 'pill-musician' },
  photographer:    { label: 'Photographer',          icon: '📸', pillClass: 'pill-photographer' },
  poet:            { label: 'Poet & Writer',         icon: '✍️', pillClass: 'pill-poet' },
  'visual-artist': { label: 'Visual Artist',         icon: '🎨', pillClass: 'pill-artist' },
  filmmaker:       { label: 'Filmmaker',             icon: '🎬', pillClass: 'pill-filmmaker' },
  dancer:          { label: 'Dancer',                icon: '💃', pillClass: 'pill-dancer' },
  comedian:        { label: 'Comedian',              icon: '🎭', pillClass: 'pill-comedian' },
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string | null
  post_id: string | null
  created_at: string
  sender?: Profile
  post?: Post
}

export interface Conversation {
  id: string
  created_at: string
  other_user?: Profile
  last_message?: Message
  unread_count?: number
}
