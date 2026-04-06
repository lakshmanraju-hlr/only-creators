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

  const fieldClass = "w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-brand-600 dark:focus:border-brand-400 transition-colors"
  const labelClass = "block text-[12px] font-medium text-gray-600 dark:text-gray-400 mb-1.5"

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[480px] bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[18px] font-bold text-gray-900 dark:text-white tracking-tight">New group</h2>
          <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors" onClick={onClose}>
            <span className="flex w-4 h-4"><Icon.X /></span>
          </button>
        </div>

        <div className="mb-4">
          <label className={labelClass}>Group name *</label>
          <input
            className={`${fieldClass} ${exactMatch ? 'border-red-500 dark:border-red-500' : ''}`}
            placeholder="e.g. Street Photography"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={40}
          />
          {name && !exactMatch && !checking && (
            <p className="text-[11px] text-gray-400 mt-1">url: /groups/{toSlug(name)}-{discipline}</p>
          )}
        </div>

        {/* Exact duplicate */}
        {exactMatch && (
          <div className="mb-4 p-3.5 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl">
            <p className="font-semibold text-[13px] text-red-700 dark:text-red-400">This group already exists</p>
            <p className="text-[12px] text-red-600 dark:text-red-500 mt-0.5">"{exactMatch.name}" is already a group in this field.</p>
            <button
              className="mt-2.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-full text-[12px] font-medium transition-colors"
              onClick={() => { onClose(); navigate('/groups/' + exactMatch.slug) }}
            >
              Go to {exactMatch.name}
            </button>
          </div>
        )}

        {/* Similar groups */}
        {!exactMatch && similarButNotExact.length > 0 && (
          <div className="mb-4 p-3.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl">
            <p className="font-semibold text-[13px] text-amber-700 dark:text-amber-400 mb-2">Similar groups already exist</p>
            <div className="flex flex-col gap-1.5">
              {similarButNotExact.map(g => (
                <div key={g.id} className="flex items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-[13px] text-brand-600">{g.name}</span>
                    {g.description && <span className="text-[12px] text-gray-400 ml-1.5">{g.description}</span>}
                  </div>
                  <button
                    className="text-[11px] text-brand-600 font-medium hover:underline shrink-0"
                    onClick={() => { onClose(); navigate('/groups/' + g.slug) }}
                  >View</button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-500 mt-2">You can still create your group if none of these match.</p>
          </div>
        )}

        <div className="mb-5">
          <label className={labelClass}>Description</label>
          <textarea
            className={fieldClass + ' resize-none'}
            placeholder="What is this group about?"
            value={description}
            onChange={e => setDescription(e.target.value)}
            style={{ minHeight: 72 }}
            maxLength={160}
          />
        </div>

        <div className="flex gap-2.5">
          <button
            className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-[14px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            onClick={onClose} disabled={saving}
          >Cancel</button>
          <button
            className="flex-[2] py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-[14px] font-medium flex items-center justify-center gap-2 transition-colors"
            onClick={handleCreate}
            disabled={saving || !!exactMatch || !name.trim()}
          >
            {saving ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Creating…</> : 'Create group'}
          </button>
        </div>
      </div>
    </div>
  )
}
