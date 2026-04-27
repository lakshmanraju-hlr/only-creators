import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { useLazyLoad } from '@/hooks/useLazyLoad'
import { useAuth } from '@/lib/AuthContext'
import { supabase, Profile, DisciplinePersona } from '@/lib/supabase'
import { Icon } from '@/lib/icons'
import FeedPage from '@/pages/FeedPage'
import ExplorePage from '@/pages/ExplorePage'
import ProfilePage from '@/pages/ProfilePage'
import NotificationsPage from '@/pages/NotificationsPage'
import FriendsPage from '@/pages/FriendsPage'
import MessagesPage from '@/pages/MessagesPage'
import RightPanel from '@/components/RightPanel'
import FloatingChat from '@/components/FloatingChat'
import UploadModal from '@/components/UploadModal'
import SearchModal from '@/components/SearchModal'
import GroupPage from '@/pages/GroupPage'
import CommunityPage from '@/pages/CommunityPage'
import FieldLandingPage from '@/pages/FieldLandingPage'
import OnboardingModal from '@/components/OnboardingModal'

const DISC_COLORS: Record<string, string> = {
  'photography': '#5BA4CF',
  'music':       '#8B5CF6',
  'dance':       '#6366F1',
  'art':         '#10B981',
  'film':        '#B5936A',
  'design':      '#F4A261',
  'writing':     '#F472B6',
  'fitness':     '#14B8A6',
  'culinary':    '#EF4444',
  'technology':  '#64748B',
  'fashion':     '#EC4899',
  'sports':      '#F59E0B',
}

const ALL_DISCIPLINES = [
  { key: 'photography', icon: <Icon.Camera />,     label: 'Photography' },
  { key: 'music',       icon: <Icon.Music />,      label: 'Music' },
  { key: 'dance',       icon: <Icon.Drama />,      label: 'Dance' },
  { key: 'art',         icon: <Icon.Paintbrush />, label: 'Art' },
  { key: 'film',        icon: <Icon.Film />,       label: 'Film' },
  { key: 'design',      icon: <Icon.Layers />,     label: 'Design' },
  { key: 'writing',     icon: <Icon.PenLine />,    label: 'Writing' },
  { key: 'fitness',     icon: <Icon.Activity />,   label: 'Fitness' },
  { key: 'culinary',    icon: <Icon.Utensils />,   label: 'Culinary' },
  { key: 'technology',  icon: <Icon.Code />,       label: 'Technology' },
  { key: 'fashion',     icon: <Icon.Scissors />,   label: 'Fashion' },
  { key: 'sports',      icon: <Icon.Medal />,      label: 'Sports' },
] as const

