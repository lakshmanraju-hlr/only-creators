import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Copy .env.example to .env.local and fill in your credentials.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Profession =
  | 'photography' | 'music' | 'dance' | 'art' | 'film' | 'design' | 'writing'
  | 'fitness' | 'culinary' | 'technology' | 'fashion' | 'sports'

export type ContentType = 'text' | 'photo' | 'audio' | 'video' | 'poem' | 'document'

export type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends'

export interface Profile {
  id: string
  username: string
  full_name: string
  bio: string
  avatar_url: string
  website: string
  profession: string | null
  professions: string[]
  role_title: string | null   // optional job title, e.g. "Software Engineer"
  workplace: string | null    // optional workplace, e.g. "Google"
  is_pro: boolean
  personal_profile_public: boolean
  follower_count: number
  following_count: number
  friend_count: number
  post_count: number
  interests: string[]
  post_formats: string[]
  verification_count: number
  created_at: string
}

export type PostType = 'general' | 'pro'

export type PersonaLevel = 'newcomer' | 'contributor' | 'expert' | 'authority'

// Trust weight used in Pro Multiplier calculation per PRD
export const TRUST_WEIGHTS: Record<PersonaLevel, number> = {
  newcomer:    1,   // Participant
  contributor: 3,   // Contributor
  expert:      6,   // Expert
  authority:   10,  // Authority
}

export interface DisciplinePersona {
  id: string
  user_id: string
  discipline: string
  role_title: string | null
  years_exp: number | null
  bio: string | null
  credentials: string | null
  level: PersonaLevel
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
  thumb_url?: string
  display_url?: string
  tags: string[]
  like_count: number
  comment_count: number
  share_count: number
  pro_upvote_count: number
  is_pro_post: boolean
  is_pro: boolean
  post_type: PostType
  persona_discipline: string | null
  visibility: 'public' | 'friends'
  group_id?: string | null
  group?: Group
  created_at: string
  expires_at?: string | null
  profiles?: Profile
  user_liked?: boolean
  user_pro_upvoted?: boolean
}

export interface PinnedPost {
  user_id: string
  post_id: string
  pin_order: number
  pinned_at: string
}

export interface SubgroupFollow {
  user_id: string
  subgroup_id: string
  followed_at: string
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
  follower_count: number
  parent_group_id: string | null
  is_user_created: boolean
  needs_review: boolean
  created_at: string
}

export interface PostFeature {
  post_id: string
  featured_user_id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  post?: Post
  featured_user?: Profile
  actor?: Profile  // the post author
}

export interface Notification {
  id: string
  user_id: string
  actor_id: string
  type: 'like' | 'pro_upvote' | 'comment' | 'follow' | 'share' | 'friend_request' | 'friend_accepted' | 'peer_verify' | 'message' | 'feature_tag'
  post_id: string | null
  is_read: boolean
  created_at: string
  actor?: Profile
  post?: Post
}

export const PROFESSIONS: Record<Profession, { label: string; icon: string; pillClass: string }> = {
  photography: { label: 'Photography', icon: '📸', pillClass: 'pill-photography' },
  music:       { label: 'Music',       icon: '🎵', pillClass: 'pill-music' },
  dance:       { label: 'Dance',       icon: '💃', pillClass: 'pill-dance' },
  art:         { label: 'Art',         icon: '🎨', pillClass: 'pill-art' },
  film:        { label: 'Film',        icon: '🎬', pillClass: 'pill-film' },
  design:      { label: 'Design',      icon: '✏️', pillClass: 'pill-design' },
  writing:     { label: 'Writing',     icon: '✍️', pillClass: 'pill-writing' },
  fitness:     { label: 'Fitness',     icon: '🏋️', pillClass: 'pill-fitness' },
  culinary:    { label: 'Culinary',    icon: '🍽️', pillClass: 'pill-culinary' },
  technology:  { label: 'Technology',  icon: '💻', pillClass: 'pill-technology' },
  fashion:     { label: 'Fashion',     icon: '👗', pillClass: 'pill-fashion' },
  sports:      { label: 'Sports',      icon: '⚽', pillClass: 'pill-sports' },
}

