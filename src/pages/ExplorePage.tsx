import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase, Post, Profile, Group, getProfMeta, getCanonicalDiscipline, getDisciplineMembers } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import PostCard from '@/components/PostCard'
import CreateGroupModal from '@/components/CreateGroupModal'
import UploadModal from '@/components/UploadModal'

const PREDEFINED_KEYS = new Set([
  'photographer','singer','musician','poet','visual-artist','filmmaker','dancer','comedian',
  'culinary','fitness','technology','fashion','architecture',
  'medicine','education','law','science','business','wellness',
])

type DisciplineIcon = () => JSX.Element

const DISCIPLINES: { key: string; Icon: DisciplineIcon; name: string; count: string }[] = [
  { key: 'photographer',  Icon: Icon.Camera,     name: 'Photography',     count: '4.1k' },
  { key: 'singer',        Icon: Icon.Mic,        name: 'Vocals & Singing', count: '2.8k' },
  { key: 'poet',          Icon: Icon.PenLine,    name: 'Poetry & Writing', count: '1.6k' },
  { key: 'visual-artist', Icon: Icon.Paintbrush, name: 'Visual Arts',      count: '3.2k' },
  { key: 'filmmaker',     Icon: Icon.Film,       name: 'Film & Video',     count: '980'  },
  { key: 'musician',      Icon: Icon.Music,      name: 'Music',            count: '2.3k' },
  { key: 'dancer',        Icon: Icon.Music,      name: 'Dance',            count: '1.1k' },
  { key: 'comedian',      Icon: Icon.Drama,      name: 'Performance',      count: '740'  },
  { key: 'culinary',      Icon: Icon.Utensils,   name: 'Culinary Arts',    count: ''     },
  { key: 'fitness',       Icon: Icon.Activity,   name: 'Fitness & Sports', count: ''     },
  { key: 'technology',    Icon: Icon.Code,       name: 'Technology',       count: ''     },
  { key: 'fashion',       Icon: Icon.Scissors,   name: 'Fashion & Style',  count: ''     },
  { key: 'architecture',  Icon: Icon.Building,   name: 'Architecture',     count: ''     },
  { key: 'medicine',      Icon: Icon.Heart2,     name: 'Medicine & Health',  count: ''     },
  { key: 'education',     Icon: Icon.PenLine,    name: 'Education',          count: ''     },
  { key: 'law',           Icon: Icon.Shield,     name: 'Law & Justice',      count: ''     },
  { key: 'science',       Icon: Icon.Microscope, name: 'Science & Research', count: ''     },
  { key: 'business',      Icon: Icon.Briefcase,  name: 'Business',           count: ''     },
  { key: 'wellness',      Icon: Icon.Heart2,     name: 'Wellness & Mind',    count: ''     },
]

