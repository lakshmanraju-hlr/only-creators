import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
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
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onlineFriends, setOnlineFriends] = useState<Profile[]>([])
  const [chatWithProfile, setChatWithProfile] = useState<Profile | null>(null)

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
        className="col-span-full flex items-center h-[56px] sm:h-[64px] px-4 sm:px-6 sticky top-0 z-50"
        style={{
          gridColumn: '1 / -1',
          background: darkMode ? 'rgba(28,28,30,0.92)' : 'rgba(255,255,255,0.88)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: darkMode ? '0.5px solid rgba(255,255,255,0.08)' : '0.5px solid rgba(0,0,0,0.1)',
        }}
      >
        {/* Logo */}
        <span
          className="font-display text-[18px] sm:text-[20px] font-extrabold tracking-tight text-gray-900 dark:text-white select-none cursor-pointer shrink-0"
          onClick={() => navigate('/')}
        >
          only<em className="not-italic text-brand-600">creators</em>
        </span>

        {/* Center: Search + Browse Fields — hidden on mobile */}
        <div className="hidden sm:flex flex-1 items-center justify-center gap-3 max-w-2xl mx-auto px-4">
          <button
            onClick={() => setShowSearch(true)}
            className={`flex-1 flex items-center gap-3 rounded-full px-4 py-2 text-[13.5px] transition-colors cursor-text text-left ${darkMode ? 'bg-white/[0.08] text-white/40 hover:bg-white/[0.11]' : 'bg-black/[0.05] text-gray-400 hover:bg-black/[0.07]'}`}
          >
            <span className="flex w-4 h-4 shrink-0"><Icon.Search /></span>
            <span className="hidden md:block">Search creators or fields...</span>
          </button>
          <button
            onClick={() => navigate('/explore')}
            className="hidden md:flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white rounded-full px-4 py-2 text-[13px] font-bold whitespace-nowrap transition-colors shadow-sm shrink-0"
          >
            <span className="flex w-[14px] h-[14px]"><Icon.Layers /></span>
            Browse Fields
          </button>
        </div>

        {/* Right */}
        <div className="flex items-center justify-end gap-1 ml-auto">
          {/* Search icon — mobile only */}
          <button
            onClick={() => setShowSearch(true)}
            className={`sm:hidden w-9 h-9 flex items-center justify-center rounded-full transition-colors ${darkMode ? 'text-white/60 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'}`}
          >
            <span className="flex w-[18px] h-[18px]"><Icon.Search /></span>
          </button>

          {/* Icon buttons — hidden on mobile */}
          <button
            onClick={() => setDarkMode(d => !d)}
            title={darkMode ? 'Light mode' : 'Dark mode'}
            className={`hidden sm:flex w-8 h-8 items-center justify-center rounded-full transition-colors ${darkMode ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'}`}
          >
            <span className="flex w-[17px] h-[17px]">{darkMode ? <Icon.Sun /> : <Icon.Moon />}</span>
          </button>
          <button
            onClick={() => navigate('/messages')}
            title="Messages"
            className={`hidden sm:flex w-8 h-8 items-center justify-center rounded-full transition-colors ${darkMode ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'}`}
          >
            <span className="flex w-[17px] h-[17px]"><Icon.MessageCircle /></span>
          </button>
          <button
            onClick={() => navigate('/notifications')}
            title="Notifications"
            className={`hidden sm:flex relative w-8 h-8 items-center justify-center rounded-full transition-colors ${darkMode ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-gray-500 hover:text-gray-900 hover:bg-black/5'}`}
          >
            <span className="flex w-[17px] h-[17px]"><Icon.Bell /></span>
            {unreadNotifCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" style={{ border: `2px solid ${darkMode ? '#1c1c1e' : '#f5f5f7'}` }} />}
          </button>

          {/* Name + avatar pill */}
          <div
            className="flex items-center gap-2 sm:gap-3 ml-1 pl-2 sm:pl-4 pr-1.5 py-1.5 rounded-2xl cursor-pointer transition-all hover:scale-[1.01]"
            style={{
              background: darkMode ? 'rgba(255,255,255,0.07)' : '#ffffff',
              border: darkMode ? '0.5px solid rgba(255,255,255,0.10)' : '0.5px solid rgba(0,0,0,0.08)',
              boxShadow: darkMode ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
            }}
            onClick={() => navigate('/profile')}
          >
            <span
              className="text-[13px] sm:text-[14px] font-bold leading-none hidden sm:block"
              style={{ color: darkMode ? 'rgba(255,255,255,0.88)' : '#111111' }}
            >
              {profile?.full_name}
            </span>
            <div
              className="w-[32px] h-[32px] sm:w-[36px] sm:h-[36px] rounded-xl overflow-hidden bg-blue-100 flex items-center justify-center text-[11px] font-bold text-blue-700 shrink-0"
              style={{ border: darkMode ? '0.5px solid rgba(255,255,255,0.12)' : '0.5px solid rgba(0,0,0,0.06)' }}
            >
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : initials(profile?.full_name || '')}
            </div>
          </div>
        </div>
      </header>

      {/* ── LEFT SIDEBAR ── */}
      <aside className="app-sidebar flex flex-col overflow-hidden" style={{ gridColumn: '1', gridRow: '2', background: darkMode ? '#1c1c1e' : '#ffffff', borderRight: darkMode ? '0.5px solid rgba(255,255,255,0.08)' : '0.5px solid rgba(0,0,0,0.08)' }}>
        {/* Main nav */}
        <div className="px-3 pt-3 pb-1">
          {navItems.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] mb-0.5 transition-all text-left ${
                isNavActive(item.path)
                  ? 'bg-brand-50 dark:bg-white/[0.08] text-brand-600 dark:text-white font-semibold'
                  : 'text-gray-500 dark:text-white/50 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] hover:text-gray-900 dark:hover:text-white font-medium'
              }`}
            >
              <span className="flex w-[19px] h-[19px] shrink-0">{item.icon}</span>
              <span className="flex-1 min-w-0 truncate">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="h-px mx-3 my-2" style={{ background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} />

        {/* My fields */}
        <div className="flex-1 overflow-y-auto px-3 min-h-0 pb-1">
          {proDiscs.length > 0 && (
            <>
              <p className="text-[11px] font-bold uppercase tracking-widest px-3 pt-1 pb-2" style={{ color: darkMode ? 'rgba(255,255,255,0.35)' : '#8e8e93' }}>My fields</p>
              {proDiscs.map(d => (
                <button
                  key={d.key}
                  onClick={() => navigate('/explore?discipline=' + d.key + '&view=posts')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14.5px] mb-0.5 transition-all text-left ${
                    path.includes('discipline=' + d.key)
                      ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 font-semibold'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white font-medium'
                  }`}
                >
                  <span className="flex w-[18px] h-[18px] shrink-0">{d.icon}</span>
                  <span className="flex-1 min-w-0 truncate">{d.label}</span>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="h-px mx-3 my-2" style={{ background: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }} />

        {/* New post */}
        <div className="px-3 mb-3">
          <button
            onClick={() => setShowUpload(true)}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl px-4 py-4 text-[15px] font-semibold transition-colors"
            style={{ boxShadow: '0 4px 14px rgba(128,0,32,0.35)' }}
          >
            <span className="flex w-4 h-4"><Icon.Plus /></span>
            New post
          </button>
        </div>

      </aside>

      {/* ── MAIN ── */}
      <main className="app-main" style={{ background: darkMode ? '#111111' : '#f5f5f7' }}>
        <Routes>
          <Route path="/"                  element={<FeedPage onPost={() => setShowUpload(true)} />} />
          <Route path="/explore"           element={<ExplorePage />} />
          <Route path="/messages"          element={<MessagesPage />} />
          <Route path="/friends"           element={<FriendsPage />} />
          <Route path="/notifications"     element={<NotificationsPage />} />
          <Route path="/bookmarks"         element={<div className="max-w-[700px] mx-auto px-8 py-6"><h1 className="text-[22px] font-bold text-gray-900 dark:text-white tracking-tight mb-1">Bookmarks</h1><p className="text-[13.5px] text-gray-400">Coming soon</p></div>} />
          <Route path="/profile"           element={<ProfilePage />} />
          <Route path="/profile/:username" element={<ProfilePage />} />
          <Route path="/groups/:slug"      element={<GroupPage />} />
        </Routes>
      </main>

      {/* ── RIGHT PANEL ── */}
      <div className="app-right-panel overflow-y-auto" style={{ gridColumn: '3', gridRow: '2', background: darkMode ? '#111111' : '#f5f5f7', borderLeft: darkMode ? '0.5px solid rgba(255,255,255,0.08)' : '0.5px solid rgba(0,0,0,0.08)' }}>
        <RightPanel onlineFriends={onlineFriends} setOnlineFriends={setOnlineFriends} onOpenChat={setChatWithProfile} />
      </div>

      {/* ── BOTTOM NAV (mobile) ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex items-center justify-around z-50 sm:hidden"
        style={{
          background: darkMode ? 'rgba(28,28,30,0.96)' : 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderTop: darkMode ? '0.5px solid rgba(255,255,255,0.08)' : '0.5px solid rgba(0,0,0,0.08)',
          paddingBottom: 'env(safe-area-inset-bottom, 4px)',
          paddingTop: '6px',
        }}
      >
        {navItems.map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-colors"
            style={{ color: isNavActive(item.path) ? '#800020' : darkMode ? 'rgba(255,255,255,0.4)' : '#8e8e93' }}
          >
            <span className="flex w-[22px] h-[22px]">{item.icon}</span>
            <span className="text-[10px] font-semibold">{item.label}</span>
          </button>
        ))}
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
