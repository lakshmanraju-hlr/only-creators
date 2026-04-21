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
import OnboardingModal from '@/components/OnboardingModal'

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

  const navItems = [
    { path: '/',          icon: <Icon.Feed />,     label: 'Feed' },
    { path: '/explore',   icon: <Icon.Explore />,  label: 'Explore' },
    { path: '/bookmarks', icon: <Icon.Bookmark />, label: 'Bookmarks' },
    { path: '/profile',   icon: <Icon.Profile />,  label: 'Profile' },
  ]

  const myPersonaDisciplineKeys = new Set(myPersonas.map(p => p.discipline))
  const proDiscs = myPersonas
    .map(p => ALL_DISCIPLINES.find(d => d.key === p.discipline))
    .filter(Boolean) as typeof ALL_DISCIPLINES[number][]

  function isNavActive(itemPath: string) {
    return itemPath === '/' ? path === '/' : path.startsWith(itemPath)
  }

  return (
    <div className="app-shell">
      {/* ── TOPBAR ── */}
      <header
        className="col-span-full relative flex items-center h-[56px] md:h-[64px] px-4 md:px-6 sticky top-0 z-50"
        style={{
          gridColumn: '1 / -1',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        {/* Logo */}
        <span
          className="font-display text-[18px] sm:text-[20px] font-bold tracking-tight select-none cursor-pointer shrink-0"
          style={{ color: '#1A1A1A' }}
          onClick={() => navigate('/')}
        >
          Only Creators
        </span>

        {/* Center: Search + Browse Fields — absolutely centered, hidden on mobile */}
        <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-2.5 w-[400px]">
          <button
            onClick={() => setShowSearch(true)}
            className="flex-1 flex items-center gap-3 rounded-full px-4 py-2 text-[13.5px] transition-colors cursor-text text-left bg-[#F8F8F6] border border-[#E5E7EB] text-[#9CA3AF] hover:bg-[#F0F0EE]"
          >
            <span className="flex w-4 h-4 shrink-0"><Icon.Search /></span>
            <span>Search creators or fields...</span>
          </button>
          <button
            onClick={() => navigate('/explore')}
            className="flex items-center gap-2 bg-[#1A1A1A] hover:bg-[#333333] text-white rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors shrink-0"
          >
            <span className="flex w-[14px] h-[14px]"><Icon.Layers /></span>
            Browse Fields
          </button>
        </div>

        {/* Right */}
        <div className="flex items-center justify-end gap-1 ml-auto relative">
          {/* Search icon — mobile only */}
          <button
            onClick={() => setShowSearch(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-full transition-colors text-[#6B7280] hover:text-[#111111] hover:bg-[#F0F0EE]"
          >
            <span className="flex w-[18px] h-[18px]"><Icon.Search /></span>
          </button>

          {/* Pill: messages + notifs + name + avatar */}
          <div
            className="flex items-center ml-1 pl-1 pr-1 py-1 rounded-full"
            style={{
              background: '#ffffff',
              border: '1px solid #E5E7EB',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            {/* Messages — desktop only */}
            <button
              onClick={(e) => { e.stopPropagation(); navigate('/messages') }}
              title="Messages"
              className="hidden md:flex w-8 h-8 items-center justify-center rounded-full transition-colors text-[#6B7280] hover:text-[#111111] hover:bg-[#F0F0EE]"
            >
              <span className="flex w-[16px] h-[16px]"><Icon.MessageCircle /></span>
            </button>

            {/* Notifications — desktop only */}
            <button
              onClick={(e) => { e.stopPropagation(); navigate('/notifications') }}
              title="Notifications"
              className="hidden md:flex relative w-8 h-8 items-center justify-center rounded-full transition-colors text-[#6B7280] hover:text-[#111111] hover:bg-[#F0F0EE]"
            >
              <span className="flex w-[16px] h-[16px]"><Icon.Bell /></span>
              {unreadNotifCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#EF4444]" style={{ border: '2px solid white' }} />
              )}
            </button>

            {/* Divider — desktop only */}
            <div className="hidden md:block w-px h-4 mx-1 shrink-0 bg-[#E5E7EB]" />

            {/* Name — desktop only */}
            <span
              className="text-[14px] font-semibold leading-none hidden md:block px-2 cursor-pointer select-none text-[#111111]"
              onClick={() => navigate('/profile')}
            >
              {profile?.full_name}
            </span>

            {/* Avatar — click opens menu */}
            <button
              onClick={() => setShowProfileMenu(v => !v)}
              className="w-[32px] h-[32px] md:w-[36px] md:h-[36px] rounded-full overflow-hidden bg-[#DBEAFE] flex items-center justify-center text-[11px] font-bold text-[#1D4ED8] shrink-0 transition-opacity hover:opacity-80"
              style={{ border: '1px solid #E5E7EB' }}
            >
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                : initials(profile?.full_name || '')}
            </button>
          </div>

          {/* Backdrop */}
          {showProfileMenu && (
            <div className="fixed inset-0 z-[998]" onClick={() => setShowProfileMenu(false)} />
          )}

          {/* Profile dropdown menu */}
          {showProfileMenu && (
            <div
              className="absolute right-0 top-[calc(100%+8px)] z-[999] w-[220px] rounded-[12px] overflow-hidden py-1.5"
              style={{
                background: '#ffffff',
                border: '1px solid #E5E7EB',
                boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
              }}
            >
              <button
                onClick={() => { navigate('/profile'); setShowProfileMenu(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-colors text-left text-[#111111] hover:bg-[#F8F8F6]"
              >
                <span className="flex w-4 h-4 shrink-0 text-[#6B7280]"><Icon.Profile /></span>
                Edit profile
              </button>
              <button
                onClick={() => setDarkMode(d => !d)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-colors text-left text-[#111111] hover:bg-[#F8F8F6]"
              >
                <span className="flex w-4 h-4 shrink-0 text-[#6B7280]">{darkMode ? <Icon.Sun /> : <Icon.Moon />}</span>
                {darkMode ? 'Light mode' : 'Dark mode'}
              </button>
              <div className="h-px mx-3 my-1" style={{ background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} />
              <button
                onClick={() => { signOut(); setShowProfileMenu(false) }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-colors text-left text-red-500 ${darkMode ? 'hover:bg-white/[0.05]' : 'hover:bg-red-50'}`}
              >
                <span className="flex w-4 h-4 shrink-0 text-red-500"><Icon.LogOut /></span>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── LEFT SIDEBAR ── */}
      <aside
        className="app-sidebar flex flex-col overflow-hidden"
        style={{ gridColumn: '1', gridRow: '2', background: '#ffffff', borderRight: '1px solid #E5E7EB' }}
      >
        {/* Main nav */}
        <div className="px-3 pt-3 pb-1">
          {navItems.map(item => {
            const active = isNavActive(item.path)
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[15px] mb-0.5 transition-all text-left"
                style={{
                  background: active ? '#EFF6FF' : 'transparent',
                  color: active ? '#2563EB' : '#6B7280',
                  fontWeight: active ? 600 : 500,
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#F8F8F6' }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <span className="flex w-[19px] h-[19px] shrink-0">{item.icon}</span>
                <span className="flex-1 min-w-0 truncate">{item.label}</span>
              </button>
            )
          })}
        </div>

        <div className="h-px mx-3 my-2 bg-[#E5E7EB]" />

        {/* My fields */}
        <div className="flex-1 overflow-y-auto px-3 min-h-0 pb-1">
          {proDiscs.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-widest px-3 pt-1 pb-2 text-[#9CA3AF]">My fields</p>
              {proDiscs.map(d => {
                const active = path.includes('discipline=' + d.key)
                return (
                  <button
                    key={d.key}
                    onClick={() => navigate('/explore?discipline=' + d.key + '&view=posts')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[14.5px] mb-0.5 transition-all text-left"
                    style={{
                      background: active ? '#EFF6FF' : 'transparent',
                      color: active ? '#2563EB' : '#6B7280',
                      fontWeight: active ? 600 : 500,
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#F8F8F6' }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <span className="flex w-[18px] h-[18px] shrink-0">{d.icon}</span>
                    <span className="flex-1 min-w-0 truncate">{d.label}</span>
                  </button>
                )
              })}
            </>
          )}
        </div>

      </aside>

      {/* ── MAIN ── */}
      <main className="app-main" style={{ background: '#F8F8F6' }}>
        <Routes>
          <Route path="/"                  element={<FeedPage onPost={() => setShowUpload(true)} />} />
          <Route path="/explore"           element={<ExplorePage />} />
          <Route path="/messages"          element={<MessagesPage />} />
          <Route path="/friends"           element={<FriendsPage />} />
          <Route path="/notifications"     element={<NotificationsPage />} />
          <Route path="/bookmarks"         element={<div className="max-w-[700px] mx-auto px-8 py-6"><h1 className="text-[22px] font-semibold text-[#111111] tracking-tight mb-1">Bookmarks</h1><p className="text-[13px] text-[#6B7280]">Coming soon</p></div>} />
          <Route path="/profile"           element={<ProfilePage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/groups/:slug"      element={<GroupPage />} />
        </Routes>
      </main>

      {/* ── RIGHT PANEL ── */}
      <div
        className="app-right-panel overflow-y-auto"
        style={{ gridColumn: '3', gridRow: '2', background: '#F8F8F6', borderLeft: '1px solid #E5E7EB' }}
      >
        <RightPanel onlineFriends={onlineFriends} setOnlineFriends={setOnlineFriends} onOpenChat={setChatWithProfile} />
      </div>

      {/* ── BOTTOM NAV (mobile) — 5-tab spec ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex items-center justify-around z-50 md:hidden"
        style={{
          height: 64,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: '#FFFFFF',
          borderTop: '1px solid #E5E7EB',
        }}
      >
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
        {/* Post — elevated circle */}
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center justify-center rounded-full transition-all active:scale-95"
          style={{ width: 52, height: 52, background: '#1A1A1A' }}
          aria-label="Create post"
        >
          <span className="flex w-6 h-6 text-white"><Icon.Plus /></span>
        </button>
        {/* Notifications with badge */}
        <div className="relative">
          <MobileNavBtn
            icon={<Icon.Bell />}
            label="Activity"
            active={path.startsWith('/notifications')}
            onClick={() => navigate('/notifications')}
          />
          {unreadNotifCount > 0 && (
            <span
              className="absolute top-1 right-2 w-2 h-2 rounded-full bg-[#EF4444]"
              style={{ border: '2px solid white' }}
            />
          )}
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
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors"
      style={{ color: active ? '#1A1A1A' : '#9CA3AF' }}
    >
      <span className="flex w-[22px] h-[22px]">{icon}</span>
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  )
}