export default function ExplorePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedDiscipline = searchParams.get('discipline')
  const [posts, setPosts] = useState<Post[]>([])
  const [creators, setCreators] = useState<Profile[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'posts' | 'creators' | 'groups'>(
    (searchParams.get('view') as 'posts' | 'creators' | 'groups') || 'posts'
  )
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [customDisciplines, setCustomDisciplines] = useState<string[]>([])
  // Which disciplines the user has already joined as Pro
  const [myDisciplines, setMyDisciplines] = useState<Set<string>>(new Set())
  const [showUpload, setShowUpload] = useState(false)
  const [leaving, setLeaving] = useState(false)

  // Load user's Pro disciplines
  useEffect(() => {
    if (!profile) return
    supabase.from('discipline_personas').select('discipline').eq('user_id', profile.id)
      .then(({ data }) => {
        setMyDisciplines(new Set((data || []).map((r: any) => r.discipline as string)))
      })
  }, [profile?.id])

  async function leaveDiscipline(discipline: string) {
    if (!profile) return
    setLeaving(true)
    await supabase.from('discipline_personas').delete().eq('user_id', profile.id).eq('discipline', discipline)
    setMyDisciplines(prev => { const n = new Set(prev); n.delete(discipline); return n })
    setLeaving(false)
  }

  // Load any user-generated disciplines not in the predefined set
  useEffect(() => {
    supabase.from('profiles').select('profession').not('profession', 'is', null)
      .then(({ data }) => {
        if (!data) return
        const unique = [...new Set((data as any[]).map(p => p.profession as string))]
          .filter(p => !PREDEFINED_KEYS.has(p) && !PREDEFINED_KEYS.has(getCanonicalDiscipline(p) || ''))
        setCustomDisciplines(unique)
      })
  }, [])

  useEffect(() => {
    if (!selectedDiscipline) return
    async function load() {
      setLoading(true)
      // Include all alias professions that map to this discipline
      const members = getDisciplineMembers(selectedDiscipline!)
      if (view === 'posts') {
        // PRD field feed: 80% ranked by Pro Multiplier, 20% Newcomer Protection Pool
        // Fetch established posts (have received pro votes) + newcomer pool separately
        const [establishedRes, newcomerRes] = await Promise.all([
          supabase.from('posts')
            .select('*, profiles!user_id(*), group:group_id(*)')
            .in('persona_discipline', members)
            .gt('pro_upvote_count', 0)
            .order('pro_upvote_count', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(16),
          supabase.from('posts')
            .select('*, profiles!user_id(*), group:group_id(*)')
            .in('persona_discipline', members)
            .eq('pro_upvote_count', 0)
            .order('created_at', { ascending: false })
            .limit(8),
        ])
        // Interleave: 4 established, 1 newcomer (20% protection pool)
        const established = (establishedRes.data || []) as Post[]
        const newcomers   = (newcomerRes.data  || []) as Post[]
        const merged: Post[] = []
        let ei = 0, ni = 0
        while (ei < established.length || ni < newcomers.length) {
          for (let i = 0; i < 4 && ei < established.length; i++) merged.push(established[ei++])
          if (ni < newcomers.length) merged.push(newcomers[ni++])
        }
        setPosts(merged)
      } else if (view === 'creators') {
        const { data: dp } = await supabase.from('discipline_personas').select('user_id').in('discipline', members)
        const uids = [...new Set((dp || []).map((r: any) => r.user_id as string))]
        if (uids.length === 0) { setCreators([]); setLoading(false); return }
        const { data } = await supabase.from('profiles').select('*').in('id', uids).order('follower_count', { ascending: false }).limit(30)
        setCreators((data || []) as Profile[])
      } else {
        const { data } = await supabase.from('groups').select('*').in('discipline', members).order('post_count', { ascending: false })
        setGroups((data || []) as Group[])
      }
      setLoading(false)
    }
    load()
  }, [selectedDiscipline, view])

  function initials(name: string) { return name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  // Only Pro users in this discipline can create groups
  const canCreateGroup = !!(profile && selectedDiscipline && myDisciplines.has(selectedDiscipline))

  if (selectedDiscipline) {
    const meta = getProfMeta(selectedDiscipline)
    const disc = DISCIPLINES.find(d => d.key === selectedDiscipline)
    return (
      <div className="max-w-[700px] mx-auto px-8 py-6">
        {/* Back + header */}
        <div className="apple-card px-5 py-4 flex items-center gap-3 mb-5">
          <button
            onClick={() => setSearchParams({})}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="flex w-3.5 h-3.5"><Icon.ArrowLeft /></span>
            Back
          </button>
          {disc && (
            <div className="w-9 h-9 bg-brand-50 dark:bg-brand-950/40 rounded-xl flex items-center justify-center">
              <span className="flex w-[18px] h-[18px] text-brand-600 dark:text-brand-400"><disc.Icon /></span>
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900 dark:text-white text-[16px]">{meta?.label || selectedDiscipline}</p>
            <p className="text-[12px] text-gray-400 dark:text-gray-500">Verified professionals</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-5">
          {(['posts', 'creators', 'groups'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 text-[13.5px] font-semibold rounded-full transition-all ${
                view === v
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/8'
              }`}
            >
              {v === 'posts' ? 'Top posts' : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        {/* Join / member banner */}
        {profile && !myDisciplines.has(selectedDiscipline) && (
          <div className="apple-card flex items-center gap-4 px-4 py-4 mb-4" style={{ background: 'linear-gradient(135deg, rgba(128,0,32,0.04) 0%, transparent 100%)' }}>
            {disc && <div className="w-10 h-10 bg-white dark:bg-gray-900 rounded-xl flex items-center justify-center shadow-xs shrink-0">
              <span className="flex w-5 h-5 text-brand-600 dark:text-brand-400"><disc.Icon /></span>
            </div>}
            <div className="flex-1 min-w-0">
              <p className="text-[13.5px] font-semibold text-gray-900 dark:text-white">Share your {meta?.label ?? selectedDiscipline} work here</p>
              <p className="text-[12px] text-gray-500 dark:text-gray-400 mt-0.5">Post Pro content to establish yourself. Your first post makes you a Newcomer.</p>
            </div>
            <button onClick={() => setShowUpload(true)} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-full hover:bg-brand-700 transition-colors shrink-0">
              Post here
            </button>
          </div>
        )}
        {profile && myDisciplines.has(selectedDiscipline) && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl mb-4 text-[13px]">
            <span className="flex w-3.5 h-3.5 text-amber-500"><Icon.Award /></span>
            <span className="font-medium text-amber-700 dark:text-amber-400">You're in {meta?.label ?? selectedDiscipline}</span>
            <span className="text-gray-400 dark:text-gray-500">· Post Pro content to grow your standing</span>
            <button
              onClick={() => leaveDiscipline(selectedDiscipline)}
              disabled={leaving}
              className="ml-auto text-[11px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              {leaving ? <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" /> : 'Leave'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : view === 'posts' ? (
          posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              {disc && <span className="flex w-10 h-10 mb-3 text-gray-300 dark:text-gray-600"><disc.Icon /></span>}
              <p className="font-semibold text-gray-600 dark:text-gray-400">No posts yet</p>
              <p className="text-sm mt-1 text-gray-400">Be the first verified {meta?.label || selectedDiscipline} to post</p>
            </div>
          ) : posts.map((p, i) => (
            <div key={p.id}>
              {i > 0 && (i % 5 === 4) && p.pro_upvote_count === 0 && (
                <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 my-4">
                  <div className="w-5 h-px bg-gray-200 dark:bg-gray-700" />
                  ✦ Rising Talent
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>
              )}
              <PostCard post={p} />
            </div>
          ))
        ) : view === 'creators' ? (
          <div className="space-y-2">
            {creators.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <p className="font-semibold text-gray-600 dark:text-gray-400">No verified creators yet</p>
              </div>
            ) : creators.map(c => (
              <button
                key={c.id}
                onClick={() => navigate('/profile/' + c.username)}
                className="w-full apple-card flex items-center gap-3.5 px-4 py-3.5 transition-all text-left"
              >
                <div className="w-11 h-11 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[14px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(c.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[14px] text-gray-900 dark:text-white">{c.full_name}</p>
                  <p className="text-[12px] text-gray-400 dark:text-gray-500 font-mono">@{c.username}</p>
                  {c.bio && <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1 truncate">{c.bio}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-[16px] text-gray-900 dark:text-white">{c.follower_count}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">followers</p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {canCreateGroup && (
              <div className="flex justify-end mb-1">
                <button onClick={() => setShowCreateGroup(true)} className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-full hover:bg-brand-700 transition-colors">
                  <span className="flex w-3.5 h-3.5"><Icon.Plus /></span>
                  New group
                </button>
              </div>
            )}
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <p className="font-semibold text-gray-600 dark:text-gray-400">No groups yet</p>
              </div>
            ) : groups.map(g => (
              <button
                key={g.id}
                onClick={() => navigate('/groups/' + g.slug)}
                className="w-full apple-card text-left px-4 py-3.5 transition-all"
              >
                <p className="font-semibold text-[14px] text-gray-900 dark:text-white">{g.name}</p>
                {g.description && <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1">{g.description}</p>}
                <p className="text-[11.5px] text-gray-400 dark:text-gray-500 mt-2">{g.post_count} posts</p>
              </button>
            ))}
          </div>
        )}

        {showCreateGroup && selectedDiscipline && (
          <CreateGroupModal discipline={selectedDiscipline} onClose={() => setShowCreateGroup(false)} onCreated={g => { setGroups(gs => [g, ...gs]); setShowCreateGroup(false) }} />
        )}
        {showUpload && selectedDiscipline && (
          <UploadModal
            defaultDiscipline={selectedDiscipline}
            onClose={() => {
              setShowUpload(false)
              if (profile) {
                supabase.from('discipline_personas').select('discipline').eq('user_id', profile.id)
                  .then(({ data }) => setMyDisciplines(new Set((data || []).map((r: any) => r.discipline as string))))
              }
            }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="px-8 py-6">
      <h1 className="text-[22px] font-bold text-gray-900 dark:text-white tracking-tight mb-1">Explore fields</h1>
      <p className="text-[13.5px] text-gray-400 dark:text-gray-500 mb-6">Discover verified creators across every professional field</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {DISCIPLINES.map(d => (
          <button
            key={d.key}
            onClick={() => setSearchParams({ discipline: d.key })}
            className="group apple-card flex flex-col items-start gap-2 p-4 text-left transition-all"
          >
            <div className="w-10 h-10 bg-brand-50 dark:bg-brand-950/40 rounded-xl flex items-center justify-center group-hover:bg-brand-100 dark:group-hover:bg-brand-950/60 transition-colors">
              <span className="flex w-5 h-5 text-brand-600 dark:text-brand-400"><d.Icon /></span>
            </div>
            <p className="font-semibold text-[13.5px] text-gray-900 dark:text-white leading-snug">{d.name}</p>
            {d.count && <p className="text-[12px] text-gray-400 dark:text-gray-500">{d.count} creators</p>}
            <p className="text-[11px] font-semibold text-brand-500 dark:text-brand-400 uppercase tracking-wide">Pro verified</p>
          </button>
        ))}
      </div>

      {customDisciplines.length > 0 && (
        <>
          <h2 className="text-[14px] font-semibold text-gray-600 dark:text-gray-400 mt-8 mb-3">Community fields</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {customDisciplines.map(d => (
              <button
                key={d}
                onClick={() => setSearchParams({ discipline: d })}
                className="apple-card flex flex-col items-start gap-2 p-4 text-left transition-all"
              >
                <div className="w-10 h-10 bg-gray-50 dark:bg-gray-800 rounded-xl flex items-center justify-center text-lg">✦</div>
                <p className="font-semibold text-[13.5px] text-gray-900 dark:text-white">{d.charAt(0).toUpperCase() + d.slice(1)}</p>
                <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Creator verified</p>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
