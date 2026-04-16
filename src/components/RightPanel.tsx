import { useEffect, useState } from 'react'
import { useLazyLoad } from '@/hooks/useLazyLoad'
import { useNavigate } from 'react-router-dom'
import { supabase, Profile, Group, getCanonicalDiscipline } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { getFriends } from '@/lib/friends'
import toast from 'react-hot-toast'

interface Props {
  onlineFriends: Profile[]
  setOnlineFriends: (p: Profile[]) => void
  onOpenChat: (p: Profile) => void
}

export default function RightPanel({ onlineFriends, setOnlineFriends, onOpenChat }: Props) {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [friends, setFriends] = useState<Profile[]>([])
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())
  const [groups, setGroups] = useState<Group[]>([])
  const [joinedGroupIds, setJoinedGroupIds] = useState<Set<string>>(new Set())
  const [suggested, setSuggested] = useState<Profile[]>([])
  const [following, setFollowing] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!profile) return
    async function load() {
      // Follows
      const { data: followData } = await supabase.from('follows').select('following_id').eq('follower_id', profile!.id)
      const followedIds = new Set((followData || []).map((r: any) => r.following_id as string))
      setFollowing(followedIds)

      // Friends
      const friendIds = await getFriends(profile!.id)
      if (friendIds.length > 0) {
        const { data: fp } = await supabase
          .from('profiles')
          .select('id,username,full_name,avatar_url,profession,role_title,is_pro,verification_count')
          .in('id', friendIds).limit(20)
        const friendList = (fp || []) as Profile[]
        setFriends(friendList)

        const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
        const { data: recentPosts } = await supabase.from('posts').select('user_id').in('user_id', friendIds).gte('created_at', cutoff)
        const activeSet = new Set((recentPosts || []).map((p: any) => p.user_id as string))
        setActiveIds(activeSet)
        setOnlineFriends(friendList.filter(f => activeSet.has(f.id)))
      }

      // Groups
      const canonical = getCanonicalDiscipline(profile!.profession)
      if (canonical) {
        const [groupsRes, memberRes] = await Promise.all([
          supabase.from('groups').select('id,name,slug,discipline,member_count,post_count')
            .eq('discipline', canonical).order('post_count', { ascending: false }).limit(5),
          supabase.from('group_members').select('group_id').eq('user_id', profile!.id),
        ])
        setGroups((groupsRes.data || []) as Group[])
        setJoinedGroupIds(new Set((memberRes.data || []).map((r: any) => r.group_id)))
      }

      // Suggested creators
      const { data: suggestedData } = await supabase
        .from('profiles')
        .select('id,username,full_name,avatar_url,profession,role_title,follower_count')
        .neq('id', profile!.id)
        .order('follower_count', { ascending: false })
        .limit(15)
      const friendIdSet = new Set(await getFriends(profile!.id))
      const filtered = (suggestedData || [])
        .filter((c: any) => !followedIds.has(c.id) && !friendIdSet.has(c.id))
        .slice(0, 4) as Profile[]
      setSuggested(filtered)
    }
    load()
  }, [profile?.id])

  async function toggleFollow(targetId: string, name: string) {
    if (!profile) return
    if (following.has(targetId)) {
      await supabase.from('follows').delete().match({ follower_id: profile.id, following_id: targetId })
      setFollowing(f => { const n = new Set(f); n.delete(targetId); return n })
      // Remove from suggested if now unfollowed — keep them visible but update state
      toast(`Unfollowed ${name}`)
    } else {
      await supabase.from('follows').insert({ follower_id: profile.id, following_id: targetId })
      await supabase.from('notifications').insert({ user_id: targetId, actor_id: profile.id, type: 'follow' })
      setFollowing(f => new Set([...f, targetId]))
      toast.success(`Following ${name}`)
    }
  }

  function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  const sortedFriends = [...friends].sort((a, b) => (activeIds.has(b.id) ? 1 : 0) - (activeIds.has(a.id) ? 1 : 0))

  const avatarColors = [
    'bg-blue-100 text-blue-700', 'bg-red-100 text-red-700',
    'bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700',
    'bg-green-100 text-green-700', 'bg-pink-100 text-pink-700',
  ]

  return (
    <div className="p-4 space-y-4">

      {/* ── Friends + Groups card ── */}
      {(friends.length > 0 || groups.length > 0) && (
        <div className="apple-card p-5">

          {/* Friends */}
          {friends.length > 0 && (
            <>
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
                Friends
                {activeIds.size > 0 && (
                  <span className="ml-2 font-normal normal-case tracking-normal text-[10px] text-gray-400 inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                    {activeIds.size} active
                  </span>
                )}
              </h3>
              <div className="space-y-0.5">
                {sortedFriends.map((f, i) => {
                  const isActive = activeIds.has(f.id)
                  return (
                    <button
                      key={f.id}
                      onClick={() => onOpenChat(f)}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group text-left"
                    >
                      <div className="relative shrink-0">
                        <div className={`w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-bold ${avatarColors[i % avatarColors.length]}`}>
                          {f.avatar_url ? <img src={f.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : initials(f.full_name)}
                        </div>
                        {isActive && <span className="absolute -bottom-px -right-px w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white dark:border-gray-900" />}
                      </div>
                      <p className="flex-1 text-[14px] font-semibold text-gray-900 dark:text-white truncate group-hover:text-brand-600 transition-colors">
                        {f.full_name}
                      </p>
                    </button>
                  )
                })}
              </div>
              <button
                className="mt-2 w-full py-1.5 text-[12px] text-brand-600 font-medium hover:bg-brand-50 dark:hover:bg-brand-950/30 rounded-lg transition-colors"
                onClick={() => navigate('/friends')}
              >
                See all friends
              </button>
            </>
          )}

          {/* Groups */}
          {groups.length > 0 && (
            <>
              <div className="h-px bg-gray-100 dark:bg-gray-800 my-4" />
              <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
                Groups
              </h3>
              <div className="space-y-0.5">
                {groups.map((g, gi) => {
                  const joined = joinedGroupIds.has(g.id)
                  const groupFriends = sortedFriends.slice(0, 3)
                  return (
                    <button
                      key={g.id}
                      onClick={() => navigate('/groups/' + g.slug)}
                      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
                    >
                      {/* Stacked avatars */}
                      <div className="flex items-center shrink-0" style={{ width: groupFriends.length > 1 ? 42 : 36 }}>
                        {groupFriends.length > 0 ? groupFriends.map((f, fi) => (
                          <div
                            key={f.id}
                            style={{ marginLeft: fi === 0 ? 0 : -8, zIndex: groupFriends.length - fi }}
                            className={`relative w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-[8px] font-bold border-2 border-white dark:border-gray-900 ${avatarColors[(gi + fi) % avatarColors.length]}`}
                          >
                            {f.avatar_url ? <img src={f.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : initials(f.full_name)}
                          </div>
                        )) : (
                          <div className="w-7 h-7 rounded-full bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center text-[11px]">◈</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-gray-900 dark:text-white truncate group-hover:text-brand-600 transition-colors">{g.name}</p>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500">{g.member_count} participants</p>
                      </div>
                      {joined && <span className="text-[10px] text-brand-600 font-semibold shrink-0">Joined</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )}

        </div>
      )}

      {/* ── Discover creators card ── */}
      {suggested.length > 0 && (
        <div className="apple-card p-5">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-4">
            Discover creators
          </h3>
          <div className="space-y-3">
            {suggested.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3">
                <button
                  onClick={() => navigate(`/profile/${c.username}`)}
                  className={`w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-bold shrink-0 ${avatarColors[i % avatarColors.length]}`}
                >
                  {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" /> : initials(c.full_name)}
                </button>
                <button
                  className="flex-1 min-w-0 text-left"
                  onClick={() => navigate(`/profile/${c.username}`)}
                >
                  <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate leading-tight">{c.full_name}</p>
                  {(c as any).role_title && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">{(c as any).role_title}</p>
                  )}
                </button>
                <button
                  onClick={() => toggleFollow(c.id, c.full_name)}
                  className={`shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                    following.has(c.id)
                      ? 'border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50'
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

    </div>
  )
}
