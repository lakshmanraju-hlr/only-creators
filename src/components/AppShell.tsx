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
        className="col-span-full flex items-center h-[64px] px-6 sticky top-0 z-50"
        style={{
          gridColumn: '1 / -1',
          background: 'rgba(255,255,255,0.82)',
          backdropFilter: 'saturate(180%) blur(20px)',
          WebkitBackdropFilter: 'saturate(180%) blur(20px)',
          borderBottom: '0.5px solid rgba(0,0,0,0.1)',
        }}
      >
        {/* Left: Logo */}
        <div className="w-[240px] flex-shrink-0 flex items-center">
          <span
            className="font-display text-[20px] font-extrabold tracking-tight text-gray-900 dark:text-white select-none cursor-pointer"
            onClick={() => navigate('/')}
          >
            only<em className="not-italic text-brand-600">creators</em>
          </span>
        </div>

        {/* Center: Search + Browse Fields */}
        <div className="flex-1 flex items-center justify-center gap-3 max-w-2xl mx-auto">
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}
            className="flex-1 flex items-center gap-3 bg-black/[0.05] rounded-full px-4 py-2.5 text-[14px] text-gray-400 hover:bg-black/[0.07] transition-colors cursor-text text-left"
          >
            <span className="flex w-4 h-4 shrink-0"><Icon.Search /></span>
            <span>Search creators or fields...</span>
          </button>
          <button
            onClick={() => navigate('/explore')}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white rounded-full px-5 py-2.5 text-[13px] font-bold whitespace-nowrap transition-colors shadow-sm shrink-0"
          >
            <span className="flex w-[15px] h-[15px]"><Icon.Layers /></span>
            Browse Fields
          </button>
        </div>

        {/* Right: Icons + User pill */}
        <div className="w-[288px] flex-shrink-0 flex items-center justify-end">
          <div
            className="flex items-center gap-1 rounded-full py-1 pl-4 pr-1"
            style={{ background: 'rgba(0,0,0,0.03)', border: '0.5px solid rgba(0,0,0,0.06)' }}
          >
            <div className="flex items-center gap-0.5 mr-2">
              <button
                onClick={() => setDarkMode(d => !d)}
                title={darkMode ? 'Light mode' : 'Dark mode'}
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-900 hover:bg-white transition-colors"
              >
                <span className="flex w-[17px] h-[17px]">{darkMode ? <Icon.Sun /> : <Icon.Moon />}</span>
              </button>
              <button
                onClick={() => navigate('/messages')}
                title="Messages"
                className="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-900 hover:bg-white transition-colors"
              >
                <span className="flex w-[17px] h-[17px]"><Icon.MessageCircle /></span>
              </button>
              <button
                onClick={() => navigate('/notifications')}
                title="Notifications"
                className="relative w-8 h-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-900 hover:bg-white transition-colors"
              >
                <span className="flex w-[17px] h-[17px]"><Icon.Bell /></span>
                {unreadNotifCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 border-2 border-[#f5f5f7]" />}
              </button>
            </div>
            <div
              className="flex items-center gap-2.5 cursor-pointer px-1 py-0.5 rounded-full hover:bg-white transition-colors"
              onClick={() => navigate('/profile')}
            >
              <span className="text-[14px] font-bold text-gray-900 dark:text-white hidden md:block leading-none">
                {profile?.full_name?.split(' ')[0]}
              </span>
              <div className="w-[34px] h-[34px] rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[11px] font-bold text-blue-700 dark:text-blue-300 border border-white shadow-sm">
                {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(profile?.full_name || '')}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── LEFT SIDEBAR ── */}
      <aside className="app-sidebar flex flex-col overflow-hidden" style={{ gridColumn: '1', gridRow: '2', background: '#ffffff', borderRight: '0.5px solid rgba(0,0,0,0.08)' }}>
        {/* Main nav */}
        <div className="px-3 pt-3 pb-1">
          {navItems.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] mb-0.5 transition-all text-left ${
                isNavActive(item.path)
                  ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 font-semibold'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white font-medium'
              }`}
            >
              <span className="flex w-[19px] h-[19px] shrink-0">{item.icon}</span>
              <span className="flex-1 min-w-0 truncate">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="h-px bg-gray-100 dark:bg-gray-800 mx-3 my-2" />

        {/* My fields */}
        <div className="flex-1 overflow-y-auto px-3 min-h-0 pb-1">
          {proDiscs.length > 0 && (
            <>
              <p className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-3 pt-1 pb-2">My fields</p>
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

        <div className="h-px bg-gray-100 dark:bg-gray-800 mx-3 my-2" />

        {/* New post */}
        <div className="px-3 mb-3">
          <button
            onClick={() => setShowUpload(true)}
            className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl px-4 py-4 text-[15px] font-semibold transition-colors shadow-lg"
          >
            <span className="flex w-4 h-4"><Icon.Plus /></span>
            New post
          </button>
        </div>

        {/* User area */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-3 pt-3 pb-3">
          <button
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[12px] font-bold text-blue-700 dark:text-blue-300 overflow-hidden shrink-0">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(profile?.full_name || '')}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[14px] font-semibold text-gray-900 dark:text-white truncate">{profile?.full_name}</div>
              <div className="text-[12px] text-gray-400 dark:text-gray-500 truncate">{profile?.role_title || 'General account'}</div>
            </div>
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-xl transition-colors mt-0.5"
          >
            <span className="flex w-4 h-4"><Icon.LogOut /></span>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="overflow-y-auto overflow-x-hidden" style={{ gridColumn: '2', gridRow: '2', background: 'var(--apple-bg)' }}>
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
      <div className="app-right-panel overflow-y-auto" style={{ gridColumn: '3', gridRow: '2', background: 'var(--apple-bg)', borderLeft: '0.5px solid rgba(0,0,0,0.08)' }}>
        <RightPanel onlineFriends={onlineFriends} setOnlineFriends={setOnlineFriends} onOpenChat={setChatWithProfile} />
      </div>

      {/* ── BOTTOM NAV (mobile) ── */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl border-t border-gray-100 dark:border-gray-800 flex items-center justify-around py-1.5 z-50 sm:hidden">
        {navItems.filter(i => ['/', '/explore', '/messages', '/notifications', '/profile'].includes(i.path)).map(item => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors ${
              path === item.path
                ? 'text-brand-600 dark:text-brand-400'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            <span className="relative flex w-[22px] h-[22px]">
              {item.icon}
            </span>
            <span className="text-[10px] font-medium">{item.label}</span>
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
