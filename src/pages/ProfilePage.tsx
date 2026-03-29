import toast from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase, Profile, Post, getProfMeta, getCanonicalDiscipline, DisciplinePersona, PERSONA_LEVELS, PersonaLevel, PROFESSIONS, Profession, DISCIPLINE_ALIASES } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import PostCard from '@/components/PostCard'
import SocialButton from '@/components/SocialButton'
import { Icon } from '@/lib/icons'

export default function ProfilePage() {
  const { username } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { profile: myProfile, refreshProfile } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [profileTab, setProfileTab] = useState<'personal' | 'pro' | 'disciplines'>('personal')
  const [gridView, setGridView] = useState(true)
  const [personas, setPersonas] = useState<DisciplinePersona[]>([])
  const [showAddPersona, setShowAddPersona] = useState(false)
  const [avatarLightbox, setAvatarLightbox] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)

  const isOwnProfile = !username || profile?.id === myProfile?.id
  const [hasVerified, setHasVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)

  // Can verify: both are pro, same canonical discipline, not own profile
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
      const isPrivate = !isOwn && profileData.personal_profile_public === false

      // Private personal profile — show no posts
      if (profileTab === 'personal' && isPrivate) {
        setPosts([])
        setLoading(false)
        return
      }

      // Load discipline personas
      const { data: personaData } = await supabase
        .from('discipline_personas').select('*').eq('user_id', profileData.id).order('created_at')
      setPersonas((personaData || []) as DisciplinePersona[])

      if (profileTab === 'disciplines') { setLoading(false); return }

      let postsQuery = supabase
        .from('posts')
        .select('id, user_id, content_type, caption, poem_text, media_url, media_path, tags, like_count, comment_count, share_count, pro_upvote_count, is_pro_post, post_type, persona_discipline, visibility, group_id, group:group_id(id,name,slug), created_at')
        .eq('user_id', profileData.id)
        .order('created_at', { ascending: false })

      if (profileTab === 'pro') {
        postsQuery = postsQuery.eq('post_type', 'pro')
      } else if (!isOwn) {
        // For others' personal profiles, only show public posts
        postsQuery = postsQuery.eq('visibility', 'public')
      }

      const { data: postsData } = await postsQuery

      const enriched = (postsData || []).map((p: any) => ({ ...p, profiles: profileData })) as Post[]
      setPosts(enriched)
      setLoading(false)

      // Scroll to a specific post if navigated from a notification (#post-<id>)
      if (location.hash) {
        setGridView(false) // switch to feed view so PostCard renders with its id
        const anchor = location.hash.slice(1)
        setTimeout(() => {
          const el = document.getElementById(anchor)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 250)
      }
    }
    load()
  }, [username, myProfile?.id, profileTab, location.hash])

  // Load whether current user has already verified this profile
  useEffect(() => {
    if (!myProfile || !profile || isOwnProfile) return
    supabase.from('peer_verifications')
      .select('id').eq('verifier_id', myProfile.id).eq('verified_id', profile.id).single()
      .then(({ data }) => setHasVerified(!!data))
  }, [myProfile?.id, profile?.id])

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
        verifier_id: myProfile.id,
        verified_id: profile.id,
        discipline: myDiscipline,
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

  // Scroll to post if #post-id in URL
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

  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  const profMeta = getProfMeta(profile?.profession)

  // Grid cell: render appropriate thumbnail for each content type
  function GridCell({ post, onDelete }: { post: Post; onDelete?: () => void }) {
    const [hovered, setHovered] = useState(false)
    return (
      <div
        className="grid-cell"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => { setSelectedPost(post); setGridView(false) }}
      >
        {post.content_type === 'photo' && post.media_url ? (
          <img src={post.media_url} alt="" />
        ) : post.content_type === 'video' && post.media_url ? (
          <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
            <video src={post.media_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
              <span style={{ display: 'flex', width: 28, height: 28, color: 'white' }}><Icon.Video /></span>
            </div>
          </div>
        ) : post.content_type === 'audio' ? (
          <div className="grid-cell-placeholder" style={{ background: 'var(--color-primary-light)' }}>
            <span style={{ display: 'flex', width: 28, height: 28, color: 'var(--color-primary)' }}><Icon.Music /></span>
          </div>
        ) : post.content_type === 'poem' ? (
          <div className="grid-cell-placeholder" style={{ background: 'linear-gradient(135deg,#fffbeb,#fff)', flexDirection: 'column', gap: 4, padding: 8 }}>
            <span style={{ fontSize: 20, color: 'var(--amber-400)' }}>"</span>
            {post.poem_text && <div style={{ fontSize: 10, color: 'var(--color-text-2)', textAlign: 'center', fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{post.poem_text}</div>}
          </div>
        ) : post.content_type === 'document' ? (
          <div className="grid-cell-placeholder" style={{ background: 'var(--gray-50)' }}>
            <span style={{ display: 'flex', width: 28, height: 28, color: 'var(--color-text-3)' }}><Icon.FileText /></span>
          </div>
        ) : (
          <div className="grid-cell-placeholder" style={{ flexDirection: 'column', gap: 4, padding: 8 }}>
            <span style={{ display: 'flex', width: 22, height: 22, color: 'var(--color-text-3)' }}><Icon.MessageCircle /></span>
            {post.caption && <div style={{ fontSize: 10, color: 'var(--color-text-2)', textAlign: 'center', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{post.caption}</div>}
          </div>
        )}
        {hovered && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'white', fontSize: 13, fontWeight: 600 }}>
            <span>♥ {post.like_count}</span>
            <span>💬 {post.comment_count}</span>
            {isOwnProfile && onDelete && (
              <button
                onClick={async e => {
                  e.stopPropagation()
                  const { error } = await supabase.from('posts').delete().eq('id', post.id)
                  if (!error) { if (post.media_path) await supabase.storage.from('posts').remove([post.media_path]); onDelete() }
                }}
                style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(220,38,38,0.85)', border: 'none', borderRadius: 6, color: 'white', cursor: 'pointer', display: 'flex', padding: '3px 7px', fontSize: 11, gap: 4, alignItems: 'center' }}
              >
                <span style={{ display: 'flex', width: 11, height: 11 }}><Icon.Trash /></span> Delete
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!profile) return (
    <div className="empty-state" style={{ padding: 60 }}>
      <div className="empty-icon"><Icon.Profile /></div>
      <div className="empty-title">Creator not found</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '24px 16px' }}>
      <div className="profile-hero">
        <div className="profile-hero-top">
          {/* Clickable avatar */}
          <div
            className="profile-big-av"
            style={{ cursor: profile.avatar_url ? 'zoom-in' : 'default' }}
            onClick={() => profile.avatar_url && setAvatarLightbox(true)}
          >
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile.full_name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-name">{profile.full_name}</div>
            <div className="profile-handle">@{profile.username}</div>
            {profMeta && (
              <span className={'pill pill-' + profMeta.pillClass} style={{ marginTop: 6, display: 'inline-flex' }}>
                {profMeta.label}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isOwnProfile ? (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowEditModal(true)}>Edit profile</button>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" style={{ gap: 6 }} onClick={() => navigate('/messages?with=' + profile.id)}>
                  <span style={{ display: 'flex', width: 13, height: 13 }}><Icon.MessageCircle /></span> Message
                </button>
                <SocialButton targetId={profile.id} targetName={profile.full_name} />
                {canVerify && (
                  <button
                    className={`btn btn-sm ${hasVerified ? 'btn-gold' : 'btn-ghost'}`}
                    onClick={toggleVerify}
                    disabled={verifying}
                    title={hasVerified ? 'Remove peer verification' : 'Verify as a peer in your discipline'}
                    style={{ gap: 5 }}
                  >
                    <span style={{ display: 'flex', width: 13, height: 13 }}><Icon.Award /></span>
                    {hasVerified ? 'Verified ✓' : 'Verify Peer'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {profile.bio && <p className="profile-bio" style={{ marginBottom: 16 }}>{profile.bio}</p>}
        {profile.website && (
          <a href={profile.website} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 16 }}>
            <span style={{ display: 'flex', width: 12, height: 12 }}><Icon.Globe /></span>
            {profile.website.replace(/^https?:\/\//, '')}
          </a>
        )}
        <div className="profile-stats">
          <div><div className="p-stat-num">{profile.post_count}</div><div className="p-stat-label">Posts</div></div>
          <div><div className="p-stat-num">{profile.follower_count}</div><div className="p-stat-label">Followers</div></div>
          <div><div className="p-stat-num">{profile.following_count}</div><div className="p-stat-label">Following</div></div>
          <div><div className="p-stat-num">{profile.friend_count || 0}</div><div className="p-stat-label">Friends</div></div>
          {profile.is_pro && (
            <div title="Number of peer professionals who have verified this creator">
              <div className="p-stat-num" style={{ color: 'var(--color-pro)' }}>
                {profile.verification_count || 0}
              </div>
              <div className="p-stat-label">Verified by</div>
            </div>
          )}
        </div>
      </div>

      {/* Profile tabs */}
      <div className="profile-tabs">
        <button className={'profile-tab ' + (profileTab === 'personal' ? 'active' : '')} onClick={() => { setProfileTab('personal'); setSelectedPost(null) }}>
          Posts
        </button>
        <button className={'profile-tab ' + (profileTab === 'pro' ? 'active' : '')} onClick={() => { setProfileTab('pro'); setSelectedPost(null) }}>
          ◆ Pro Posts
        </button>
        <button className={'profile-tab ' + (profileTab === 'disciplines' ? 'active' : '')} onClick={() => { setProfileTab('disciplines'); setSelectedPost(null) }}>
          Disciplines {personas.length > 0 && <span style={{ marginLeft: 4, background: 'var(--color-primary)', color: '#fff', borderRadius: 99, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>{personas.length}</span>}
        </button>
        {profileTab !== 'disciplines' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button className={'btn btn-sm ' + (gridView ? 'btn-primary' : 'btn-ghost')} onClick={() => setGridView(true)}>Grid</button>
            <button className={'btn btn-sm ' + (!gridView ? 'btn-primary' : 'btn-ghost')} onClick={() => setGridView(false)}>Feed</button>
          </div>
        )}
      </div>

      {/* ── Disciplines tab ─────────────────────────────────────── */}
      {profileTab === 'disciplines' && (
        <div style={{ marginTop: 8 }}>
          {personas.map(p => {
            const meta = getProfMeta(p.discipline)
            const level = PERSONA_LEVELS[p.level as PersonaLevel] ?? PERSONA_LEVELS.newcomer
            return (
              <div key={p.id} className="persona-card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 28, lineHeight: 1 }}>{meta?.icon ?? '✦'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{meta?.label ?? p.discipline}</span>
                      <span className={`persona-level-badge ${p.level}`}>{level.label}</span>
                    </div>
                    {p.role_title && <div style={{ fontSize: 13, color: 'var(--color-text-2)', marginTop: 2 }}>{p.role_title}</div>}
                    {p.bio && <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 4, lineHeight: 1.5 }}>{p.bio}</div>}
                    <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--color-text-3)' }}>
                      <span>{p.post_count} Pro Post{p.post_count !== 1 ? 's' : ''}</span>
                      {p.years_exp != null && <span>{p.years_exp} yr{p.years_exp !== 1 ? 's' : ''} exp</span>}
                      {p.credentials && <span>· {p.credentials}</span>}
                    </div>
                    {/* Level progress bar */}
                    {level.next && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, color: 'var(--color-text-3)', marginBottom: 3 }}>
                          Next: <strong>{PERSONA_LEVELS[level.next].label}</strong> — {level.nextDesc}
                        </div>
                        <div style={{ height: 4, background: 'var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min(100, (p.post_count / 5) * 100)}%`, background: 'var(--color-primary)', borderRadius: 2, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    )}
                  </div>
                  {isOwnProfile && (
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => setShowAddPersona(true)}
                      style={{ flexShrink: 0, fontSize: 11 }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {isOwnProfile && (
            <button
              className="btn btn-ghost btn-sm btn-full"
              style={{ gap: 6, marginTop: 4 }}
              onClick={() => setShowAddPersona(true)}
            >
              <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.Plus /></span>
              Add discipline
            </button>
          )}

          {personas.length === 0 && !isOwnProfile && (
            <div className="empty-state">
              <div className="empty-title">No disciplines activated</div>
              <div className="empty-sub">This creator hasn't activated any professional personas yet.</div>
            </div>
          )}

          {personas.length === 0 && isOwnProfile && (
            <div className="empty-state">
              <div className="empty-title">Activate your first discipline</div>
              <div className="empty-sub" style={{ maxWidth: 320, margin: '8px auto 16px' }}>
                Disciplines let you make Pro Posts, earn peer recognition, and build audiences within specific communities.
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddPersona(true)}>
                <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.Plus /></span> Add discipline
              </button>
            </div>
          )}
        </div>
      )}

      {profileTab === 'pro' && posts.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon" style={{ fontSize: 24 }}>◆</div>
          <div className="empty-title">{isOwnProfile ? 'No Pro posts yet' : 'No original work posted yet'}</div>
          {isOwnProfile && <div className="empty-sub">When uploading, mark content as original work to add it to your Pro Profile.</div>}
        </div>
      )}

      {profileTab === 'personal' && !isOwnProfile && profile.personal_profile_public === false && (
        <div className="empty-state">
          <div className="empty-icon"><Icon.Lock /></div>
          <div className="empty-title">This profile is private</div>
          <div className="empty-sub">Only friends can see this person's personal posts.</div>
        </div>
      )}

      {posts.length === 0 && profileTab !== 'pro' && !(profileTab === 'personal' && !isOwnProfile && profile.personal_profile_public === false) && (
        <div className="empty-state">
          <div className="empty-icon"><Icon.Camera /></div>
          <div className="empty-title">{isOwnProfile ? "You haven't posted yet" : 'No posts yet'}</div>
        </div>
      )}

      {posts.length > 0 && (gridView ? (
        <div className="profile-grid">
          {posts.map(p => <GridCell key={p.id} post={p} onDelete={() => setPosts(prev => prev.filter(x => x.id !== p.id))} />)}
        </div>
      ) : (
        <>
          {selectedPost && (
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedPost(null) }}>
                <span style={{ display: 'flex', width: 13, height: 13 }}><Icon.ArrowLeft /></span> All posts
              </button>
            </div>
          )}
          {(selectedPost ? [selectedPost] : posts).map(p => (
            <PostCard key={p.id} post={p} onUpdated={() => {
              setPosts(prev => prev.filter(x => x.id !== p.id))
              if (selectedPost?.id === p.id) setSelectedPost(null)
            }} />
          ))}
        </>
      ))}

      {/* Avatar lightbox */}
      {avatarLightbox && profile.avatar_url && (
        <div
          className="modal-overlay"
          onClick={() => setAvatarLightbox(false)}
          style={{ background: 'rgba(0,0,0,0.85)', zIndex: 10000 }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={profile.avatar_url}
              alt={profile.full_name}
              style={{ borderRadius: 'var(--r-xl)', maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', boxShadow: 'var(--shadow-xl)' }}
            />
            <button
              onClick={() => setAvatarLightbox(false)}
              style={{ position: 'absolute', top: -12, right: -12, width: 32, height: 32, borderRadius: '50%', background: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)' }}
            >
              <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.X /></span>
            </button>
          </div>
        </div>
      )}

      {showEditModal && (
        <EditProfileModal
          profile={profile}
          onClose={() => setShowEditModal(false)}
          onSaved={async () => { await refreshProfile(); setShowEditModal(false) }}
        />
      )}

      {showAddPersona && myProfile && (
        <AddPersonaModal
          userId={myProfile.id}
          existing={personas}
          onClose={() => setShowAddPersona(false)}
          onSaved={async () => {
            const { data } = await supabase.from('discipline_personas').select('*').eq('user_id', myProfile.id).order('created_at')
            setPersonas((data || []) as DisciplinePersona[])
            setShowAddPersona(false)
          }}
        />
      )}
    </div>
  )
}

function EditProfileModal({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const { profile: myProfile } = useAuth()
  const [fullName, setFullName] = useState(profile.full_name)
  const [username, setUsername] = useState(profile.username)
  const [bio, setBio] = useState(profile.bio || '')
  const [website, setWebsite] = useState(profile.website || '')
  const [personalPublic, setPersonalPublic] = useState(profile.personal_profile_public !== false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url || '')
  const [saving, setSaving] = useState(false)

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setAvatarFile(f)
    setAvatarPreview(URL.createObjectURL(f))
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
      bio, website, avatar_url: avatarUrl,
      personal_profile_public: personalPublic,
      updated_at: new Date().toISOString(),
    }).eq('id', myProfile.id)
    if (error) toast.error(error.message)
    else { toast.success('Profile updated'); onSaved() }
    setSaving(false)
  }

  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Edit profile</div>
          <button className="modal-close" onClick={onClose}><Icon.X /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div className="profile-big-av" style={{ width: 64, height: 64, fontSize: 22 }}>
            {avatarPreview
              ? <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : initials(fullName)}
          </div>
          <div>
            <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
              Change photo
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
            </label>
            <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>JPG, PNG, WebP — max 5MB</div>
          </div>
        </div>
        <div className="field"><label className="field-label">Display name</label><input className="field-input" value={fullName} onChange={e => setFullName(e.target.value)} /></div>
        <div className="field"><label className="field-label">Username</label><input className="field-input" value={username} onChange={e => setUsername(e.target.value)} /></div>
        <div className="field"><label className="field-label">Bio</label><textarea className="field-textarea" value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell the world about your craft…" /></div>
        <div className="field"><label className="field-label">Website</label><input className="field-input" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourportfolio.com" /></div>
        <div className="upload-option-row" onClick={() => setPersonalPublic(v => !v)} style={{ marginBottom: 16 }}>
          <div className="upload-option-label">
            <span style={{ display: 'flex', width: 14, height: 14, color: 'var(--color-text-3)' }}>{personalPublic ? <Icon.Globe /> : <Icon.Lock />}</span>
            Personal profile is {personalPublic ? 'public' : 'private (friends only)'}
          </div>
          <div className={`upload-toggle ${personalPublic ? 'on' : ''}`} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>
            {saving ? <span className="spinner" /> : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Add Discipline Persona Modal ──────────────────────────────────
const ALL_PROFESSIONS_LIST = Object.entries(PROFESSIONS) as [Profession, typeof PROFESSIONS[Profession]][]

function AddPersonaModal({ userId, existing, onClose, onSaved }: {
  userId: string
  existing: DisciplinePersona[]
  onClose: () => void
  onSaved: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [roleTitle, setRoleTitle] = useState('')
  const [yearsExp, setYearsExp] = useState('')
  const [bio, setBio] = useState('')
  const [credentials, setCredentials] = useState('')
  const [saving, setSaving] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editingPersona, setEditingPersona] = useState<DisciplinePersona | null>(null)

  const existingDisciplines = new Set(existing.map(p => p.discipline))
  const searchTrimmed = search.trim().toLowerCase()

  const filtered = ALL_PROFESSIONS_LIST.filter(([key, val]) =>
    !existingDisciplines.has(key) &&
    (searchTrimmed === '' ||
      val.label.toLowerCase().includes(searchTrimmed) ||
      key.toLowerCase().includes(searchTrimmed) ||
      (DISCIPLINE_ALIASES[searchTrimmed] === key))
  )

  function startEdit(p: DisciplinePersona) {
    setEditingPersona(p)
    setSelected(p.discipline)
    setRoleTitle(p.role_title ?? '')
    setYearsExp(p.years_exp != null ? String(p.years_exp) : '')
    setBio(p.bio ?? '')
    setCredentials(p.credentials ?? '')
  }

  async function save() {
    if (!selected) return
    setSaving('saving')
    if (editingPersona) {
      const { error } = await supabase.from('discipline_personas').update({
        role_title: roleTitle || null,
        years_exp: yearsExp ? parseInt(yearsExp) : null,
        bio: bio || null,
        credentials: credentials || null,
      }).eq('id', editingPersona.id)
      if (error) { toast.error(error.message); setSaving(''); return }
    } else {
      const { error } = await supabase.from('discipline_personas').insert({
        user_id: userId,
        discipline: selected,
        role_title: roleTitle || null,
        years_exp: yearsExp ? parseInt(yearsExp) : null,
        bio: bio || null,
        credentials: credentials || null,
        level: 'newcomer',
      })
      if (error) { toast.error(error.message); setSaving(''); return }
      // Also update profile.profession if this is their first persona
      const { data: prof } = await supabase.from('profiles').select('profession').eq('id', userId).single()
      if (!prof?.profession) {
        await supabase.from('profiles').update({ profession: selected, is_pro: true }).eq('id', userId)
      }
    }
    setSaving('')
    toast.success(editingPersona ? 'Discipline updated!' : 'Discipline activated!')
    onSaved()
  }

  async function deletePersona(p: DisciplinePersona) {
    setDeleting(p.id)
    await supabase.from('discipline_personas').delete().eq('id', p.id)
    setDeleting(null)
    toast('Discipline removed')
    onSaved()
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{editingPersona ? 'Edit discipline' : 'Add discipline'}</div>
          <button className="modal-close" onClick={onClose}><Icon.X /></button>
        </div>

        {/* Existing personas list (when not editing) */}
        {!editingPersona && existing.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Your disciplines</div>
            {existing.map(p => {
              const meta = getProfMeta(p.discipline)
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: 18 }}>{meta?.icon ?? '✦'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{meta?.label ?? p.discipline}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-3)' }}>{p.level} · {p.post_count} pro posts</div>
                  </div>
                  <button className="btn btn-ghost btn-xs" onClick={() => startEdit(p)}>Edit</button>
                  <button
                    className="btn btn-ghost btn-xs"
                    style={{ color: 'var(--red-500)' }}
                    onClick={() => deletePersona(p)}
                    disabled={deleting === p.id}
                  >
                    {deleting === p.id ? <span className="spinner" /> : <span style={{ display: 'flex', width: 12, height: 12 }}><Icon.Trash /></span>}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Select new discipline */}
        {!editingPersona && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              {existing.length > 0 ? 'Add another' : 'Choose your discipline'}
            </div>
            {!selected ? (
              <>
                <input
                  className="field-input"
                  placeholder="Search disciplines…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus
                  style={{ marginBottom: 10 }}
                />
                <div className="prof-suggestions">
                  {filtered.map(([key, val]) => (
                    <button key={key} type="button" className="prof-suggestion-pill" onClick={() => setSelected(key)}>
                      {val.icon} {val.label}
                    </button>
                  ))}
                  {filtered.length === 0 && searchTrimmed.length >= 2 && (
                    <button type="button" className="prof-other-btn" style={{ width: '100%' }} onClick={() => setSelected(searchTrimmed)}>
                      <span style={{ display: 'flex', width: 12, height: 12 }}><Icon.Plus /></span>
                      Add "{search.trim()}"
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span className="prof-chip">
                  {getProfMeta(selected)?.label ?? selected}
                  <button type="button" className="prof-chip-remove" onClick={() => setSelected(null)}><Icon.X /></button>
                </span>
              </div>
            )}
          </>
        )}

        {/* Persona details form */}
        {(selected || editingPersona) && (
          <>
            <div className="field" style={{ marginTop: 8 }}>
              <label className="field-label">Role / title <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>(optional)</span></label>
              <input className="field-input" placeholder="e.g. Street Photographer, Cardiologist" value={roleTitle} onChange={e => setRoleTitle(e.target.value)} />
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Years of experience</label>
                <input className="field-input" type="number" min="0" max="60" placeholder="e.g. 5" value={yearsExp} onChange={e => setYearsExp(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Discipline bio <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>(optional)</span></label>
              <textarea className="field-textarea" placeholder="Brief description of your work in this field…" value={bio} onChange={e => setBio(e.target.value)} style={{ minHeight: 70 }} />
            </div>
            <div className="field">
              <label className="field-label">Credentials / portfolio link <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>(optional)</span></label>
              <input className="field-input" placeholder="e.g. MBBS, portfolio.com/yourwork" value={credentials} onChange={e => setCredentials(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setEditingPersona(null); setSelected(null); setRoleTitle(''); setYearsExp(''); setBio(''); setCredentials('') }}>
                {editingPersona ? 'Cancel edit' : 'Back'}
              </button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving === 'saving'}>
                {saving === 'saving' ? <span className="spinner" /> : editingPersona ? 'Save changes' : 'Activate discipline'}
              </button>
            </div>
          </>
        )}

        {!selected && !editingPersona && (
          <button className="btn btn-ghost btn-sm btn-full" style={{ marginTop: 8 }} onClick={onClose}>Done</button>
        )}
      </div>
    </div>
  )
}
