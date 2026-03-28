import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [duplicates, setDuplicates] = useState<Group[]>([])
  const [exactMatch, setExactMatch] = useState<Group | null>(null)
  const [checking, setChecking] = useState(false)

  function toSlug(s: string) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  // Check for existing groups with similar names as the user types
  useEffect(() => {
    const trimmed = name.trim()
    if (!trimmed) { setDuplicates([]); setExactMatch(null); return }

    const t = setTimeout(async () => {
      setChecking(true)
      const { data } = await supabase
        .from('groups')
        .select('*')
        .eq('discipline', discipline)
        .ilike('name', `%${trimmed}%`)
      setChecking(false)
      if (!data || data.length === 0) { setDuplicates([]); setExactMatch(null); return }
      const exact = data.find((g: Group) => g.name.toLowerCase() === trimmed.toLowerCase()) ?? null
      setExactMatch(exact)
      setDuplicates(data as Group[])
    }, 300)
    return () => clearTimeout(t)
  }, [name, discipline])

  async function handleCreate() {
    if (!profile) return
    if (!name.trim()) return toast.error('Please enter a group name')
    if (exactMatch) return // button is disabled anyway
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

  const similarButNotExact = duplicates.filter(g => g.name.toLowerCase() !== name.trim().toLowerCase())

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">New group</div>
          <button className="modal-close" onClick={onClose}><Icon.X /></button>
        </div>

        <div className="field">
          <label className="field-label">Group name *</label>
          <input
            className={`field-input ${exactMatch ? 'field-input-error' : ''}`}
            placeholder="e.g. Street Photography"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={40}
          />
          {name && !exactMatch && !checking && (
            <div style={{ fontSize:11, color:'var(--color-text-3)', marginTop:4 }}>
              slug: #{toSlug(name)}-{discipline}
            </div>
          )}
        </div>

        {/* Exact duplicate — block creation */}
        {exactMatch && (
          <div className="group-duplicate-banner">
            <div className="group-duplicate-title">This group already exists</div>
            <div className="group-duplicate-desc">"{exactMatch.name}" is already a group in this discipline.</div>
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop:8 }}
              onClick={() => { onClose(); navigate('/groups/' + exactMatch.slug) }}
            >
              Go to #{exactMatch.name}
            </button>
          </div>
        )}

        {/* Similar groups — warn but allow creation */}
        {!exactMatch && similarButNotExact.length > 0 && (
          <div className="group-similar-banner">
            <div className="group-similar-title">Similar groups already exist</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop:6 }}>
              {similarButNotExact.map(g => (
                <div key={g.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                  <div>
                    <span style={{ fontWeight:600, fontSize:13, color:'var(--color-primary)' }}>#{g.name}</span>
                    {g.description && <span style={{ fontSize:12, color:'var(--color-text-3)', marginLeft:6 }}>{g.description}</span>}
                  </div>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => { onClose(); navigate('/groups/' + g.slug) }}
                  >View</button>
                </div>
              ))}
            </div>
            <div style={{ fontSize:11, color:'var(--color-text-3)', marginTop:8 }}>
              You can still create your group if none of these match.
            </div>
          </div>
        )}

        <div className="field">
          <label className="field-label">Description</label>
          <textarea
            className="field-textarea"
            placeholder="What is this group about?"
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{ minHeight:72 }}
            maxLength={160}
          />
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="btn btn-primary"
            style={{ flex:2 }}
            onClick={handleCreate}
            disabled={saving || !!exactMatch || !name.trim()}
          >
            {saving ? <><span className="spinner" /> Creating…</> : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  )
}
