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
  | 'culinary' | 'fitness' | 'technology' | 'fashion' | 'architecture'
  | 'medicine' | 'education' | 'law' | 'science' | 'business' | 'wellness'

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
  singer:          { label: 'Vocals & Singing',   icon: '🎤', pillClass: 'pill-singer' },
  musician:        { label: 'Music',               icon: '🎸', pillClass: 'pill-musician' },
  photographer:    { label: 'Photography',         icon: '📸', pillClass: 'pill-photographer' },
  poet:            { label: 'Poetry & Writing',    icon: '✍️', pillClass: 'pill-poet' },
  'visual-artist': { label: 'Visual Arts',         icon: '🎨', pillClass: 'pill-artist' },
  filmmaker:       { label: 'Film & Video',        icon: '🎬', pillClass: 'pill-filmmaker' },
  dancer:          { label: 'Dance',               icon: '💃', pillClass: 'pill-dancer' },
  comedian:        { label: 'Performance',         icon: '🎭', pillClass: 'pill-comedian' },
  culinary:        { label: 'Culinary Arts',       icon: '🍽️', pillClass: 'pill-culinary' },
  fitness:         { label: 'Fitness & Sports',    icon: '🏋️', pillClass: 'pill-fitness' },
  technology:      { label: 'Technology',          icon: '💻', pillClass: 'pill-technology' },
  fashion:         { label: 'Fashion & Style',     icon: '👗', pillClass: 'pill-fashion' },
  architecture:    { label: 'Architecture',        icon: '🏛️', pillClass: 'pill-architecture' },
  medicine:        { label: 'Medicine & Health',   icon: '🩺', pillClass: 'pill-medicine' },
  education:       { label: 'Education',           icon: '📚', pillClass: 'pill-education' },
  law:             { label: 'Law & Justice',       icon: '⚖️', pillClass: 'pill-law' },
  science:         { label: 'Science & Research',  icon: '🔬', pillClass: 'pill-science' },
  business:        { label: 'Business',            icon: '💼', pillClass: 'pill-business' },
  wellness:        { label: 'Wellness & Mind',     icon: '🧘', pillClass: 'pill-wellness' },
}

