import toast from 'react-hot-toast'
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase, Profile, Post, getProfMeta, DisciplinePersona } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import PostCard from '@/components/PostCard'
import SocialButton from '@/components/SocialButton'
import UploadModal from '@/components/UploadModal'
import { Icon } from '@/lib/icons'

const DISCIPLINE_MAP: Record<string, { label: string; IconComp: () => JSX.Element }> = {
  'photographer':  { label: 'Photography',        IconComp: Icon.Camera },
  'singer':        { label: 'Vocals & Singing',   IconComp: Icon.Mic },
  'musician':      { label: 'Music',              IconComp: Icon.Music },
  'poet':          { label: 'Poetry & Writing',   IconComp: Icon.PenLine },
  'visual-artist': { label: 'Visual Arts',        IconComp: Icon.Paintbrush },
  'filmmaker':     { label: 'Film & Video',       IconComp: Icon.Film },
  'dancer':        { label: 'Dance',              IconComp: Icon.Music },
  'comedian':      { label: 'Performance',        IconComp: Icon.Drama },
  'culinary':      { label: 'Culinary Arts',      IconComp: Icon.Utensils },
  'fitness':       { label: 'Fitness & Sports',   IconComp: Icon.Activity },
  'technology':    { label: 'Technology',         IconComp: Icon.Code },
  'fashion':       { label: 'Fashion & Style',    IconComp: Icon.Scissors },
  'architecture':  { label: 'Architecture',       IconComp: Icon.Building },
  'medicine':      { label: 'Medicine & Health',  IconComp: Icon.Heart2 },
  'education':     { label: 'Education',          IconComp: Icon.PenLine },
  'law':           { label: 'Law & Justice',      IconComp: Icon.Shield },
  'science':       { label: 'Science & Research', IconComp: Icon.Microscope },
  'business':      { label: 'Business',           IconComp: Icon.Briefcase },
  'wellness':      { label: 'Wellness & Mind',    IconComp: Icon.Heart2 },
}

