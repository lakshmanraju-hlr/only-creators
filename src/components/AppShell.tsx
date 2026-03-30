import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { getCanonicalDiscipline, supabase, Profile } from '@/lib/supabase'
import { Icon } from '@/lib/icons'
import FeedPage from '@/pages/FeedPage'
import ExplorePage from '@/pages/ExplorePage'
import ProfilePage from '@/pages/ProfilePage'
import NotificationsPage from '@/pages/NotificationsPage'
import FriendsPage from '@/pages/FriendsPage'
import MessagesPage from '@/pages/MessagesPage'
import RightPanel from '@/components/RightPanel'
import UploadModal from '@/components/UploadModal'
import SearchModal from '@/components/SearchModal'
import GroupPage from '@/pages/GroupPage'

// All disciplines shown in the left panel
const ALL_DISCIPLINES = [
  { key: 'photographer',  icon: <Icon.Camera />,     label: 'Photography' },
  { key: 'singer',        icon: <Icon.Mic />,        label: 'Vocals & Singing' },
  { key: 'musician',      icon: <Icon.Music />,      label: 'Music' },
  { key: 'poet',          icon: <Icon.PenLine />,    label: 'Poetry & Writing' },
  { key: 'visual-artist', icon: <Icon.Paintbrush />, label: 'Visual Arts' },
  { key: 'filmmaker',     icon: <Icon.Film />,       label: 'Film & Video' },
  { key: 'dancer',        icon: <Icon.Music />,      label: 'Dance' },
  { key: 'comedian',      icon: <Icon.Drama />,      label: 'Performance' },
  { key: 'culinary',      icon: <Icon.Utensils />,   label: 'Culinary Arts' },
  { key: 'fitness',       icon: <Icon.Activity />,   label: 'Fitness & Sports' },
  { key: 'technology',    icon: <Icon.Code />,       label: 'Technology' },
  { key: 'fashion',       icon: <Icon.Scissors />,   label: 'Fashion & Style' },
  { key: 'architecture',  icon: <Icon.Building />,   label: 'Architecture' },
  { key: 'medicine',      icon: <Icon.Heart2 />,     label: 'Medicine & Health' },
  { key: 'education',     icon: <Icon.PenLine />,    label: 'Education' },
  { key: 'law',           icon: <Icon.Shield />,     label: 'Law & Justice' },
  { key: 'science',       icon: <Icon.Microscope />, label: 'Science & Research' },
  { key: 'business',      icon: <Icon.Briefcase />,  label: 'Business' },
  { key: 'wellness',      icon: <Icon.Heart2 />,     label: 'Wellness & Mind' },
] as const