// Maps variant profession strings → canonical discipline key in PROFESSIONS
// Used to group related roles under one discipline for Pro Upvotes and Explore
export const DISCIPLINE_ALIASES: Record<string, string> = {
  // Photography
  'photographer': 'photography',
  // Music
  'singer': 'music', 'musician': 'music', 'vocalist': 'music',
  'guitarist': 'music', 'pianist': 'music', 'drummer': 'music',
  'bassist': 'music', 'composer': 'music', 'producer': 'music',
  // Dance
  'dancer': 'dance', 'choreographer': 'dance', 'ballerina': 'dance',
  // Art
  'visual-artist': 'art', 'artist': 'art', 'illustrator': 'art',
  'painter': 'art', 'sculptor': 'art',
  // Film
  'filmmaker': 'film', 'director': 'film', 'cinematographer': 'film',
  'editor': 'film', 'animator': 'film',
  // Design
  'designer': 'design', 'graphic designer': 'design', 'graphic-designer': 'design',
  'ui designer': 'design', 'ux designer': 'design', 'product designer': 'design',
  'interior designer': 'design', 'interior-designer': 'design',
  // Writing
  'poet': 'writing', 'writer': 'writing', 'author': 'writing',
  'journalist': 'writing', 'screenwriter': 'writing',
  // Fitness
  'athlete': 'fitness', 'trainer': 'fitness',
  'personal trainer': 'fitness', 'personal-trainer': 'fitness',
  'yogi': 'fitness', 'yoga instructor': 'fitness',
  'gymnast': 'fitness', 'martial artist': 'fitness',
  'weightlifter': 'fitness', 'runner': 'fitness',
  // Culinary
  'chef': 'culinary', 'cook': 'culinary', 'baker': 'culinary',
  'pastry chef': 'culinary', 'pastry-chef': 'culinary',
  'sous chef': 'culinary', 'sous-chef': 'culinary',
  'barista': 'culinary', 'caterer': 'culinary',
  'confectioner': 'culinary', 'chocolatier': 'culinary',
  'line cook': 'culinary', 'line-cook': 'culinary',
  'butcher': 'culinary', 'patissier': 'culinary',
  // Technology
  'developer': 'technology', 'programmer': 'technology',
  'software engineer': 'technology', 'coder': 'technology',
  'web developer': 'technology', 'frontend developer': 'technology',
  'data scientist': 'technology', 'engineer': 'technology',
  // Fashion
  'model': 'fashion', 'stylist': 'fashion',
  'tailor': 'fashion', 'seamstress': 'fashion',
  'costume designer': 'fashion', 'fashion designer': 'fashion',
  // Sports
  'footballer': 'sports', 'basketball player': 'sports',
  'cricketer': 'sports', 'swimmer': 'sports', 'boxer': 'sports',
  'sprinter': 'sports', 'tennis player': 'sports',
}

// Returns the canonical discipline key for any profession string
export function getCanonicalDiscipline(profession: string | null | undefined): string | null {
  if (!profession) return null
  const lower = profession.toLowerCase()
  if ((PROFESSIONS as Record<string, unknown>)[profession]) return profession
  return DISCIPLINE_ALIASES[lower] ?? profession
}

// Returns all profession strings that belong to a given discipline (for .in() DB queries)
export function getDisciplineMembers(discipline: string): string[] {
  const aliases = Object.entries(DISCIPLINE_ALIASES)
    .filter(([, canon]) => canon === discipline)
    .map(([alias]) => alias)
  return [discipline, ...aliases]
}

// Returns display metadata for any profession — predefined, aliased, or custom user-generated
export function getProfMeta(profession: string | null | undefined): { label: string; icon: string; pillClass: string } | null {
  if (!profession) return null
  // Direct predefined match
  const predefined = (PROFESSIONS as Record<string, { label: string; icon: string; pillClass: string }>)[profession]
  if (predefined) return predefined
  // Alias resolution → canonical discipline meta
  const canonical = DISCIPLINE_ALIASES[profession.toLowerCase()]
  if (canonical) {
    const canonMeta = (PROFESSIONS as Record<string, { label: string; icon: string; pillClass: string }>)[canonical]
    if (canonMeta) return canonMeta
  }
  // Custom discipline fallback
  const label = profession.charAt(0).toUpperCase() + profession.slice(1).replace(/-/g, ' ')
  return { label, icon: '✦', pillClass: 'pill-other' }
}

export const PERSONA_LEVELS: Record<PersonaLevel, { label: string; next?: PersonaLevel; nextDesc: string }> = {
  newcomer:    { label: 'Participant',  next: 'contributor', nextDesc: '3 Pro Posts approved + community engagement' },
  contributor: { label: 'Contributor', next: 'expert',      nextDesc: '15 Pro Posts + 30 Pro Votes received' },
  expert:      { label: 'Expert',      next: 'authority',   nextDesc: '50 Pro Posts + 100 Pro Votes received' },
  authority:   { label: 'Authority',   nextDesc: 'Platform\'s top verified professional in this field' },
}

// Content type profiles per field — drives composer UX and initial distribution score
export const FIELD_CONTENT_PROFILES: Record<string, {
  primary: string[]     // preferred content types for this field
  hint: string          // soft prompt shown when off-profile
}> = {
  photography: { primary: ['photo'],            hint: 'Photography posts perform best with at least one photo. Add a photo?' },
  music:       { primary: ['audio', 'video'],   hint: 'Music posts perform best with audio or video. Add a recording?' },
  dance:       { primary: ['video'],            hint: 'Dance posts perform best with video. Add a clip?' },
  art:         { primary: ['photo'],            hint: 'Art posts perform best with an image. Add a photo?' },
  film:        { primary: ['video'],            hint: 'Film posts perform best with video. Add a clip?' },
  design:      { primary: ['photo'],            hint: 'Design posts perform best with an image. Add a photo?' },
  writing:     { primary: ['text'],             hint: 'Writing posts perform best as text. Use the text editor?' },
  fitness:     { primary: ['video', 'photo'],   hint: 'Fitness posts perform best with video or photos. Add media?' },
  culinary:    { primary: ['photo', 'video'],   hint: 'Culinary posts perform best with photos or video. Add media?' },
  technology:  { primary: ['text', 'document'], hint: 'Tech posts perform best as detailed write-ups. Consider writing more?' },
  fashion:     { primary: ['photo'],            hint: 'Fashion posts perform best with photos. Add a photo?' },
  sports:      { primary: ['video', 'photo'],   hint: 'Sports posts perform best with video or photos. Add media?' },
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