// Maps variant profession strings → canonical discipline key in PROFESSIONS
// Used to group related roles under one discipline for Pro Upvotes and Explore
export const DISCIPLINE_ALIASES: Record<string, string> = {
  // Culinary
  'chef': 'culinary', 'cook': 'culinary', 'baker': 'culinary',
  'pastry chef': 'culinary', 'pastry-chef': 'culinary',
  'sous chef': 'culinary', 'sous-chef': 'culinary',
  'barista': 'culinary', 'caterer': 'culinary',
  'confectioner': 'culinary', 'chocolatier': 'culinary',
  'line cook': 'culinary', 'line-cook': 'culinary',
  'butcher': 'culinary', 'patissier': 'culinary',
  // Fitness
  'athlete': 'fitness', 'trainer': 'fitness',
  'personal trainer': 'fitness', 'personal-trainer': 'fitness',
  'yogi': 'fitness', 'yoga instructor': 'fitness',
  'gymnast': 'fitness', 'martial artist': 'fitness',
  'weightlifter': 'fitness', 'crossfit': 'fitness', 'runner': 'fitness',
  // Technology
  'developer': 'technology', 'programmer': 'technology',
  'software engineer': 'technology', 'coder': 'technology',
  'ux designer': 'technology', 'product designer': 'technology',
  'web developer': 'technology', 'frontend developer': 'technology',
  'data scientist': 'technology', 'engineer': 'technology',
  // Fashion
  'model': 'fashion', 'stylist': 'fashion',
  'tailor': 'fashion', 'seamstress': 'fashion',
  'costume designer': 'fashion', 'fashion designer': 'fashion',
  // Architecture
  'architect': 'architecture', 'interior designer': 'architecture',
  'interior-designer': 'architecture', 'urban planner': 'architecture',
  // Medicine
  'doctor': 'medicine', 'physician': 'medicine', 'nurse': 'medicine',
  'surgeon': 'medicine', 'dentist': 'medicine', 'pharmacist': 'medicine',
  'therapist': 'medicine', 'psychiatrist': 'medicine',
  'medical student': 'medicine', 'paramedic': 'medicine',
  'veterinarian': 'medicine', 'vet': 'medicine',
  'physiotherapist': 'medicine', 'occupational therapist': 'medicine',
  'radiologist': 'medicine', 'cardiologist': 'medicine',
  'pediatrician': 'medicine', 'dermatologist': 'medicine',
  'neurologist': 'medicine', 'oncologist': 'medicine',
  // Education
  'teacher': 'education', 'professor': 'education',
  'lecturer': 'education', 'tutor': 'education',
  'educator': 'education', 'instructor': 'education',
  'principal': 'education', 'dean': 'education',
  'school counselor': 'education', 'teaching assistant': 'education',
  // Law
  'lawyer': 'law', 'attorney': 'law', 'solicitor': 'law',
  'barrister': 'law', 'judge': 'law', 'paralegal': 'law',
  'legal consultant': 'law', 'advocate': 'law',
  'public defender': 'law', 'prosecutor': 'law',
  // Science
  'scientist': 'science', 'researcher': 'science',
  'biologist': 'science', 'chemist': 'science',
  'physicist': 'science', 'geologist': 'science',
  'astronomer': 'science', 'ecologist': 'science',
  'lab technician': 'science', 'marine biologist': 'science',
  // Business
  'entrepreneur': 'business', 'consultant': 'business',
  'manager': 'business', 'ceo': 'business',
  'founder': 'business', 'executive': 'business',
  'analyst': 'business', 'accountant': 'business',
  'marketer': 'business', 'product manager': 'business',
  // Wellness
  'life coach': 'wellness', 'counselor': 'wellness',
  'meditation teacher': 'wellness', 'nutritionist': 'wellness',
  'dietitian': 'wellness', 'mindfulness coach': 'wellness',
  'psychologist': 'wellness', 'mental health': 'wellness',
  'holistic healer': 'wellness', 'reiki': 'wellness',
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
  photographer:    { primary: ['photo'],            hint: 'Photography posts perform best with at least one photo. Add a photo?' },
  singer:          { primary: ['audio', 'video'],   hint: 'Vocal posts perform best with audio or video. Add a recording?' },
  musician:        { primary: ['audio', 'video'],   hint: 'Music posts perform best with audio or video. Add a track?' },
  poet:            { primary: ['poem', 'text'],     hint: 'Poetry posts perform best as a poem or written text. Use the poem editor?' },
  'visual-artist': { primary: ['photo'],            hint: 'Visual art posts perform best with an image. Add a photo?' },
  filmmaker:       { primary: ['video'],            hint: 'Film posts perform best with video. Add a clip?' },
  dancer:          { primary: ['video'],            hint: 'Dance posts perform best with video. Add a clip?' },
  comedian:        { primary: ['video', 'text'],    hint: 'Performance posts perform best with video. Add a clip?' },
  culinary:        { primary: ['photo', 'video'],   hint: 'Culinary posts perform best with photos or video. Add media?' },
  fitness:         { primary: ['video', 'photo'],   hint: 'Fitness posts perform best with video or photos. Add media?' },
  technology:      { primary: ['text', 'document'], hint: 'Tech posts perform best as detailed write-ups. Consider writing more?' },
  fashion:         { primary: ['photo'],            hint: 'Fashion posts perform best with photos. Add a photo?' },
  architecture:    { primary: ['photo'],            hint: 'Architecture posts perform best with photos. Add a photo?' },
  medicine:        { primary: ['text', 'document'], hint: 'Medical posts perform best as detailed text. Consider adding more context?' },
  education:       { primary: ['text', 'document'], hint: 'Education posts perform best as text or documents. Use the text editor?' },
  law:             { primary: ['text', 'document'], hint: 'Law posts perform best as detailed text. Consider a written post?' },
  science:         { primary: ['text', 'document'], hint: 'Science posts perform best as text or documents. Add your findings in writing?' },
  business:        { primary: ['text'],             hint: 'Business posts perform best as written insights. Consider adding more context?' },
  wellness:        { primary: ['text', 'video'],    hint: 'Wellness posts perform best as text or video. Add some depth?' },
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
