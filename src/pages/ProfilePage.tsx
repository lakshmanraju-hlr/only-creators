import toast from 'react-hot-toast'
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { supabase, Profile, Post, getProfMeta, getCanonicalDiscipline, DisciplinePersona, PERSONA_LEVELS, PersonaLevel } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import PostCard from '@/components/PostCard'
import SocialButton from '@/components/SocialButton'
import UploadModal from '@/components/UploadModal'
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
  const [avatarLightbox, setAvatarLightbox] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

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
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarUpload}
            />
            <div
              className="profile-big-av"
              style={{ cursor: isOwnProfile ? 'pointer' : profile.avatar_url ? 'zoom-in' : 'default' }}
              onClick={() => {
                if (isOwnProfile) avatarInputRef.current?.click()
                else if (profile.avatar_url) setAvatarLightbox(true)
              }}
            >
              {uploadingAvatar
                ? <div className="spinner" />
                : profile.avatar_url
                  ? <img src={profile.avatar_url} alt="" />
                  : initials(profile.full_name)}
            </div>
            {isOwnProfile && (
              <div
                style={{ position: 'absolute', bottom: 2, right: 2, width: 26, height: 26, borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }}
                onClick={() => avatarInputRef.current?.click()}
                title={profile.avatar_url ? 'Change photo' : 'Add photo'}
              >
                <span style={{ display: 'flex', width: 13, height: 13, color: '#fff' }}><Icon.Camera /></span>
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-name">{profile.full_name}</div>
            <div className="profile-handle">@{profile.username}</div>
            {(profile.role_title || (profile as any).workplace) && (
              <div style={{ marginTop: 4, fontSize: 13.5, color: 'var(--color-text-2)', fontWeight: 500 }}>
                {profile.role_title && (profile as any).workplace
                  ? `${profile.role_title} at ${(profile as any).workplace}`
                  : profile.role_title || (profile as any).workplace}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isOwnProfile ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" style={{ gap: 5 }} onClick={() => setShowUpload(true)}>
                  <span style={{ display: 'flex', width: 13, height: 13 }}><Icon.Plus /></span> New post
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowEditModal(true)}>Edit profile</button>
              </div>
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
          Fields {personas.length > 0 && <span style={{ marginLeft: 4, background: 'var(--color-primary)', color: '#fff', borderRadius: 99, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>{personas.length}</span>}
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
                </div>
              </div>
            )
          })}

          {personas.length === 0 && !isOwnProfile && (
            <div className="empty-state">
              <div className="empty-title">No fields yet</div>
              <div className="empty-sub">This creator hasn't posted in any professional field yet.</div>
            </div>
          )}

          {personas.length === 0 && isOwnProfile && (
            <div className="empty-state">
              <div className="empty-title">No fields yet</div>
              <div className="empty-sub" style={{ maxWidth: 320, margin: '8px auto 0' }}>
                Post Pro content in a field to establish yourself there. Your professional details can be set from <strong>Edit profile</strong>.
              </div>
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

      {showUpload && (
        <UploadModal
          onClose={() => {
            setShowUpload(false)
            // Reload posts after upload
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
          edits[p.id] = {
            years_exp: p.years_exp != null ? String(p.years_exp) : '',
            bio: p.bio ?? '',
            credentials: p.credentials ?? '',
          }
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

    // Save persona details
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
        <div className="field">
          <label className="field-label">
            Job title
            <span style={{ fontWeight: 400, color: 'var(--color-text-3)', marginLeft: 6 }}>optional</span>
          </label>
          <input className="field-input" placeholder="e.g. Software Engineer, Cardiologist, Head Chef…" value={roleTitle} onChange={e => setRoleTitle(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">
            Workplace
            <span style={{ fontWeight: 400, color: 'var(--color-text-3)', marginLeft: 6 }}>optional</span>
          </label>
          <input className="field-input" placeholder="e.g. Google, NHS, Freelance…" value={workplace} onChange={e => setWorkplace(e.target.value)} />
          <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>Shows as "Software Engineer at Google" on your profile.</div>
        </div>
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

        {personas.length > 0 && (
          <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Professional fields</div>
            {personas.map(p => {
              const meta = getProfMeta(p.discipline)
              const edits = personaEdits[p.id] ?? { years_exp: '', bio: '', credentials: '' }
              return (
                <div key={p.id} style={{ marginBottom: 16, padding: '12px 14px', background: 'var(--gray-50)', borderRadius: 'var(--r-lg)', border: '1px solid var(--color-border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{meta?.icon ?? '✦'}</span> {meta?.label ?? p.discipline}
                    <span style={{ fontWeight: 400, color: 'var(--color-text-3)', fontSize: 11 }}>· {p.post_count} Pro post{p.post_count !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label className="field-label" style={{ fontSize: 11 }}>Years of experience</label>
                    <input className="field-input" type="number" min="0" max="60" placeholder="e.g. 5" value={edits.years_exp} onChange={e => setPersonaField(p.id, 'years_exp', e.target.value)} />
                  </div>
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label className="field-label" style={{ fontSize: 11 }}>Field bio <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>(optional)</span></label>
                    <textarea className="field-textarea" placeholder="Brief description of your work in this field…" value={edits.bio} onChange={e => setPersonaField(p.id, 'bio', e.target.value)} style={{ minHeight: 60 }} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label className="field-label" style={{ fontSize: 11 }}>Credentials / portfolio link <span style={{ color: 'var(--color-text-3)', fontWeight: 400 }}>(optional)</span></label>
                    <input className="field-input" placeholder="e.g. MBBS, portfolio.com/yourwork" value={edits.credentials} onChange={e => setPersonaField(p.id, 'credentials', e.target.value)} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

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

