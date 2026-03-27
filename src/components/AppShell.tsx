import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { PROFESSIONS } from '@/lib/supabase'
import { supabase } from '@/lib/supabase'
import FeedPage from '@/pages/FeedPage'
import ExplorePage from '@/pages/ExplorePage'
import ProfilePage from '@/pages/ProfilePage'
import NotificationsPage from '@/pages/NotificationsPage'
import FriendsPage from '@/pages/FriendsPage'
import RightPanel from '@/components/RightPanel'
import UploadModal from '@/components/UploadModal'

export default function AppShell() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showUpload, setShowUpload] = useState(false)
  const [pendingFriendCount, setPendingFriendCount] = useState(0)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)

  const currentPath = location.pathname

  // Load badge counts
  useEffect(() => {
    if (!profile) return
    async function loadCounts() {
      const [friendRes, notifRes] = await Promise.all([
        supabase.from('friend_requests').select('id', { count: 'exact' })
          .eq('receiver_id', profile!.id).eq('status', 'pending'),
        supabase.from('notifications').select('id', { count: 'exact' })
          .eq('user_id', profile!.id).eq('is_read', false),
      ])
      setPendingFriendCount(friendRes.count || 0)
      setUnreadNotifCount(notifRes.count || 0)
    }
    loadCounts()

    // Real-time badge updates
    const channel = supabase.channel('badge-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests',
        filter: `receiver_id=eq.${profile.id}` }, loadCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${profile.id}` }, loadCounts)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  function initials(name: string) {
    return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?'
  }

  const profMeta = profile?.profession ? PROFESSIONS[profile.profession] : null

  const navItems = [
    { path: '/',              icon: '⊞', label: 'Feed' },
    { path: '/explore',       icon: '◎', label: 'Explore' },
    { path: '/friends',       icon: '✦', label: 'Friends', badge: pendingFriendCount },
    { path: '/notifications', icon: '🔔', label: 'Notifications', badge: unreadNotifCount },
    { path: '/profile',       icon: '◉', label: 'Profile' },
  ]

  return (
    <div className="app-shell">
      {/* TOP BAR */}
      <div className="topbar">
        <div className="topbar-logo">only <em>creators</em></div>
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input className="search-input" placeholder="Search creators, posts, tags…" />
        </div>
        <div className="topbar-right">
          <button className="icon-btn" onClick={() => setShowUpload(true)} title="New post" style={{ fontSize: 20, fontWeight: 300 }}>＋</button>
          <button className="icon-btn" onClick={() => navigate('/friends')} title="Friends" style={{ position: 'relative' }}>
            ✦
            {pendingFriendCount > 0 && <div className="notif-dot" />}
          </button>
          <button className="icon-btn" onClick={() => navigate('/notifications')} title="Notifications" style={{ position: 'relative' }}>
            🔔
            {unreadNotifCount > 0 && <div className="notif-dot" />}
          </button>
          <div className="topbar-avatar" onClick={() => navigate('/profile')}>
            {profile?.avatar_url
              ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : initials(profile?.full_name || '')}
          </div>
        </div>
      </div>

      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="nav-section">
          {navItems.map(item => (
            <button
              key={item.path}
              className={`nav-item ${currentPath === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.badge != null && item.badge > 0 && (
                <span className="nav-badge">{item.badge}</span>
              )}
            </button>
          ))}
        </div>

        <div className="nav-divider" />

        <div className="nav-section">
          <div className="nav-label">Disciplines</div>
          {['photographer', 'singer', 'poet', 'visual-artist'].map(key => {
            const p = PROFESSIONS[key as keyof typeof PROFESSIONS]
            return (
              <button key={key} className="nav-item" onClick={() => navigate(`/explore?discipline=${key}`)}>
                <span className="nav-icon">{p.icon}</span>
                {p.label}
              </button>
            )
          })}
        </div>

        <div className="nav-divider" />
        <button className="sidebar-post-btn" onClick={() => setShowUpload(true)}>
          <span style={{ fontSize: 18 }}>＋</span> New post
        </button>

        <div style={{ flex: 1 }} />

        <div className="sidebar-user-area">
          <button className="sidebar-user-btn" onClick={() => navigate('/profile')}>
            <div className="sidebar-avatar">
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" />
                : initials(profile?.full_name || '')}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div className="sidebar-name">{profile?.full_name}</div>
              <div className="sidebar-role">
                {profMeta ? `${profMeta.icon} ${profMeta.label}` : 'General account'}
              </div>
            </div>
          </button>
          <button className="btn btn-ghost btn-sm btn-full" style={{ marginTop: 6 }} onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div className="main-content">
        <Routes>
          <Route path="/"                    element={<FeedPage onPost={() => setShowUpload(true)} />} />
          <Route path="/explore"             element={<ExplorePage />} />
          <Route path="/friends"             element={<FriendsPage />} />
          <Route path="/notifications"       element={<NotificationsPage />} />
          <Route path="/profile"             element={<ProfilePage />} />
          <Route path="/profile/:username"   element={<ProfilePage />} />
        </Routes>
      </div>

      {/* RIGHT PANEL */}
      <div className="right-panel">
        <RightPanel />
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}
