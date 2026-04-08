import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Profile, Group, getCanonicalDiscipline } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import { getFriends } from '@/lib/friends'
import toast from 'react-hot-toast'

interface Props {
  onlineFriends: Profile[]
  setOnlineFriends: (p: Profile[]) => void
}

export default function RightPanel({ onlineFriends, setOnlineFriends }: Props) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [friends, setFriends] = useState<Profile[]>([])
  const [suggested, setSuggested] = useState<Profile[]>([])
  const [following, setFollowing] = useState<Set<string>>(new Set())
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
  const [groups, setGroups] = useState<Group[]>([])
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!profile) return
    async function load() {
      // Load follows
      const { data: followData } = await supabase.from('follows').select('following_id').eq('follower_id', profile!.id)
      const followedIds = new Set((followData || []).map((r: any) => r.following_id as string))
      setFollowing(followedIds)

      // Load friends
      const friendIds = await getFriends(profile!.id)
      if (friendIds.length > 0) {
        const { data: friendProfiles } = await supabase
          .from('profiles')
          .select('id,username,full_name,avatar_url,profession,role_title,is_pro,verification_count')
          .in('id', friendIds)
          .limit(20)
        const fp = (friendProfiles || []) as Profile[]
        setFriends(fp)

        // Mark "active": friends who posted or interacted in last 2 hours
        const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        const { data: recentPosts } = await supabase
          .from('posts')
          .select('user_id')
          .in('user_id', friendIds)
          .gte('created_at', cutoff)
        const activeSet = new Set((recentPosts || []).map((p: any) => p.user_id as string))
        setActiveIds(activeSet)
        setOnlineFriends(fp.filter(f => activeSet.has(f.id)))
      }

      // Load suggested (not already followed or friended)
      const { data } = await supabase
        .from('profiles')
        .select('id,username,full_name,avatar_url,profession,role_title,is_pro,follower_count')
        .neq('id', profile!.id)
        .order('follower_count', { ascending: false })
        .limit(10)
      const filtered = (data || []).filter((c: any) => !followedIds.has(c.id) && !friendIds.includes(c.id)).slice(0, 4) as Profile[]
      setSuggested(filtered)

      // Load groups for user's discipline
      const canonical = getCanonicalDiscipline(profile!.profession)
      if (canonical) {
        const [groupsRes, memberRes] = await Promise.all([
          supabase.from('groups').select('id,name,slug,discipline,member_count,post_count')
            .eq('discipline', canonical)
            .order('post_count', { ascending: false })
            .limit(6),
          supabase.from('group_members').select('group_id').eq('user_id', profile!.id),
        ])
        setGroups((groupsRes.data || []) as Group[])
        setJoinedGroupIds(new Set((memberRes.data || []).map((r: any) => r.group_id)))
      }
    }
    load()
  }, [profile?.id])

  async function toggleFollow(targetId: string, name: string) {
    if (!profile) return
    if (following.has(targetId)) {
      await supabase.from('follows').delete().match({ follower_id: profile.id, following_id: targetId })
      setFollowing(f => { const n = new Set(f); n.delete(targetId); return n })
      toast(`Unfollowed ${name}`)
    } else {
      await supabase.from('follows').insert({ follower_id: profile.id, following_id: targetId })
      await supabase.from('notifications').insert({ user_id: targetId, actor_id: profile.id, type: 'follow' })
      setFollowing(f => new Set([...f, targetId]))
      toast.success(`Following ${name}`)
    }
  }

  function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  // Sort friends: active first
  const sortedFriends = [...friends].sort((a, b) => {
    const aActive = activeIds.has(a.id) ? 1 : 0
    const bActive = activeIds.has(b.id) ? 1 : 0
    return bActive - aActive
  })

  const sectionClass = "mb-5 pb-5 border-b border-gray-100 dark:border-gray-800 last:border-0 last:pb-0"
  const headingClass = "flex items-center text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3"

  return (
    <>
      {/* Friends & Active */}
      {friends.length > 0 && (
        <div className={sectionClass}>
          <div className={headingClass}>
            Friends
            {activeIds.size > 0 && (
              <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-gray-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                {activeIds.size} active
              </span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            {sortedFriends.map(f => {
              const isActive = activeIds.has(f.id)
              return (
                <button
                  key={f.id}
                  onClick={() => navigate('/messages?with=' + f.id)}
                  title={`Message ${f.full_name}`}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left w-full"
                >
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[12px] font-semibold text-blue-700 dark:text-blue-300">
                      {f.avatar_url ? <img src={f.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(f.full_name)}
                    </div>
                    {isActive && <span className="absolute -bottom-px -right-px w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white dark:border-gray-950" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-gray-900 dark:text-white truncate">{f.full_name}</p>
                    {(f as any).role_title && <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{(f as any).role_title}</p>}
                  </div>
                  <span className="flex w-3 h-3 text-gray-400 shrink-0"><Icon.MessageCircle /></span>
                </button>
              )
            })}
          </div>
          <button
            className="mt-2 w-full py-1.5 text-[11px] text-brand-600 font-medium hover:bg-brand-50 dark:hover:bg-brand-600/10 rounded-lg transition-colors"
            onClick={() => navigate('/friends')}
          >
            See all friends
          </button>
        </div>
      )}

      {/* Suggested creators */}
      {suggested.length > 0 && (
        <div className={sectionClass}>
          <div className={headingClass}>Suggested creators</div>
          <div className="flex flex-col gap-0.5">
            {suggested.map(c => (
              <div key={c.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <button
                  className="w-8 h-8 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[11px] font-semibold text-blue-700 dark:text-blue-300 shrink-0"
                  onClick={() => navigate(`/profile/${c.username}`)}
                >
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : initials(c.full_name)}
                </button>
                <button className="flex-1 min-w-0 text-left" onClick={() => navigate(`/profile/${c.username}`)}>
                  <p className="text-[12.5px] font-medium text-gray-900 dark:text-white truncate">{c.full_name}</p>
                  {(c as any).role_title && <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{(c as any).role_title}</p>}
                </button>
                <button
                  onClick={() => toggleFollow(c.id, c.full_name)}
                  className={`text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 transition-colors ${
                    following.has(c.id)
                      ? 'border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                      : 'bg-brand-600 hover:bg-brand-700 text-white'
                  }`}
                >
                  {following.has(c.id) ? 'Following' : 'Follow'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Your Groups */}
      {groups.length > 0 && (
        <div className={sectionClass}>
          <div className={headingClass}>
            Your groups
            <button
              className="ml-auto text-[11px] font-normal normal-case tracking-normal text-brand-600 hover:underline"
              onClick={() => navigate('/explore?discipline=' + getCanonicalDiscipline(profile?.profession))}
            >
              See all
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            {groups.map(g => {
              const joined = joinedGroupIds.has(g.id)
              return (
                <button
                  key={g.id}
                  onClick={() => navigate('/groups/' + g.slug)}
                  title={g.name}
                  className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left w-full"
                >
                  <div className="w-[30px] h-[30px] rounded-lg bg-brand-50 dark:bg-brand-600/10 flex items-center justify-center text-[13px] shrink-0">◈</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12.5px] font-medium text-gray-900 dark:text-white truncate">{g.name}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500">{g.post_count} posts · {g.member_count} members</p>
                  </div>
                  {joined && <span className="text-[10px] text-brand-600 font-semibold shrink-0">Joined</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
