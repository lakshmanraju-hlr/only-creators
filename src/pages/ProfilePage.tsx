import toast from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, Profile, Post, PROFESSIONS } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import PostCard from '@/components/PostCard'
import SocialButton from '@/components/SocialButton'
import { Icon } from '@/lib/icons'

export default function ProfilePage() {
  const { username } = useParams()
  const navigate = useNavigate()
  const { profile: myProfile, refreshProfile } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditModal, setShowEditModal] = useState(false)
  const [profileTab, setProfileTab] = useState<'personal' | 'pro'>('personal')
  const [gridView, setGridView] = useState(true)
  const [avatarLightbox, setAvatarLightbox] = useState(false)
  const [selectedPost, setSelectedPost] = useState<Post | null>(null)

  const isOwnProfile = !username || profile?.id === myProfile?.id

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

      let postsQuery = supabase
        .from('posts')
        .select('id, user_id, content_type, caption, poem_text, media_url, media_path, tags, like_count, comment_count, share_count, pro_upvote_count, is_pro_post, visibility, created_at')
        .eq('user_id', profileData.id)
        .order('created_at', { ascending: false })

      if (profileTab === 'pro') {
        postsQuery = postsQuery.eq('is_pro_post', true)
      } else if (!isOwn) {
        // For others' personal profiles, only show public posts
        postsQuery = postsQuery.eq('visibility', 'public')
      }

      const { data: postsData } = await postsQuery

      const enriched = (postsData || []).map((p: any) => ({ ...p, profiles: profileData })) as Post[]
      setPosts(enriched)
      setLoading(false)
    }
    load()
  }, [username, myProfile?.id, profileTab])

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

  const profMeta = profile?.profession ? PROFESSIONS[profile.profession as keyof typeof PROFESSIONS] : null

  // Grid cell: render appropriate thumbnail for each content type
  function GridCell({ post }: { post: Post }) {
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
        </div>
      </div>

      {/* Profile tabs */}
      <div className="profile-tabs">
        <button className={'profile-tab ' + (profileTab === 'personal' ? 'active' : '')} onClick={() => { setProfileTab('personal'); setSelectedPost(null) }}>
          Personal
        </button>
        <button className={'profile-tab ' + (profileTab === 'pro' ? 'active' : '')} onClick={() => { setProfileTab('pro'); setSelectedPost(null) }}>
          ◆ Pro
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className={'btn btn-sm ' + (gridView ? 'btn-primary' : 'btn-ghost')} onClick={() => setGridView(true)}>Grid</button>
          <button className={'btn btn-sm ' + (!gridView ? 'btn-primary' : 'btn-ghost')} onClick={() => setGridView(false)}>Feed</button>
        </div>
      </div>

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
          {posts.map(p => <GridCell key={p.id} post={p} />)}
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
          {(selectedPost ? [selectedPost] : posts).map(p => <PostCard key={p.id} post={p} />)}
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
