import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, Profile, Group, getProfMeta, getCanonicalDiscipline } from '@/lib/supabase'
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
          .select('id,username,full_name,avatar_url,profession,is_pro,verification_count')
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
        .select('id,username,full_name,avatar_url,profession,is_pro,follower_count')
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

  return (
    <>
      {/* Friends & Active */}
      {friends.length > 0 && (
        <div className="rp-section">
          <div className="rp-heading">
            Friends
            <span style={{ marginLeft:'auto', fontSize:11, color:'var(--color-text-3)', fontWeight:400 }}>
              {activeIds.size > 0 && <><span className="online-dot-sm" /> {activeIds.size} active</>}
            </span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {sortedFriends.map(f => {
              const isActive = activeIds.has(f.id)
              const prof = getProfMeta(f.profession)
              return (
                <div
                  key={f.id}
                  className="friend-row"
                  onClick={() => navigate('/messages?with=' + f.id)}
                  title={`Message ${f.full_name}`}
                >
                  <div style={{ position:'relative', flexShrink:0 }}>
                    <div className="sug-av" style={{ width:34, height:34, fontSize:12 }}>
                      {f.avatar_url ? <img src={f.avatar_url} alt="" /> : initials(f.full_name)}
                    </div>
                    {isActive && <span className="online-dot" />}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.full_name}</div>
                    {prof && <div style={{ fontSize:10, color:'var(--color-text-3)' }}>{prof.label}</div>}
                  </div>
                  <span style={{ display:'flex', width:12, height:12, color:'var(--color-text-3)', flexShrink:0 }}><Icon.MessageCircle /></span>
                </div>
              )
            })}
          </div>
          <button
            className="btn btn-ghost btn-sm btn-full"
            style={{ marginTop:8, fontSize:11 }}
            onClick={() => navigate('/friends')}
          >
            See all friends
          </button>
        </div>
      )}

      {/* Suggested creators */}
      {suggested.length > 0 && (
        <div className="rp-section">
          <div className="rp-heading">Suggested creators</div>
          {suggested.map(c => {
            const p = getProfMeta(c.profession)
            return (
              <div key={c.id} className="sug-user">
                <div className="sug-av" style={{ cursor:'pointer' }} onClick={() => navigate(`/profile/${c.username}`)}>
                  {c.avatar_url ? <img src={c.avatar_url} alt="" /> : initials(c.full_name)}
                </div>
                <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => navigate(`/profile/${c.username}`)}>
                  <div className="sug-name">{c.full_name}</div>
                  <div className="sug-role">{p ? p.label : 'Creator'}</div>
                </div>
                <button className={`follow-btn ${following.has(c.id) ? 'following' : ''}`} onClick={() => toggleFollow(c.id, c.full_name)}>
                  {following.has(c.id) ? 'Following' : 'Follow'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Your Groups */}
      {groups.length > 0 && (
        <div className="rp-section">
          <div className="rp-heading">
            Your groups
            <button
              style={{ marginLeft:'auto', fontSize:11, color:'var(--color-primary)', background:'none', border:'none', cursor:'pointer', padding:0, fontWeight:500 }}
              onClick={() => navigate('/explore?discipline=' + getCanonicalDiscipline(profile?.profession))}
            >
              See all
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {groups.map(g => {
              const joined = joinedGroupIds.has(g.id)
              return (
                <div
                  key={g.id}
                  className="friend-row"
                  onClick={() => navigate('/groups/' + g.slug)}
                  title={g.name}
                >
                  <div style={{ width:30, height:30, borderRadius:'var(--r-md)', background:'var(--color-primary-light)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:13 }}>◈</span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12.5, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.name}</div>
                    <div style={{ fontSize:10, color:'var(--color-text-3)' }}>{g.post_count} posts · {g.member_count} members</div>
                  </div>
                  {joined && <span style={{ fontSize:10, color:'var(--color-primary)', fontWeight:600, flexShrink:0 }}>Joined</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Pro Status */}
      {profile?.profession && (() => { const pm = getProfMeta(profile.profession); return pm ? (
        <div className="rp-section">
          <div className="rp-heading">Your Pro Status</div>
          <div style={{ background:'var(--color-pro-light)', border:'1px solid var(--color-pro-border)', borderRadius:'var(--r-lg)', padding:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              <span style={{ display:'flex', width:16, height:16, color:'var(--color-pro)' }}><Icon.Award /></span>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--amber-600)' }}>{pm.label}</span>
            </div>
            <div style={{ fontSize:12, color:'var(--gray-600)', lineHeight:1.7 }}>
              Your Pro Upvotes carry peer authority. Only other verified {pm.label}s receive them.
            </div>
            {(profile as any).verification_count > 0 && (
              <div style={{ marginTop:8, fontSize:12, color:'var(--color-pro)', fontWeight:600 }}>
                ◈ Verified by {(profile as any).verification_count} peer{(profile as any).verification_count === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </div>
      ) : null })()}
    </>
  )
}