export default function AppShell() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showUpload, setShowUpload] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [pendingFriendCount, setPendingFriendCount] = useState(0)
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [myPersonas, setMyPersonas] = useState<DisciplinePersona[]>([])
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme')
    if (saved) return saved === 'dark'
    return false // Default to light mode
  })
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onlineFriends, setOnlineFriends] = useState<Profile[]>([])
  const [chatWithProfile, setChatWithProfile] = useState<Profile | null>(null)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const path = location.pathname

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.setAttribute('data-theme', 'light')
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    if (profile) {
      setShowOnboarding(!localStorage.getItem('onboarding_done_' + profile.id))
    }
  }, [profile?.id])

  useEffect(() => {
    if (!profile) return
    function loadPersonas() {
      supabase.from('discipline_personas').select('*').eq('user_id', profile!.id).order('post_count', { ascending: false })
        .then(({ data }) => setMyPersonas((data || []) as DisciplinePersona[]))
    }
    loadPersonas()
    const ch = supabase.channel('my-personas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discipline_personas', filter: 'user_id=eq.' + profile.id }, loadPersonas)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [profile?.id])

  useEffect(() => {
    if (!profile) return
    async function loadCounts() {
      const [f, n, m] = await Promise.all([
        supabase.from('friend_requests').select('id', { count: 'exact', head: true }).eq('receiver_id', profile!.id).eq('status', 'pending'),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profile!.id).eq('is_read', false),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('is_read', false).neq('sender_id', profile!.id),
      ])
      setPendingFriendCount(f.count || 0)
      setUnreadNotifCount(n.count || 0)
      setUnreadMsgCount(m.count || 0)
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

  const navItems = [
    { path: '/',              icon: <Icon.Feed />,          label: 'Home',          badge: 0 },
    { path: '/explore',       icon: <Icon.Explore />,       label: 'Explore',       badge: 0 },
    { path: '/notifications', icon: <Icon.Bell />,          label: 'Notifications', badge: unreadNotifCount },
    { path: '/messages',      icon: <Icon.MessageCircle />, label: 'Messages',      badge: unreadMsgCount },
    { path: '/bookmarks',     icon: <Icon.Bookmark />,      label: 'Saved',         badge: 0 },
    { path: '/profile',       icon: <Icon.Profile />,       label: 'Profile',       badge: 0 },
  ]

  const myPersonaDisciplineKeys = new Set(myPersonas.map(p => p.discipline))
  const proDiscs = myPersonas
    .map(p => ALL_DISCIPLINES.find(d => d.key === p.discipline))
    .filter(Boolean) as typeof ALL_DISCIPLINES[number][]

  function isNavActive(itemPath: string) {
    if (itemPath === '/') return path === '/'
    // /profile should only highlight for own profile, not /profile/:username
    if (itemPath === '/profile') return path === '/profile'
    return path.startsWith(itemPath)
  }

  return (
    <div className="app-shell">
      {/* ── TOPBAR ── */}
      <header
        className="col-span-full sticky top-0 z-50"
        style={{
          gridColumn: '1 / -1',
          background: 'rgba(249,249,249,0.92)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center justify-between px-4 md:px-6" style={{ height: 56 }}>
          {/* Logo */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 select-none shrink-0"
          >
            <span className="flex w-[22px] h-[22px]" style={{ color: 'var(--brand)' }}><Icon.OC /></span>
            <span
              className="font-display text-[15px] font-extrabold tracking-[0.14em] uppercase"
              style={{ color: 'var(--brand)' }}
            >
              Only Creators
            </span>
          </button>

          {/* Messages icon */}
          <button
            onClick={() => navigate('/messages')}
            className="icon-btn"
            aria-label="Messages"
            style={{ position: 'relative' }}
          >
            <span className="flex w-[22px] h-[22px]"><Icon.MessageCircle /></span>
            {unreadMsgCount > 0 && (
              <span className="notif-badge">{unreadMsgCount > 9 ? '9+' : unreadMsgCount}</span>
            )}
          </button>
        </div>
      </header>

      {/* ── LEFT SIDEBAR ── */}
      <aside
        className="app-sidebar flex flex-col overflow-hidden"
        style={{ gridColumn: '1', gridRow: '2', background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
      >
        {/* Main nav */}
        <div className="px-3 pt-3 pb-1">
          {navItems.map((item, i) => {
            const active = isNavActive(item.path)
            return (
              <div key={item.path}>
                {/* Insert Search between Explore and Notifications */}
                {i === 2 && (
                  <button
                    onClick={() => setShowSearch(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[15px] mb-0.5 transition-all text-left"
                    style={{ color: 'var(--text-muted)', fontWeight: 500 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <span className="flex w-[19px] h-[19px] shrink-0"><Icon.Search /></span>
                    <span className="flex-1 min-w-0 truncate">Search</span>
                  </button>
                )}
                <button
                  onClick={() => navigate(item.path)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[15px] mb-0.5 transition-all text-left"
                  style={{
                    background: active ? 'var(--surface-off)' : 'transparent',
                    color: active ? 'var(--brand)' : 'var(--text-muted)',
                    fontWeight: active ? 600 : 500,
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <span className="flex w-[19px] h-[19px] shrink-0">{item.icon}</span>
                  <span className="flex-1 min-w-0 truncate">{item.label}</span>
                  {item.badge > 0 && (
                    <span
                      className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center text-white"
                      style={{ background: 'var(--brand)' }}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </button>
              </div>
            )
          })}
        </div>

        {/* Create button */}
        <div className="px-3 pt-1 pb-3">
          <button
            onClick={() => setShowUpload(true)}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 rounded-[8px] text-[15px] font-semibold transition-all"
            style={{ background: 'var(--brand)', color: '#FFFFFF' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand-muted)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--brand)' }}
          >
            <span className="flex w-[18px] h-[18px] shrink-0"><Icon.Plus /></span>
            Create
          </button>
        </div>

        <div className="h-px mx-3" style={{ background: 'var(--border)' }} />

        {/* Your Communities */}
        <div className="flex-1 overflow-y-auto px-3 min-h-0 py-2">
          {proDiscs.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-widest px-3 pt-1 pb-2" style={{ color: 'var(--text-faint)' }}>Your Communities</p>
              {proDiscs.map(d => {
                const active = path.includes('discipline=' + d.key)
                const dotColor = DISC_COLORS[d.key] ?? '#9CA3AF'
                return (
                  <button
                    key={d.key}
                    onClick={() => navigate('/explore?discipline=' + d.key + '&view=posts')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[14.5px] mb-0.5 transition-all text-left"
                    style={{
                      background: active ? 'var(--surface-off)' : 'transparent',
                      color: active ? 'var(--brand)' : 'var(--text-muted)',
                      fontWeight: active ? 600 : 500,
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <span
                      className="w-5 h-5 rounded-full shrink-0"
                      style={{ background: dotColor, opacity: active ? 1 : 0.85 }}
                    />
                    <span className="flex-1 min-w-0 truncate">{d.label}</span>
                  </button>
                )
              })}
            </>
          )}
        </div>

        <div className="h-px mx-3" style={{ background: 'var(--border)' }} />

        {/* Profile card at bottom */}
        <div className="relative px-3 py-3">
          {/* Dropdown opens upward */}
          {showProfileMenu && (
            <>
              <div className="fixed inset-0 z-[48]" onClick={() => setShowProfileMenu(false)} />
              <div
                className="absolute left-3 right-3 bottom-full mb-2 z-[49] rounded-[12px] overflow-hidden py-1.5"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 -8px 32px rgba(0,0,0,0.10)' }}
              >
                <button
                  onClick={() => { navigate('/profile'); setShowProfileMenu(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-colors text-left hover:bg-surface-elevated"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span className="flex w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }}><Icon.Profile /></span>
                  Edit profile
                </button>
                <button
                  onClick={() => setDarkMode(d => !d)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-colors text-left hover:bg-surface-elevated"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <span className="flex w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }}>{darkMode ? <Icon.Sun /> : <Icon.Moon />}</span>
                  {darkMode ? 'Light mode' : 'Dark mode'}
                </button>
                <div className="h-px mx-3 my-1" style={{ background: 'rgba(0,0,0,0.06)' }} />
                <button
                  onClick={() => { signOut(); setShowProfileMenu(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-colors text-left text-red-500 hover:bg-red-50"
                >
                  <span className="flex w-4 h-4 shrink-0 text-red-500"><Icon.LogOut /></span>
                  Sign out
                </button>
              </div>
            </>
          )}

          <div className="flex items-center gap-2.5">
            {/* Avatar */}
            <button
              onClick={() => navigate('/profile')}
              className="w-9 h-9 rounded-full overflow-hidden bg-burgundy-100 flex items-center justify-center text-[12px] font-bold text-burgundy-700 shrink-0 transition-opacity hover:opacity-80"
              style={{ border: '1px solid var(--border)' }}
            >
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                : initials(profile?.full_name || '')}
            </button>

            {/* Name + label */}
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold truncate leading-snug" style={{ color: 'var(--text-primary)' }}>
                {profile?.full_name}
              </p>
              <button
                onClick={() => navigate('/profile')}
                className="text-[11.5px] transition-colors leading-snug font-mono" style={{ color: 'var(--text-faint)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}
              >
                @{profile?.username}
              </button>
            </div>

            {/* 3-dot */}
            <button
              onClick={() => setShowProfileMenu(v => !v)}
              className="w-7 h-7 flex items-center justify-center rounded-full transition-colors shrink-0"
              style={{ color: 'var(--text-faint)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-off)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}
            >
              <span className="flex w-4 h-4"><Icon.MoreHorizontal /></span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="app-main" style={{ background: 'var(--bg)' }}>
        <Routes>
          <Route path="/"                  element={<FeedPage onPost={() => setShowUpload(true)} />} />
          <Route path="/explore"           element={<ExplorePage />} />
          <Route path="/messages"          element={<MessagesPage />} />
          <Route path="/friends"           element={<FriendsPage />} />
          <Route path="/notifications"     element={<NotificationsPage />} />
          <Route path="/bookmarks"         element={<div className="max-w-[700px] mx-auto px-8 py-6"><h1 className="text-[22px] font-semibold tracking-tight mb-1" style={{ color: 'var(--text-primary)' }}>Bookmarks</h1><p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>Coming soon</p></div>} />
          <Route path="/profile"           element={<ProfilePage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/groups/:slug"      element={<GroupPage />} />
          <Route path="/c/:slug"           element={<CommunityPage />} />
          <Route path="/field/:discipline" element={<FieldLandingPage />} />
        </Routes>
      </main>

      {/* ── RIGHT PANEL ── */}
      <div
        className="app-right-panel overflow-y-auto"
        style={{ gridColumn: '3', gridRow: '2', background: 'var(--bg)', borderLeft: '1px solid var(--border)' }}
      >
        <RightPanel onlineFriends={onlineFriends} setOnlineFriends={setOnlineFriends} onOpenChat={setChatWithProfile} />
      </div>

      {/* ── BOTTOM NAV (mobile) ── */}
      <nav className="bottom-nav md:hidden" role="navigation" aria-label="Main navigation">
        <MobileNavBtn
          icon={<Icon.Feed />}
          label="Home"
          active={path === '/'}
          onClick={() => navigate('/')}
        />
        <MobileNavBtn
          icon={<Icon.Explore />}
          label="Discover"
          active={path.startsWith('/explore')}
          onClick={() => navigate('/explore')}
        />
        {/* Create — elevated circle */}
        <div className="nav-create">
          <button
            className="create-btn"
            onClick={() => setShowUpload(true)}
            aria-label="Create post"
          >
            <span className="flex w-6 h-6 text-white"><Icon.Plus /></span>
          </button>
        </div>
        {/* Notifications with badge */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MobileNavBtn
            icon={<Icon.Bell />}
            label="Activity"
            active={path.startsWith('/notifications')}
            onClick={() => navigate('/notifications')}
            badge={unreadNotifCount}
          />
        </div>
        <MobileNavBtn
          icon={<Icon.Profile />}
          label="Profile"
          active={path.startsWith('/profile')}
          onClick={() => navigate('/profile')}
        />
      </nav>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {chatWithProfile && <FloatingChat chatWith={chatWithProfile} onClose={() => setChatWithProfile(null)} />}
      {showOnboarding && profile && (
        <OnboardingModal onDone={() => { setShowOnboarding(false); if (profile) localStorage.setItem('onboarding_done_' + profile.id, '1') }} />
      )}
    </div>
  )
}

// ── Mobile nav button ───────────────────────────────────────────
function MobileNavBtn({
  icon,
  label,
  active,
  onClick,
  badge = 0,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`nav-item${active ? ' active' : ''}`}
      aria-current={active ? 'page' : undefined}
    >
      <span className="flex w-[22px] h-[22px]">{icon}</span>
      <span className="nav-label">{label}</span>
      {badge > 0 && (
        <span
          className="notif-badge"
          style={{ top: 6, right: 'calc(50% - 18px)' }}
          aria-label={`${badge} unread`}
        >
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  )
}
