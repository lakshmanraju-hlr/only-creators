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
    { path: '/',              icon: <Icon.Feed />,          label: 'Feed' },
    { path: '/explore',       icon: <Icon.Explore />,       label: 'Explore' },
    { path: '/messages',      icon: <Icon.MessageCircle />, label: 'Messages' },
    { path: '/friends',       icon: <Icon.Friends />,       label: 'Friends',       badge: pendingFriendCount },
    { path: '/notifications', icon: <Icon.Bell />,          label: 'Notifications', badge: unreadNotifCount },
    { path: '/profile',       icon: <Icon.Profile />,       label: 'Profile' },
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
      <header className="col-span-full flex items-center gap-3 px-5 bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800 sticky top-0 z-50" style={{ gridColumn: '1 / -1' }}>
        <div className="font-display text-[17px] font-semibold text-gray-900 dark:text-white tracking-tight shrink-0 select-none">
          only <em className="not-italic text-brand-600">creators</em>
        </div>

        <button
          onClick={() => setShowSearch(true)}
          className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full px-3.5 py-[7px] text-sm text-gray-400 flex-1 max-w-sm mx-auto hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-300 transition-colors cursor-text"
        >
          <span className="flex w-3.5 h-3.5"><Icon.Search /></span>
          <span>Search creators…</span>
          <kbd className="ml-auto text-[10px] font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-px text-gray-400">⌘K</kbd>
        </button>

        <div className="flex items-center gap-1 ml-auto">
          <button
            onClick={() => setDarkMode(d => !d)}
            title={darkMode ? 'Switch to light' : 'Switch to dark'}
            className="w-[34px] h-[34px] rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <span className="flex w-[18px] h-[18px]">{darkMode ? <Icon.Sun /> : <Icon.Moon />}</span>
          </button>
          <button
            onClick={() => setShowUpload(true)}
            title="New post"
            className="w-[34px] h-[34px] rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <span className="flex w-[18px] h-[18px]"><Icon.Plus /></span>
          </button>
          <button
            onClick={() => navigate('/messages')}
            title="Messages"
            className="w-[34px] h-[34px] rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <span className="flex w-[18px] h-[18px]"><Icon.MessageCircle /></span>
          </button>
          <button
            onClick={() => navigate('/friends')}
            title="Friends"
            className="relative w-[34px] h-[34px] rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <span className="flex w-[18px] h-[18px]"><Icon.Friends /></span>
            {pendingFriendCount > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-600 border border-white" />}
          </button>
          <button
            onClick={() => navigate('/notifications')}
            title="Notifications"
            className="relative w-[34px] h-[34px] rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            <span className="flex w-[18px] h-[18px]"><Icon.Bell /></span>
            {unreadNotifCount > 0 && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-brand-600 border border-white" />}
          </button>
          <button
            onClick={() => navigate('/profile')}
            title="Profile"
            className="w-[30px] h-[30px] rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[11px] font-semibold text-blue-700 dark:text-blue-300 border-[1.5px] border-gray-200 dark:border-gray-700 hover:border-brand-500 transition-colors ml-0.5"
          >
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(profile?.full_name || '')}
          </button>
        </div>
      </header>

      {/* ── LEFT SIDEBAR ── */}
      <aside className="app-sidebar bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800 flex flex-col overflow-hidden" style={{ gridColumn: '1', gridRow: '2' }}>
        {/* Main nav */}
        <div className="px-2 pt-2.5 pb-1">
          {navItems.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13.5px] mb-0.5 transition-all text-left ${
                isNavActive(item.path)
                  ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 font-medium'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="flex w-4 h-4 shrink-0">{item.icon}</span>
              <span className="flex-1 min-w-0 truncate">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="text-[10px] font-semibold bg-brand-600 text-white px-1.5 py-px rounded-full min-w-[18px] text-center">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={() => setShowSearch(true)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13.5px] mb-0.5 transition-all text-left text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white"
          >
            <span className="flex w-4 h-4 shrink-0"><Icon.Search /></span>
            Find creators
          </button>
        </div>

        <div className="h-px bg-gray-100 dark:bg-gray-800 mx-2.5 my-1" />

        {/* Disciplines */}
        <div className="flex-1 overflow-y-auto px-2 min-h-0 pb-1">
          {proDiscs.length > 0 && (
            <>
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-2.5 pt-2 pb-1">My fields</p>
              {proDiscs.map(d => (
                <button
                  key={d.key}
                  onClick={() => navigate('/explore?discipline=' + d.key + '&view=posts')}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13.5px] mb-0.5 transition-all text-left ${
                    path.includes('discipline=' + d.key)
                      ? 'bg-brand-50 dark:bg-brand-950 text-brand-600 dark:text-brand-400 font-medium'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <span className="flex w-4 h-4 shrink-0">{d.icon}</span>
                  <span className="flex-1 min-w-0 truncate">{d.label}</span>
                  <span className="text-brand-500 dark:text-brand-400 text-[10px]">◆</span>
                </button>
              ))}
            </>
          )}
        </div>

        <div className="h-px bg-gray-100 dark:bg-gray-800 mx-2.5 my-1" />

        {/* New post */}
        <button
          onClick={() => setShowUpload(true)}
          className="mx-2 mb-2.5 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-colors"
        >
          <span className="flex w-[15px] h-[15px]"><Icon.Plus /></span>
          New post
        </button>

        {/* User area */}
        <div className="border-t border-gray-100 dark:border-gray-800 px-2 pt-2 pb-2">
          <button
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[11px] font-semibold text-blue-700 dark:text-blue-300 overflow-hidden shrink-0">
              {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(profile?.full_name || '')}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-[13px] font-medium text-gray-900 dark:text-white truncate">{profile?.full_name}</div>
              <div className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{profile?.role_title || 'General account'}</div>
            </div>
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 rounded-xl transition-colors mt-0.5"
          >
            <span className="flex w-3.5 h-3.5"><Icon.LogOut /></span>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <main className="overflow-y-auto overflow-x-hidden bg-gray-50 dark:bg-gray-900" style={{ gridColumn: '2', gridRow: '2' }}>
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
      </main>

      {/* ── RIGHT PANEL ── */}
      <div className="app-right-panel bg-white dark:bg-gray-950 border-l border-gray-100 dark:border-gray-800 overflow-y-auto" style={{ gridColumn: '3', gridRow: '2' }}>
        <RightPanel onlineFriends={onlineFriends} setOnlineFriends={setOnlineFriends} />
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
              {item.badge != null && item.badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand-600" />
              )}
            </span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} />}
      {showOnboarding && profile && (
        <OnboardingModal onDone={() => { setShowOnboarding(false); if (profile) localStorage.setItem('onboarding_done_' + profile.id, '1') }} />
      )}
    </div>
  )
}
