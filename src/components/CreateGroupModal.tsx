import { useState } from 'react'
import { supabase, Group } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

interface Props {
  discipline: string
  onClose: () => void
  onCreated: (group: Group) => void
}

export default function CreateGroupModal({ discipline, onClose, onCreated }: Props) {
  const { profile } = useAuth()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  function toSlug(s: string) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleCreate() {
    if (!profile) return
    if (!name.trim()) return toast.error('Please enter a group name')
    const slug = toSlug(name) + '-' + discipline
    setSaving(true)
    const { data, error } = await supabase.from('groups').insert({
      discipline,
      name: name.trim(),
      slug,
      description: description.trim(),
      created_by: profile.id,
      is_seeded: false,
    }).select().single()
    setSaving(false)
    if (error) { toast.error('Failed to create group: ' + error.message); return }
    toast.success('Group created!')
    onCreated(data as Group)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">New group</div>
          <button className="modal-close" onClick={onClose}><Icon.X /></button>
        </div>
        <div className="field">
          <label className="field-label">Group name *</label>
          <input className="field-input" placeholder="e.g. Street Photography" value={name} onChange={e => setName(e.target.value)} maxLength={40} />
          {name && <div style={{ fontSize:11, color:'var(--color-text-3)', marginTop:4 }}>slug: #{toSlug(name)}-{discipline}</div>}
        </div>
        <div className="field">
          <label className="field-label">Description</label>
          <textarea className="field-textarea" placeholder="What is this group about?" value={description} onChange={e => setDescription(e.target.value)} style={{ minHeight:72 }} maxLength={160} />
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:2 }} onClick={handleCreate} disabled={saving}>
            {saving ? <><span className="spinner" /> Creating…</> : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  )
}
