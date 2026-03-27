// ── Friends & Follow helpers ──
// All social graph operations in one place

import { supabase } from './supabase'

export type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends'

/** Get the friendship status between the current user and another */
export async function getFriendStatus(myId: string, otherId: string): Promise<FriendStatus> {
  const { data } = await supabase
    .from('friend_requests')
    .select('sender_id, receiver_id, status')
    .or(`and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`)
    .maybeSingle()

  if (!data) return 'none'
  if (data.status === 'accepted') return 'friends'
  if (data.status === 'pending') {
    return data.sender_id === myId ? 'pending_sent' : 'pending_received'
  }
  return 'none'
}

/** Send a friend request */
export async function sendFriendRequest(myId: string, otherId: string, otherName: string) {
  const { error } = await supabase
    .from('friend_requests')
    .insert({ sender_id: myId, receiver_id: otherId })
  if (error) throw error
  // Notify the receiver
  await supabase.from('notifications').insert({
    user_id: otherId, actor_id: myId,
    type: 'friend_request',
  })
}

/** Accept a friend request */
export async function acceptFriendRequest(myId: string, senderId: string) {
  const { error } = await supabase
    .from('friend_requests')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .match({ sender_id: senderId, receiver_id: myId })
  if (error) throw error
  // Increment friend counts for both
  await supabase.rpc('increment_friend_counts', { uid1: myId, uid2: senderId })
  // Notify sender their request was accepted
  await supabase.from('notifications').insert({
    user_id: senderId, actor_id: myId,
    type: 'friend_accepted',
  })
}

/** Decline or cancel a friend request */
export async function declineFriendRequest(myId: string, otherId: string) {
  await supabase
    .from('friend_requests')
    .delete()
    .or(`and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`)
}

/** Unfriend someone */
export async function unfriend(myId: string, otherId: string) {
  await supabase
    .from('friend_requests')
    .delete()
    .or(`and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`)
  // Decrement friend counts
  await supabase.rpc('decrement_friend_counts', { uid1: myId, uid2: otherId })
}

/** Get all friends of a user */
export async function getFriends(userId: string) {
  const { data } = await supabase
    .from('friendships')
    .select('friend_id')
    .eq('user_id', userId)
  return (data || []).map((r: any) => r.friend_id)
}

/** Get pending friend requests received by user */
export async function getPendingRequests(userId: string) {
  const { data } = await supabase
    .from('friend_requests')
    .select('*, sender:sender_id(id, username, full_name, avatar_url, profession)')
    .eq('receiver_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return data || []
}