export default function ProfilePage() {
  const { username } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { profile: myProfile, refreshProfile } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [gridView, setGridView] = useState(true)
  const [personas, setPersonas] = useState<DisciplinePersona[]>([])
  const [avatarLightbox, setAvatarLightbox] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [endorsementCount, setEndorsementCount] = useState(0)
  const [hasEndorsed, setHasEndorsed] = useState(false)
  const [endorsing, setEndorsing] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  const isOwnProfile = !username || profile?.id === myProfile?.id
  const [hasVerified, setHasVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)

  function getCanonicalDiscipline(profession?: string | null) {
    if (!profession) return null
    const p = profession.toLowerCase()
    if (p.includes('photo')) return 'photographer'
    if (p.includes('sing') || p.includes('vocal')) return 'singer'
    if (p.includes('music')) return 'musician'
    if (p.includes('poet') || p.includes('writ')) return 'poet'
    if (p.includes('art') || p.includes('paint') || p.includes('visual')) return 'visual-artist'
    if (p.includes('film') || p.includes('video')) return 'filmmaker'
    if (p.includes('danc')) return 'dancer'
    return null
  }

  const myDiscipline = getCanonicalDiscipline(myProfile?.profession)
  const theirDiscipline = getCanonicalDiscipline(profile?.profession)
  const canVerify = !isOwnProfile && !!(myProfile?.is_pro && profile?.is_pro && myDiscipline && theirDiscipline && myDiscipline === theirDiscipline)

  useEffect(() => {
    async function load() {
      setLoading(true)
      let profileData: Profile | null = null
      if (username) {
        const { data } = await supabase.from('profiles').select('*').eq('username', username).single()
        profileData = data as Profile
      } else {
        profileData = myProfile
      }
      setProfile(profileData)
      if (!profileData) { setLoading(false); return }

      const isOwn = !username || profileData.id === myProfile?.id

      const { data: personaData } = await supabase
        .from('discipline_personas').select('*').eq('user_id', profileData.id).order('created_at')
      setPersonas((personaData || []) as DisciplinePersona[])

      let postsQuery = supabase
        .from('posts')
        .select('id, user_id, content_type, caption, poem_text, media_url, media_path, tags, like_count, comment_count, share_count, pro_upvote_count, is_pro_post, post_type, persona_discipline, visibility, group_id, group:group_id(id,name,slug), created_at')
        .eq('user_id', profileData.id)
        .order('created_at', { ascending: false })

      if (!isOwn) postsQuery = postsQuery.eq('visibility', 'public')

      const { data: postsData } = await postsQuery
      const enriched = (postsData || []).map((p: any) => ({ ...p, profiles: profileData })) as Post[]
      setPosts(enriched)
      setLoading(false)

      if (location.hash) {
        setGridView(false)
        const anchor = location.hash.slice(1)
        setTimeout(() => {
          const el = document.getElementById(anchor)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 250)
      }
    }
    load()
  }, [username, myProfile?.id, location.hash])

  useEffect(() => {
    if (!loading && posts.length > 0 && window.location.hash.startsWith('#post-')) {
      const postId = window.location.hash.replace('#post-', '')
      const post = posts.find(p => p.id === postId)
      if (post) {
        setGridView(false)
        setTimeout(() => {
          const el = document.getElementById('post-' + postId)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 200)
      }
    }
  }, [loading, posts])

  useEffect(() => {
    if (!myProfile || !profile || isOwnProfile) return
    supabase.from('peer_verifications')
      .select('id').eq('verifier_id', myProfile.id).eq('verified_id', profile.id).single()
      .then(({ data }) => setHasVerified(!!data))
  }, [myProfile?.id, profile?.id])

  useEffect(() => {
    if (!profile) return
    supabase.from('endorsements').select('id', { count: 'exact', head: true }).eq('endorsed_id', profile.id)
      .then(({ count }) => setEndorsementCount(count || 0))
    if (myProfile && !isOwnProfile) {
      supabase.from('endorsements').select('id').eq('endorser_id', myProfile.id).eq('endorsed_id', profile.id).single()
        .then(({ data }) => setHasEndorsed(!!data))
    }
  }, [profile?.id, myProfile?.id, isOwnProfile])

  async function toggleVerify() {
    if (!myProfile || !profile || !canVerify) return
    setVerifying(true)
    if (hasVerified) {
      await supabase.from('peer_verifications').delete().match({ verifier_id: myProfile.id, verified_id: profile.id })
      setHasVerified(false)
      setProfile(p => p ? { ...p, verification_count: Math.max(0, (p.verification_count || 0) - 1) } : p)
      toast('Verification removed')
    } else {
      const { error } = await supabase.from('peer_verifications').insert({
        verifier_id: myProfile.id, verified_id: profile.id, discipline: myDiscipline,
      })
      if (error) { toast.error(error.message); setVerifying(false); return }
      await supabase.from('notifications').insert({
        user_id: profile.id, actor_id: myProfile.id, type: 'peer_verify', post_id: null,
      })
      setHasVerified(true)
      setProfile(p => p ? { ...p, verification_count: (p.verification_count || 0) + 1 } : p)
      toast.success('Peer verified!')
    }
    setVerifying(false)
  }

  async function toggleEndorse() {
    if (!myProfile || !profile || isOwnProfile) return
    setEndorsing(true)
    if (hasEndorsed) {
      await supabase.from('endorsements').delete().match({ endorser_id: myProfile.id, endorsed_id: profile.id })
      setHasEndorsed(false)
      setEndorsementCount(c => Math.max(0, c - 1))
      toast('Endorsement removed')
    } else {
      const { error } = await supabase.from('endorsements').insert({ endorser_id: myProfile.id, endorsed_id: profile.id })
      if (error) { toast.error(error.message); setEndorsing(false); return }
      setHasEndorsed(true)
      setEndorsementCount(c => c + 1)
      toast.success('Endorsed!')
    }
    setEndorsing(false)
  }

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !myProfile) return
    setUploadingAvatar(true)
    const ext = file.name.split('.').pop()
    const path = myProfile.id + '/avatar.' + ext
    await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const avatarUrl = data.publicUrl + '?t=' + Date.now()
    await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', myProfile.id)
    await refreshProfile()
    setProfile(p => p ? { ...p, avatar_url: avatarUrl } : p)
    toast.success('Photo updated!')
    setUploadingAvatar(false)
  }

  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  const filteredPosts = selectedDiscipline
    ? posts.filter(p => p.persona_discipline === selectedDiscipline)
    : posts

  // ── Grid Cell ──────────────────────────────────────────────────────────────
  function GridCell({ post, onDelete }: { post: Post; onDelete?: () => void }) {
    const [hovered, setHovered] = useState(false)
    return (
      <motion.div
        className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-pointer"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => { setSelectedPost(post); setGridView(false) }}
        whileHover={{ scale: 1.015 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        {post.content_type === 'photo' && post.media_url ? (
          <img src={post.media_url} alt="" className="w-full h-full object-cover" />
        ) : post.content_type === 'video' && post.media_url ? (
          <>
            <video src={post.media_url} className="w-full h-full object-cover" muted />
            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
              <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <span className="flex w-6 h-6 text-white"><Icon.Video /></span>
              </div>
            </div>
          </>
        ) : post.content_type === 'audio' ? (
          <div className="w-full h-full bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center">
            <span className="flex w-8 h-8 text-white/80"><Icon.Music /></span>
          </div>
        ) : post.content_type === 'poem' ? (
          <div className="w-full h-full bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 flex flex-col items-center justify-center p-4 gap-1">
            <span className="text-3xl text-amber-400 opacity-50 leading-none">"</span>
            {post.poem_text && (
              <p className="text-[10px] text-gray-500 text-center italic overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                {post.poem_text}
              </p>
            )}
          </div>
        ) : post.content_type === 'document' ? (
          <div className="w-full h-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
            <span className="flex w-8 h-8 text-gray-400"><Icon.FileText /></span>
          </div>
        ) : (
          <div className="w-full h-full bg-gray-50 dark:bg-gray-800 flex flex-col items-center justify-center p-4 gap-2">
            <span className="flex w-6 h-6 text-gray-400"><Icon.MessageCircle /></span>
            {post.caption && (
              <p className="text-[10px] text-gray-500 text-center overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                {post.caption}
              </p>
            )}
          </div>
        )}

        {/* Hover overlay */}
        <div className={`absolute inset-0 bg-black/40 flex items-end p-3 transition-opacity duration-150 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center gap-3 text-white text-xs font-semibold">
            <span>♥ {post.like_count}</span>
            <span>💬 {post.comment_count}</span>
          </div>
          {isOwnProfile && onDelete && (
            <button
              onClick={async e => {
                e.stopPropagation()
                const { error } = await supabase.from('posts').delete().eq('id', post.id)
                if (!error) { if (post.media_path) await supabase.storage.from('posts').remove([post.media_path]); onDelete() }
              }}
              className="absolute top-2 right-2 bg-brand-600/90 text-white rounded-lg px-2 py-1 text-[11px] font-medium flex items-center gap-1 hover:bg-brand-700 transition-colors"
            >
              <span className="flex w-3 h-3"><Icon.Trash /></span> Delete
            </button>
          )}
        </div>
      </motion.div>
    )
  }

  // ── Loading / not found ────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!profile) return (
    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
      <span className="flex w-12 h-12 mb-3 text-gray-300"><Icon.Profile /></span>
      <p className="font-semibold text-gray-500">Creator not found</p>
    </div>
  )

  const isPrivate = !isOwnProfile && profile.personal_profile_public === false

  return (
    <div className="min-h-full bg-white dark:bg-gray-950">

      {/* ── PROFILE HEADER ── */}
      <div className="max-w-[860px] mx-auto px-6 pt-8 pb-6">
        <div className="flex items-start gap-6">

          {/* Avatar */}
          <div className="relative shrink-0">
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            <button
              onClick={() => {
                if (isOwnProfile && !profile.avatar_url) avatarInputRef.current?.click()
                else if (profile.avatar_url) setAvatarLightbox(true)
              }}
              className="w-24 h-24 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 ring-4 ring-white dark:ring-gray-950 shadow-md block"
            >
              {uploadingAvatar ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xl font-bold text-blue-700 dark:text-blue-300">
                  {initials(profile.full_name)}
                </div>
              )}
            </button>
            {isOwnProfile && (
              <button
                onClick={() => avatarInputRef.current?.click()}
                title={profile.avatar_url ? 'Change photo' : 'Add photo'}
                className="absolute bottom-0.5 right-0.5 w-7 h-7 bg-brand-600 rounded-full flex items-center justify-center shadow-md hover:bg-brand-700 transition-colors"
              >
                <span className="flex w-3.5 h-3.5 text-white"><Icon.Camera /></span>
              </button>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[22px] font-bold text-gray-900 dark:text-white leading-tight">{profile.full_name}</h1>
                  {profile.is_pro && (
                    <span title="Verified pro" className="w-[18px] h-[18px] rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                      <svg viewBox="0 0 12 10" className="w-[9px] h-[9px]"><path d="M1 5l3 3 7-7" strokeWidth="1.8" stroke="white" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                  )}
                </div>
                {(profile.role_title || (profile as any).workplace) && (
                  <p className="text-gray-500 dark:text-gray-400 text-[13.5px] mt-0.5 font-medium">
                    {profile.role_title}
                    {profile.role_title && (profile as any).workplace && ' at '}
                    {(profile as any).workplace}
                  </p>
                )}
                {profile.bio && (
                  <p className="text-gray-500 dark:text-gray-400 text-sm mt-2 leading-relaxed max-w-sm">{profile.bio}</p>
                )}
                {profile.website && (
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 text-sm text-brand-600 mt-1.5 hover:underline"
                  >
                    <span className="flex w-3.5 h-3.5"><Icon.Globe /></span>
                    {profile.website.replace(/^https?:\/\//, '')}
                  </a>
                )}
              </div>

              {/* Actions */}
              {isOwnProfile ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="px-5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold rounded-full hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors tracking-wide"
                  >
                    EDIT PROFILE
                  </button>
                  <button
                    onClick={() => setShowUpload(true)}
                    className="w-9 h-9 border border-gray-200 dark:border-gray-700 rounded-full flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    title="New post"
                  >
                    <span className="flex w-4 h-4 text-gray-500 dark:text-gray-400"><Icon.Settings /></span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    onClick={() => navigate('/messages?with=' + profile.id)}
                    className="px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-full hover:bg-brand-700 transition-colors"
                  >
                    Message
                  </button>
                  <SocialButton targetId={profile.id} targetName={profile.full_name} />
                  <button
                    onClick={toggleEndorse}
                    disabled={endorsing}
                    className={`px-4 py-2 text-sm font-medium rounded-full border transition-colors ${
                      hasEndorsed
                        ? 'bg-brand-600 text-white border-brand-600 hover:bg-brand-700'
                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {hasEndorsed ? 'Endorsed ✓' : 'Endorse'}
                  </button>
                  {canVerify && (
                    <button
                      onClick={toggleVerify}
                      disabled={verifying}
                      className={`px-4 py-2 text-sm font-medium rounded-full border transition-colors ${
                        hasVerified
                          ? 'bg-amber-500 text-white border-amber-500 hover:bg-amber-600'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      {hasVerified ? 'Verified ✓' : 'Verify Peer'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="flex items-center gap-8 mt-5">
              {[
                { value: profile.follower_count ?? 0, label: 'FOLLOWERS' },
                { value: profile.post_count ?? posts.length, label: 'POSTS' },
                { value: endorsementCount, label: 'ENDORSEMENTS' },
              ].map(({ value, label }) => (
                <div key={label}>
                  <div className="text-[20px] font-bold text-gray-900 dark:text-white leading-tight">{Number(value).toLocaleString()}</div>
                  <div className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 tracking-widest mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── DISCIPLINE TABS ── */}
      <div className="sticky top-0 bg-white dark:bg-gray-950 border-b border-gray-100 dark:border-gray-800 z-10">
        <div className="max-w-[860px] mx-auto">
          <div className="flex items-center gap-1 px-6 py-3 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setSelectedDiscipline(null)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                selectedDiscipline === null
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className="flex w-3.5 h-3.5"><Icon.Feed /></span>
              All
            </button>
            {personas.map(persona => {
              const disc = DISCIPLINE_MAP[persona.discipline]
              if (!disc) return null
              const isActive = selectedDiscipline === persona.discipline
              return (
                <button
                  key={persona.discipline}
                  onClick={() => setSelectedDiscipline(persona.discipline)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                    isActive
                      ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <span className="flex w-3.5 h-3.5"><disc.IconComp /></span>
                  {disc.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div className="max-w-[860px] mx-auto px-6 py-6">

        {/* Section header */}
        {filteredPosts.length > 0 && (
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-gray-900 dark:text-white">
              {selectedDiscipline ? (DISCIPLINE_MAP[selectedDiscipline]?.label ?? selectedDiscipline) : 'All Posts'}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setGridView(true)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                  gridView
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                    : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
                }`}
              >
                <span className="flex w-4 h-4"><Icon.GridView /></span>
              </button>
              <button
                onClick={() => setGridView(false)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                  !gridView
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                    : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
                }`}
              >
                <span className="flex w-4 h-4"><Icon.ListView /></span>
              </button>
            </div>
          </div>
        )}

        {/* Private profile */}
        {isPrivate && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <span className="flex w-10 h-10 mb-3 text-gray-300 dark:text-gray-600"><Icon.Lock /></span>
            <p className="font-semibold text-gray-600 dark:text-gray-400">This profile is private</p>
            <p className="text-sm mt-1 text-gray-400">Only friends can see this creator's posts.</p>
          </div>
        )}

        {/* Empty state */}
        {!isPrivate && filteredPosts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <span className="flex w-10 h-10 mb-3 text-gray-300 dark:text-gray-600"><Icon.Camera /></span>
            <p className="font-semibold text-gray-600 dark:text-gray-400">
              {isOwnProfile ? "You haven't posted yet" : 'No posts yet'}
            </p>
            {isOwnProfile && (
              <button
                onClick={() => setShowUpload(true)}
                className="mt-4 px-5 py-2 bg-brand-600 text-white text-sm font-medium rounded-full hover:bg-brand-700 transition-colors"
              >
                Create your first post
              </button>
            )}
          </div>
        )}

        {/* Grid view */}
        {!isPrivate && filteredPosts.length > 0 && gridView && (
          <motion.div
            className="grid grid-cols-2 gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {filteredPosts.map(p => (
              <GridCell
                key={p.id}
                post={p}
                onDelete={() => setPosts(prev => prev.filter(x => x.id !== p.id))}
              />
            ))}
          </motion.div>
        )}

        {/* Feed view */}
        {!isPrivate && filteredPosts.length > 0 && !gridView && (
          <motion.div
            className="max-w-[600px] mx-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {selectedPost && (
              <div className="mb-3">
                <button
                  className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors px-3 py-1.5 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800"
                  onClick={() => setSelectedPost(null)}
                >
                  <span className="flex w-3.5 h-3.5"><Icon.ArrowLeft /></span>
                  All posts
                </button>
              </div>
            )}
            {(selectedPost ? [selectedPost] : filteredPosts).map(p => (
              <PostCard
                key={p.id}
                post={p}
                onUpdated={() => {
                  setPosts(prev => prev.filter(x => x.id !== p.id))
                  if (selectedPost?.id === p.id) setSelectedPost(null)
                }}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* ── AVATAR LIGHTBOX ── */}
      <AnimatePresence>
        {avatarLightbox && profile.avatar_url && (
          <motion.div
            className="fixed inset-0 bg-black/85 flex items-center justify-center z-[10000]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setAvatarLightbox(false)}
          >
            <div className="relative max-w-[90vw] max-h-[90vh]">
              <img
                src={profile.avatar_url}
                alt={profile.full_name}
                className="rounded-2xl max-w-[90vw] max-h-[90vh] object-contain shadow-2xl"
              />
              <button
                onClick={() => setAvatarLightbox(false)}
                className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-gray-100 transition-colors"
              >
                <span className="flex w-3.5 h-3.5"><Icon.X /></span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showEditModal && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEditModal(false)}
          onSaved={async () => { await refreshProfile(); setShowEditModal(false) }}
        />
      )}

      {showUpload && (
        <UploadModal
          onClose={() => {
            setShowUpload(false)
            if (myProfile) {
              supabase.from('posts')
                .select('id, user_id, content_type, caption, poem_text, media_url, media_path, tags, like_count, comment_count, share_count, pro_upvote_count, is_pro_post, post_type, persona_discipline, visibility, group_id, group:group_id(id,name,slug), created_at')
                .eq('user_id', myProfile.id)
                .order('created_at', { ascending: false })
                .then(({ data }) => {
                  if (data) setPosts((data as any[]).map(p => ({ ...p, profiles: profile })) as Post[])
                })
            }
          }}
        />
      )}
    </div>
  )
}

// ── Edit Profile Modal ───────────────────────────────────────────────────────
function EditProfileModal({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const { profile: myProfile } = useAuth()
  const [fullName, setFullName] = useState(profile.full_name)
  const [username, setUsername] = useState(profile.username)
  const [roleTitle, setRoleTitle] = useState(profile.role_title || '')
  const [workplace, setWorkplace] = useState((profile as any).workplace || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [website, setWebsite] = useState(profile.website || '')
  const [personalPublic, setPersonalPublic] = useState(profile.personal_profile_public !== false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || '')
  const [saving, setSaving] = useState(false)
  const [personas, setPersonas] = useState<DisciplinePersona[]>([])
  const [personaEdits, setPersonaEdits] = useState<Record<string, { years_exp: string; bio: string; credentials: string }>>({})

  useEffect(() => {
    if (!myProfile) return
    supabase.from('discipline_personas').select('*').eq('user_id', myProfile.id).order('post_count', { ascending: false })
      .then(({ data }) => {
        const list = (data || []) as DisciplinePersona[]
        setPersonas(list)
        const edits: Record<string, { years_exp: string; bio: string; credentials: string }> = {}
        list.forEach(p => {
          edits[p.id] = { years_exp: p.years_exp != null ? String(p.years_exp) : '', bio: p.bio ?? '', credentials: p.credentials ?? '' }
        })
        setPersonaEdits(edits)
      })
  }, [myProfile?.id])

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setAvatarFile(f)
    setAvatarPreview(URL.createObjectURL(f))
  }

  function setPersonaField(id: string, field: 'years_exp' | 'bio' | 'credentials', value: string) {
    setPersonaEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function save() {
    if (!myProfile) return
    setSaving(true)
    let avatarUrl = profile.avatar_url
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop()
      const path = myProfile.id + '/avatar.' + ext
      await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true })
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      avatarUrl = data.publicUrl + '?t=' + Date.now()
    }
    const { error } = await supabase.from('profiles').update({
      full_name: fullName,
      username: username.replace('@', '').toLowerCase(),
      role_title: roleTitle.trim() || null,
      workplace: workplace.trim() || null,
      bio, website, avatar_url: avatarUrl,
      personal_profile_public: personalPublic,
      updated_at: new Date().toISOString(),
    }).eq('id', myProfile.id)
    if (error) { toast.error(error.message); setSaving(false); return }

    await Promise.all(personas.map(p => {
      const edits = personaEdits[p.id]
      if (!edits) return Promise.resolve()
      return supabase.from('discipline_personas').update({
        years_exp: edits.years_exp ? parseInt(edits.years_exp) : null,
        bio: edits.bio || null,
        credentials: edits.credentials || null,
      }).eq('id', p.id)
    }))

    toast.success('Profile updated')
    onSaved()
    setSaving(false)
  }

  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  return (
    <div
      className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center z-[1000] p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Edit profile</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="flex w-4 h-4 text-gray-500"><Icon.X /></span>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-xl font-bold text-blue-700 dark:text-blue-300 shrink-0">
              {avatarPreview
                ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                : initials(fullName)
              }
            </div>
            <div>
              <label className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer inline-block">
                Change photo
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </label>
              <p className="text-xs text-gray-400 mt-1.5">JPG, PNG, WebP — max 5MB</p>
            </div>
          </div>

          <Field label="Display name"><input className="field-input-tw" value={fullName} onChange={e => setFullName(e.target.value)} /></Field>
          <Field label="Job title" hint="optional">
            <input className="field-input-tw" placeholder="e.g. Software Engineer, Cardiologist…" value={roleTitle} onChange={e => setRoleTitle(e.target.value)} />
          </Field>
          <Field label="Workplace" hint="optional">
            <input className="field-input-tw" placeholder="e.g. Google, NHS, Freelance…" value={workplace} onChange={e => setWorkplace(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Shows as "Software Engineer at Google" on your profile.</p>
          </Field>
          <Field label="Username"><input className="field-input-tw" value={username} onChange={e => setUsername(e.target.value)} /></Field>
          <Field label="Bio">
            <textarea className="field-input-tw resize-none h-20" value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell the world about your craft…" />
          </Field>
          <Field label="Website">
            <input className="field-input-tw" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourportfolio.com" />
          </Field>

          {/* Privacy toggle */}
          <button
            onClick={() => setPersonalPublic(v => !v)}
            className="w-full flex items-center justify-between py-3 border-t border-gray-100 dark:border-gray-800"
          >
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <span className="flex w-4 h-4 text-gray-500">{personalPublic ? <Icon.Globe /> : <Icon.Lock />}</span>
              Personal profile is {personalPublic ? 'public' : 'private (friends only)'}
            </div>
            <div className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${personalPublic ? 'bg-brand-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${personalPublic ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </div>
          </button>

          {/* Professional fields */}
          {personas.length > 0 && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Professional fields</p>
              <div className="space-y-3">
                {personas.map(p => {
                  const meta = getProfMeta(p.discipline)
                  const edits = personaEdits[p.id] ?? { years_exp: '', bio: '', credentials: '' }
                  return (
                    <div key={p.id} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                        <span>{meta?.icon ?? '✦'}</span>
                        {meta?.label ?? p.discipline}
                        <span className="font-normal text-gray-400 dark:text-gray-500 text-xs">· {p.post_count} posts</span>
                      </div>
                      <div className="space-y-2">
                        <input className="field-input-tw text-xs" type="number" placeholder="Years of experience" value={edits.years_exp} onChange={e => setPersonaField(p.id, 'years_exp', e.target.value)} />
                        <textarea className="field-input-tw text-xs resize-none h-16" placeholder="Brief description of your work…" value={edits.bio} onChange={e => setPersonaField(p.id, 'bio', e.target.value)} />
                        <input className="field-input-tw text-xs" placeholder="Credentials / portfolio link" value={edits.credentials} onChange={e => setPersonaField(p.id, 'credentials', e.target.value)} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 py-3 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-[2] py-3 bg-brand-600 text-white rounded-full text-sm font-semibold hover:bg-brand-700 transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {saving
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : 'Save changes'
              }
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
        {label}
        {hint && <span className="font-normal text-gray-400 dark:text-gray-500 ml-1.5">{hint}</span>}
      </label>
      {children}
    </div>
  )
}