export default function AppShell() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showUpload, setShowUpload] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [pendingFriendCount, setPendingFriendCount] = useState(0)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  // Online friends for right panel
  const [onlineFriends, setOnlineFriends] = useState<Profile[]>([])

  const path = location.pathname

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    if (!profile) return
    async function loadCounts() {
      const [f, n] = await Promise.all([
        supabase.from('friend_requests').select('id', { count: 'exact', head: true }).eq('receiver_id', profile!.id).eq('status', 'pending'),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profile!.id).eq('is_read', false),
      ])
      setPendingFriendCount(f.count || 0)
      setUnreadNotifCount(n.count || 0)
    }
    loadCounts()
    const ch = supabase.channel('badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: 'receiver_id=eq.' + profile.id }, loadCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + profile.id }, loadCounts)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile?.id])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowSearch(true) }
      if (e.key === 'Escape') setShowSearch(false)
    }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [])

  function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }
  const myCanonical = getCanonicalDiscipline(profile?.profession)

  const navItems = [
    { path: '/',              icon: <Icon.Feed />,          label: 'Feed' },
    { path: '/explore',       icon: <Icon.Explore />,       label: 'Explore' },
    { path: '/messages',      icon: <Icon.MessageCircle />, label: 'Messages' },
    { path: '/friends',       icon: <Icon.Friends />,       label: 'Friends',       badge: pendingFriendCount },
    { path: '/notifications', icon: <Icon.Bell />,          label: 'Notifications', badge: unreadNotifCount },
    { path: '/profile',       icon: <Icon.Profile />,       label: 'Profile' },
  ]

  // Sort disciplines: user's own first, then the rest
  const sortedDisciplines = [...ALL_DISCIPLINES].sort((a, b) => {
    const aIsMine = a.key === myCanonical
    const bIsMine = b.key === myCanonical
    if (aIsMine && !bIsMine) return -1
    if (!aIsMine && bIsMine) return 1
    return 0
  })

  return (
    <div className="app-shell">
      {/* TOP BAR */}
      <div className="topbar">
        <div className="topbar-logo">only <em>creators</em></div>
        <button className="search-trigger" onClick={() => setShowSearch(true)}>
          <span style={{ display:'flex', width:14, height:14, color:'var(--color-text-3)' }}><Icon.Search /></span>
          <span>Search creators…</span>
          <span className="search-kbd">⌘K</span>
        </button>
        <div className="topbar-right">
          <button className="icon-btn" onClick={() => setDarkMode(d => !d)} title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
            {darkMode ? <Icon.Sun /> : <Icon.Moon />}
          </button>
          <button className="icon-btn" onClick={() => setShowUpload(true)} title="New post"><Icon.Plus /></button>
          <button className="icon-btn" onClick={() => navigate('/messages')} title="Messages" style={{ position:'relative' }}>
            <Icon.MessageCircle />
          </button>
          <button className="icon-btn" onClick={() => navigate('/friends')} title="Friends" style={{ position:'relative' }}>
            <Icon.Friends />
            {pendingFriendCount > 0 && <div className="notif-dot" />}
          </button>
          <button className="icon-btn" onClick={() => navigate('/notifications')} title="Notifications" style={{ position:'relative' }}>
            <Icon.Bell />
            {unreadNotifCount > 0 && <div className="notif-dot" />}
          </button>
          <div className="topbar-avatar" onClick={() => navigate('/profile')} title="Profile">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile?.full_name || '')}
          </div>
        </div>
      </div>

      {/* LEFT SIDEBAR */}
      <div className="sidebar">
        <div className="nav-section">
          {navItems.map(item => (
            <button key={item.path} className={'nav-item ' + (path === item.path || (item.path !== '/' && path.startsWith(item.path)) ? 'active' : '')} onClick={() => navigate(item.path)}>
              <span style={{ display:'flex', width:16, height:16 }}>{item.icon}</span>
              {item.label}
              {item.badge != null && item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
            </button>
          ))}
          <button className="nav-item" onClick={() => setShowSearch(true)}>
            <span style={{ display:'flex', width:16, height:16 }}><Icon.Search /></span>
            Find creators
          </button>
        </div>

        <div className="nav-divider" />

        {/* Disciplines section — user's own discipline pinned at top */}
        <div className="nav-section" style={{ flex:1, overflowY:'auto', minHeight:0 }}>
          <div className="nav-label">Disciplines</div>
          {sortedDisciplines.map(d => {
            const isMine = d.key === myCanonical
            return (
              <button
                key={d.key}
                className={'nav-item ' + (isMine ? 'nav-item-mine' : '')}
                onClick={() => navigate('/explore?discipline=' + d.key)}
                title={isMine ? 'Your discipline' : d.label}
              >
                <span style={{ display:'flex', width:16, height:16 }}>{d.icon}</span>
                <span style={{ flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.label}</span>
                {isMine && <span className="discipline-mine-dot" />}
              </button>
            )
          })}
        </div>

        <div className="nav-divider" />
        <button className="sidebar-post-btn" onClick={() => setShowUpload(true)}>
          <Icon.Plus /> New post
        </button>

        <div style={{ flex:0 }} />
        <div className="sidebar-user-area">
          <button className="sidebar-user-btn" onClick={() => navigate('/profile')}>
            <div className="sidebar-avatar">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" /> : initials(profile?.full_name || '')}
            </div>
            <div style={{ flex:1, minWidth:0, textAlign:'left' }}>
              <div className="sidebar-name">{profile?.full_name}</div>
              <div className="sidebar-role">{profile?.role_title || 'General account'}</div>
            </div>
          </button>
          <button className="btn btn-ghost btn-sm btn-full" style={{ marginTop:6, gap:6 }} onClick={signOut}>
            <span style={{ display:'flex', width:14, height:14 }}><Icon.LogOut /></span> Sign out
          </button>
        </div>
      </div>

      {/* BOTTOM NAV (mobile) */}
      <div className="bottom-nav">
        {navItems.filter(i => ['/', '/explore', '/messages', '/notifications', '/profile'].includes(i.path)).map(item => (
          <button key={item.path} className={'bottom-nav-item ' + (path === item.path ? 'active' : '')} onClick={() => navigate(item.path)}>
            <span style={{ display:'flex', width:22, height:22, position:'relative' }}>
              {item.icon}
              {item.badge != null && item.badge > 0 && <span className="bottom-nav-dot" />}
            </span>
            <span className="bottom-nav-label">{item.label}</span>
          </button>
        ))}
      </div>

      {/* MAIN */}
      <div className="main-content">
        <Routes>
          <Route path="/"                  element={<FeedPage onPost={() => setShowUpload(true)} />} />
          <Route path="/explore"           element={<ExplorePage />} />
          <Route path="/messages"          element={<MessagesPage />} />
          <Route path="/friends"           element={<FriendsPage />} />
          <Route path="/notifications"     element={<NotificationsPage />} />
          <Route path="/profile"           element={<ProfilePage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/groups/:slug"      element={<GroupPage />} />
        </Routes>
      </div>

      <div className="right-panel">
        <RightPanel onlineFriends={onlineFriends} setOnlineFriends={setOnlineFriends} />
      </div>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
    </div>
  )
}
