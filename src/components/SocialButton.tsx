import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/AuthContext'
import { supabase, FriendStatus } from '@/lib/supabase'
import {
  getFriendStatus, sendFriendRequest,
  acceptFriendRequest, declineFriendRequest, unfriend
} from '@/lib/friends'
import toast from 'react-hot-toast'

interface Props {
  targetId: string
  targetName: string
  compact?: boolean // smaller layout for cards/panels
}

export default function SocialButton({ targetId, targetName, compact = false }: Props) {
  const { profile } = useAuth()
  const [isFollowing, setIsFollowing] = useState(false)
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile || profile.id === targetId) { setLoading(false); return }
    async function load() {
      const [followRes, fStatus] = await Promise.all([
        supabase.from('follows').select('follower_id')
          .eq('follower_id', profile!.id).eq('following_id', targetId).maybeSingle(),
        getFriendStatus(profile!.id, targetId),
      ])
      setIsFollowing(!!followRes.data)
      setFriendStatus(fStatus)
      setLoading(false)
    }
    load()
  }, [profile?.id, targetId])

  if (!profile || profile.id === targetId) return null
  if (loading) return <div style={{ width: 80, height: 30 }} />

  async function toggleFollow() {
    if (!profile) return
    if (isFollowing) {
      await supabase.from('follows').delete()
        .match({ follower_id: profile.id, following_id: targetId })
      setIsFollowing(false)
      toast(`Unfollowed ${targetName}`)
    } else {
      await supabase.from('follows').insert({ follower_id: profile.id, following_id: targetId })
      await supabase.from('notifications').insert({
        user_id: targetId, actor_id: profile.id, type: 'follow'
      })
      setIsFollowing(true)
      toast.success(`Following ${targetName}`)
    }
  }

  async function handleFriendAction() {
    if (!profile) return
    try {
      if (friendStatus === 'none') {
        await sendFriendRequest(profile.id, targetId, targetName)
        setFriendStatus('pending_sent')
        toast.success(`Friend request sent to ${targetName}`)
      } else if (friendStatus === 'pending_sent') {
        await declineFriendRequest(profile.id, targetId)
        setFriendStatus('none')
        toast('Friend request cancelled')
      } else if (friendStatus === 'pending_received') {
        await acceptFriendRequest(profile.id, targetId)
        setFriendStatus('friends')
        toast.success(`You and ${targetName} are now friends! 🎉`)
      } else if (friendStatus === 'friends') {
        await unfriend(profile.id, targetId)
        setFriendStatus('none')
        toast(`Removed ${targetName} as a friend`)
      }
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong')
    }
  }

  const friendBtnLabel = {
    none: '+ Add friend',
    pending_sent: 'Requested ·  cancel',
    pending_received: '✓ Accept request',
    friends: '✦ Friends',
  }[friendStatus]

  const friendBtnClass = {
    none: 'btn-ghost',
    pending_sent: 'btn-ghost',
    pending_received: 'btn-primary',
    friends: 'btn-gold',
  }[friendStatus]

  if (compact) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className={`follow-btn ${isFollowing ? 'following' : ''}`}
          onClick={toggleFollow}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {/* Follow button — one-way content subscription */}
      <button
        className={`btn btn-sm ${isFollowing ? 'btn-ghost' : 'btn-primary'}`}
        onClick={toggleFollow}
        title={isFollowing ? 'Unfollow — stop seeing their posts in your Following feed' : 'Follow — see their posts in your Following feed'}
      >
        {isFollowing ? '✓ Following' : '+ Follow'}
      </button>

      {/* Friend button — mutual personal connection */}
      <button
        className={`btn btn-sm ${friendBtnClass}`}
        onClick={handleFriendAction}
        title="Friends see each other's posts in the Friends feed"
      >
        {friendBtnLabel}
      </button>
    </div>
  )
}
