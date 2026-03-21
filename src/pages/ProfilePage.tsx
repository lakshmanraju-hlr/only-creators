import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, Profile, Post, PROFESSIONS } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import PostCard from '@/components/PostCard'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { username } = useParams()
  const { profile: myProfile, refreshProfile } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [isFollowing, setIsFollowing] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [gridView, setGridView] = useState(true)

  const isOwnProfile = !username || profile?.id === myProfile?.id

  useEffect(() => {
    async function load() {
      setLoading(true)

      // Load profile
      let profileData: Profile | null = null
      if (username) {
        const { data } = await supabase.from('profiles').select('*').eq('username', username).single()
        profileData = data as Profile
      } else {
        profileData = myProfile
      }
      setProfile(profileData)
      if (!profileData) { setLoading(false); return }

      // Load posts (no join)
      const { data: postsData } = await supabase
        .from('posts')
        .select('id, user_id, content_type, caption, poem_text, media_url, media_path, tags, like_count, comment_count, share_count, pro_upvote_count, created_at')
        .eq('user_id', profileData.id)
        .order('created_at', { ascending: false })

      // Attach profile to each post
      const enriched = (postsData || []).map((p: any) => ({ ...p, profiles: profileData })) as Post[]
      setPosts(enriched)

      // Check follow status
      if (myProfile && profileData.id !== myProfile.id) {
        const { data: followData } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', myProfile.id)
          .eq('following_id', profileData.id)
          .maybeSingle()
        setIsFollowing(!!followData)
      }

      setLoading(false)
    }
    load()
  }, [username, myProfile?.id])

  async function toggleFollow() {
    if (!myProfile || !profile) return
    if (isFollowing) {
      await supabase.from('follows').delete().match({ follower_id: myProfile.id, following_id: profile.id })
      setIsFollowing(false)
      setProfile(p => p ? { ...p, follower_count: Math.max(0, p.follower_count - 1) } : p)
      toast('Unfollowed')
    } else {
      await supabase.from('follows').insert({ follower_id: myProfile.id, following_id: profile.id })
      await supabase.from('notifications').insert({ user_id: profile.id, actor_id: myProfile.id, type: 'follow' })
      setIsFollowing(true)
      setProfile(p => p ? { ...p, follower_count: p.follower_count + 1 } : p)
      toast.success(`Following ${profile.full_name}`)
    }
  }

  function initials(name: string) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  const profMeta = profile?.profession ? PROFESSIONS[profile.profession as keyof typeof PROFESSIONS] : null

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!profile) return (
    <div className="empty-state" style={{ padding: 60 }}>
      <div className="empty-icon">◉</div>
      <div className="empty-title">Creator not found</div>
    </div>
  )

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '24px 16px' }}>
      <div className="profile-hero">
        <div className="profile-hero-top">
          <div className="profile-big-av">
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile.full_name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="profile-name">{profile.full_name}</div>
            <div className="profile-handle">@{profile.username}</div>
            {profMeta && (
              <span className={`pill pill-${profMeta.pillClass}`} style={{ marginTop: 6, display: 'inline-flex' }}>
                {profMeta.icon} {profMeta.label}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {isOwnProfile
              ? <button className="btn btn-ghost btn-sm" onClick={() => setShowEditModal(true)}>Edit profile</button>
              : <button className={`btn btn-sm ${isFollowing ? 'btn-ghost' : 'btn-primary'}`} onClick={toggleFollow}>
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
            }
          </div>
        </div>
        {profile.bio && <p className="profile-bio" style={{ marginBottom: 16 }}>{profile.bio}</p>}
        {profile.website && (
          <a href={profile.website} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--brand)', display: 'block', marginBottom: 16 }}>
            🔗 {profile.website.replace(/^https?:\/\//, '')}
          </a>
        )}
        <div className="profile-stats">
          <div><div className="p-stat-num">{profile.post_count}</div><div className="p-stat-label">Posts</div></div>
          <div><div className="p-stat-num">{profile.follower_count}</div><div className="p-stat-label">Followers</div></div>
          <div><div className="p-stat-num">{profile.following_count}</div><div className="p-stat-label">Following</div></div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <button className={`btn btn-sm ${gridView ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setGridView(true)}>⊞ Grid</button>
        <button className={`btn btn-sm ${!gridView ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setGridView(false)}>≡ Feed</button>
      </div>

      {posts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">✦</div>
          <div className="empty-title">{isOwnProfile ? "You haven't posted yet" : 'No posts yet'}</div>
        </div>
      ) : gridView ? (
        <div className="profile-grid">
          {posts.map(p => (
            <div key={p.id} className="grid-cell" onClick={() => setGridView(false)}>
              {p.content_type === 'photo' && p.media_url
                ? <img src={p.media_url} alt="" />
                : <div className="grid-cell-placeholder">
                    {p.content_type === 'audio' ? '🎵' : p.content_type === 'video' ? '🎬' : p.content_type === 'poem' ? '✍️' : p.content_type === 'document' ? '📄' : '💬'}
                  </div>
              }
            </div>
          ))}
        </div>
      ) : (
        posts.map(p => <PostCard key={p.id} post={p} />)
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
      const path = `${myProfile.id}/avatar.${ext}`
      await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true })
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      avatarUrl = data.publicUrl + '?t=' + Date.now()
    }
    const { error } = await supabase.from('profiles').update({
      full_name: fullName,
      username: username.replace('@', '').toLowerCase(),
      bio, website, avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', myProfile.id)
    if (error) toast.error(error.message)
    else { toast.success('Profile updated'); onSaved() }
    setSaving(false)
  }

  function initials(name: string) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Edit profile</div>
          <button className="modal-close" onClick={onClose}>✕</button>
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
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>JPG, PNG, WebP — max 5MB</div>
          </div>
        </div>
        <div className="field"><label className="field-label">Display name</label><input className="field-input" value={fullName} onChange={e => setFullName(e.target.value)} /></div>
        <div className="field"><label className="field-label">Username</label><input className="field-input" value={username} onChange={e => setUsername(e.target.value)} /></div>
        <div className="field"><label className="field-label">Bio</label><textarea className="field-textarea" value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell the world about your craft…" /></div>
        <div className="field"><label className="field-label">Website</label><input className="field-input" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yourportfolio.com" /></div>
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
