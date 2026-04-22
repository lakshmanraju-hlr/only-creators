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
import OnboardingModal from '@/components/OnboardingModal'

const DISC_COLORS: Record<string, string> = {
  'photographer':  '#5BA4CF',
  'singer':        '#F4A261',
  'musician':      '#8B5CF6',
  'poet':          '#F472B6',
  'visual-artist': '#10B981',
  'filmmaker':     '#B5936A',
  'dancer':        '#6366F1',
  'comedian':      '#F59E0B',
  'culinary':      '#EF4444',
  'fitness':       '#14B8A6',
  'technology':    '#64748B',
  'fashion':       '#EC4899',
  'architecture':  '#78716C',
  'medicine':      '#22C55E',
  'education':     '#3B82F6',
  'law':           '#6B7280',
  'science':       '#06B6D4',
  'business':      '#8B1A2C',
  'wellness':      '#A78BFA',
}

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
  const [unreadMsgCount, setUnreadMsgCount] = useState(0)
  const [showFieldsMenu, setShowFieldsMenu] = useState(false)

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
          background: 'rgba(249,249,247,0.95)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: '1px solid #E8E8E4',
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
            className="flex-1 flex items-center gap-3 rounded-full px-4 py-2 text-[13.5px] transition-colors cursor-text text-left bg-[#F3F3F0] border border-[#E8E8E4] text-[#9CA3AF] hover:bg-[#EBEBEA]"
          >
            <span className="flex w-4 h-4 shrink-0"><Icon.Search /></span>
            <span>Search creators or fields...</span>
          </button>
          <div className="relative shrink-0">
            <button
              onClick={() => setShowFieldsMenu(v => !v)}
              className="flex items-center gap-2 bg-[#18181B] hover:bg-[#3F3F46] text-white rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors"
            >
              <span className="flex w-[14px] h-[14px]"><Icon.Layers /></span>
              Browse Fields
            </button>
            {showFieldsMenu && (
              <>
                <div className="fixed inset-0 z-[48]" onClick={() => setShowFieldsMenu(false)} />
                <div
                  className="absolute right-0 top-full mt-2 z-[49] rounded-2xl py-2 w-[300px]"
                  style={{ background: '#FFFFFF', border: '1px solid #E8E8E4', boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-widest px-4 pt-1 pb-2 text-[#9CA3AF]">All Fields</p>
                  <div className="grid grid-cols-2 gap-0.5 px-2 pb-2">
                    {ALL_DISCIPLINES.map(d => (
                      <button
                        key={d.key}
                        onClick={() => { navigate('/explore?discipline=' + d.key); setShowFieldsMenu(false) }}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-left transition-colors text-[#111111] hover:bg-[#F3F3F0]"
                      >
                        <span className="flex w-[15px] h-[15px] shrink-0 text-[#6B7280]">{d.icon}</span>
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right — mobile search only */}
        <div className="flex items-center justify-end gap-1 ml-auto">
          <button
            onClick={() => setShowSearch(true)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-full transition-colors text-[#6B7280] hover:text-[#111111] hover:bg-[#F0F0EE]"
          >
            <span className="flex w-[18px] h-[18px]"><Icon.Search /></span>
          </button>
        </div>
      </header>

      {/* ── LEFT SIDEBAR ── */}
      <aside
        className="app-sidebar flex flex-col overflow-hidden"
        style={{ gridColumn: '1', gridRow: '2', background: '#FFFFFF', borderRight: '1px solid #E8E8E4' }}
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
                    style={{ color: '#6B7280', fontWeight: 500 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F3F3F0' }}
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
                    background: active ? '#F4F4F5' : 'transparent',
                    color: active ? '#18181B' : '#6B7280',
                    fontWeight: active ? 600 : 500,
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#F3F3F0' }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <span className="flex w-[19px] h-[19px] shrink-0">{item.icon}</span>
                  <span className="flex-1 min-w-0 truncate">{item.label}</span>
                  {item.badge > 0 && (
                    <span
                      className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center text-white"
                      style={{ background: '#18181B' }}
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
            style={{ background: '#18181B', color: '#FFFFFF' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#3F3F46' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#18181B' }}
          >
            <span className="flex w-[18px] h-[18px] shrink-0"><Icon.Plus /></span>
            Create
          </button>
        </div>

        <div className="h-px mx-3 bg-[#E8E8E4]" />

        {/* Your Communities */}
        <div className="flex-1 overflow-y-auto px-3 min-h-0 py-2">
          {proDiscs.length > 0 && (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-widest px-3 pt-1 pb-2 text-[#9CA3AF]">Your Communities</p>
              {proDiscs.map(d => {
                const active = path.includes('discipline=' + d.key)
                const dotColor = DISC_COLORS[d.key] ?? '#9CA3AF'
                return (
                  <button
                    key={d.key}
                    onClick={() => navigate('/explore?discipline=' + d.key + '&view=posts')}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[14.5px] mb-0.5 transition-all text-left"
                    style={{
                      background: active ? '#F4F4F5' : 'transparent',
                      color: active ? '#18181B' : '#6B7280',
                      fontWeight: active ? 600 : 500,
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#F3F3F0' }}
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

        <div className="h-px mx-3 bg-[#E8E8E4]" />

        {/* Profile card at bottom */}
        <div className="relative px-3 py-3">
          {/* Dropdown opens upward */}
          {showProfileMenu && (
            <>
              <div className="fixed inset-0 z-[48]" onClick={() => setShowProfileMenu(false)} />
              <div
                className="absolute left-3 right-3 bottom-full mb-2 z-[49] rounded-[12px] overflow-hidden py-1.5"
                style={{ background: '#FFFFFF', border: '1px solid #E8E8E4', boxShadow: '0 -8px 32px rgba(0,0,0,0.10)' }}
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
              style={{ border: '1px solid #E5E7EB' }}
            >
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                : initials(profile?.full_name || '')}
            </button>

            {/* Name + label */}
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold text-[#111111] truncate leading-snug">
                {profile?.full_name}
              </p>
              <button
                onClick={() => navigate('/profile')}
                className="text-[11.5px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors leading-snug font-mono"
              >
                @{profile?.username}
              </button>
            </div>

            {/* 3-dot */}
            <button
              onClick={() => setShowProfileMenu(v => !v)}
              className="w-7 h-7 flex items-center justify-center rounded-full text-[#9CA3AF] hover:text-[#111111] hover:bg-[#F3F3F0] transition-colors shrink-0"
            >
              <span className="flex w-4 h-4"><Icon.MoreHorizontal /></span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="app-main" style={{ background: '#F9F9F7' }}>
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
          <Route path="/c/:slug"           element={<CommunityPage />} />
        </Routes>
      </main>

      {/* ── RIGHT PANEL ── */}
      <div
        className="app-right-panel overflow-y-auto"
        style={{ gridColumn: '3', gridRow: '2', background: '#F9F9F7', borderLeft: '1px solid #E8E8E4' }}
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
          borderTop: '1px solid #E8E8E4',
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
          style={{ width: 52, height: 52, background: '#18181B', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
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
      className="flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors"
      style={{ color: active ? '#111111' : '#9CA3AF' }}
    >
      <span className="flex w-[22px] h-[22px]">{icon}</span>
      <span className={`text-[11px] ${active ? 'font-bold' : 'font-normal'}`}>{label}</span>
    </button>
  )
}
