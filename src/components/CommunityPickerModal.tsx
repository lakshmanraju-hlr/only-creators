import { useState, useEffect } from 'react'
import { supabase, Group, getProfMeta, FIELD_CONTENT_PROFILES } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

interface Props {
  postId: string
  postDiscipline: string | null  // pre-filters field; null = let user pick
  onClose: () => void
  onSaved: () => void
}

export default function CommunityPickerModal({ postId, postDiscipline, onClose, onSaved }: Props) {
  const { profile } = useAuth()
  const [discipline, setDiscipline]   = useState(postDiscipline ?? '')
  const [groups, setGroups]           = useState<Group[]>([])
  const [search, setSearch]           = useState('')
  const [selected, setSelected]       = useState<Group | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [groupsLoading, setGroupsLoading]   = useState(false)
  const [saving, setSaving]           = useState(false)
  const [creating, setCreating]       = useState(false)

  // Load current community for this post
  useEffect(() => {
    async function loadCurrent() {
      setInitialLoading(true)
      const { data: subData } = await supabase
        .from('post_subgroups')
        .select('subgroup_id')
        .eq('post_id', postId)
        .maybeSingle()
      if (subData?.subgroup_id) {
        const { data: groupData } = await supabase
          .from('groups').select('*').eq('id', subData.subgroup_id).single()
        if (groupData) {
          const g = groupData as Group
          setSelected(g)
          if (!discipline && g.discipline) setDiscipline(g.discipline)
        }
      }
      setInitialLoading(false)
    }
    loadCurrent()
  }, [postId])

  // Load groups when discipline changes
  useEffect(() => {
    if (!discipline) { setGroups([]); return }
    setGroupsLoading(true)
    supabase.from('groups')
      .select('*').eq('discipline', discipline).order('post_count', { ascending: false })
      .then(({ data }) => {
        setGroups((data || []) as Group[])
        setGroupsLoading(false)
      })
  }, [discipline])

  async function handleCreate() {
    if (search.trim().length < 2 || !discipline || !profile) return
    setCreating(true)
    const name = search.trim()
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36)
    const { data, error } = await supabase.from('groups').insert({
      discipline,
      name,
      slug,
      description: '',
      is_seeded: false,
      is_user_created: true,
      created_by: profile.id,
    }).select('*').single()
    setCreating(false)
    if (error) { toast.error('Could not create community'); return }
    const newGroup = data as Group
    setGroups(prev => [newGroup, ...prev])
    setSelected(newGroup)
    setSearch('')
    toast.success(`"${name}" created`)
  }

  async function handleSave() {
    setSaving(true)
    // Replace any existing community tag for this post
    await supabase.from('post_subgroups').delete().eq('post_id', postId)
    if (selected) {
      await supabase.from('post_subgroups').insert({ post_id: postId, subgroup_id: selected.id })
      await supabase.from('posts').update({
        group_id: selected.id,
        persona_discipline: discipline || null,
        is_pro_post: true,
        is_pro: true,
        post_type: 'pro',
      }).eq('id', postId)
    } else {
      await supabase.from('posts').update({ group_id: null }).eq('id', postId)
    }
    setSaving(false)
    toast.success(selected ? `Moved to ${selected.name}` : 'Community removed')
    onSaved()
    onClose()
  }

  const filtered = groups.filter(g =>
    !search || g.name.toLowerCase().includes(search.toLowerCase())
  )
  const allDisciplines = Object.keys(FIELD_CONTENT_PROFILES)
  const searchTrimmed = search.trim()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[420px] bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-bold text-[16px] text-gray-900 dark:text-white">Edit community</h2>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
            onClick={onClose}
          >
            <span className="flex w-4 h-4"><Icon.X /></span>
          </button>
        </div>

        <div className="p-4 space-y-3">
          {initialLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Field selector — only shown when no discipline is pre-set */}
              {!postDiscipline && (
                <div>
                  <p className="text-[10.5px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-1.5">
                    Field
                  </p>
                  <select
                    value={discipline}
                    onChange={e => { setDiscipline(e.target.value); setSelected(null); setSearch('') }}
                    className="w-full px-3 py-2 text-[13px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none text-gray-900 dark:text-white"
                  >
                    <option value="">Select a field…</option>
                    {allDisciplines.map(d => (
                      <option key={d} value={d}>{getProfMeta(d)?.label ?? d}</option>
                    ))}
                  </select>
                </div>
              )}

              {discipline && (
                <>
                  {/* Search */}
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 flex w-3 h-3 text-gray-400 pointer-events-none">
                      <Icon.Search />
                    </span>
                    <input
                      autoFocus
                      className="w-full pl-8 pr-3 py-2 text-[12.5px] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg outline-none placeholder:text-gray-400 text-gray-900 dark:text-white"
                      placeholder={`Search ${getProfMeta(discipline)?.label ?? discipline} communities…`}
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                  </div>

                  {/* List */}
                  {groupsLoading ? (
                    <div className="flex justify-center py-3">
                      <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="max-h-52 overflow-y-auto flex flex-col gap-0.5">
                      {/* "No community" option */}
                      <button
                        onClick={() => setSelected(null)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] transition-colors ${
                          !selected
                            ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        <span className="flex-1 italic">No community (portfolio only)</span>
                        {!selected && (
                          <span className="flex w-3.5 h-3.5 text-amber-600 shrink-0"><Icon.CheckCircle /></span>
                        )}
                      </button>

                      {filtered.map(g => {
                        const isSel = selected?.id === g.id
                        return (
                          <button
                            key={g.id}
                            onClick={() => setSelected(isSel ? null : g)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-left text-[13px] transition-colors ${
                              isSel
                                ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200'
                            }`}
                          >
                            <span className="flex-1 font-medium truncate">{g.name}</span>
                            {isSel && (
                              <span className="flex w-3.5 h-3.5 text-amber-600 shrink-0"><Icon.CheckCircle /></span>
                            )}
                          </button>
                        )
                      })}

                      {/* No results message */}
                      {filtered.length === 0 && searchTrimmed.length >= 2 && (
                        <div className="px-3 py-2 text-[12.5px] text-gray-400 italic">No results found</div>
                      )}

                      {/* Persistent create option */}
                      <button
                        onClick={handleCreate}
                        disabled={creating || searchTrimmed.length < 2}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-left text-[13px] text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors font-medium disabled:opacity-40"
                      >
                        <span className="flex w-3.5 h-3.5 shrink-0"><Icon.Plus /></span>
                        {creating
                          ? 'Creating…'
                          : searchTrimmed.length >= 2
                            ? `Create "${searchTrimmed}"`
                            : 'New community'
                        }
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 pb-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-full text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !discipline}
            className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full text-[13px] font-semibold flex items-center gap-2 transition-colors"
          >
            {saving
              ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Saving…</>
              : 'Save'
            }
          </button>
        </div>
      </div>
    </div>
  )
}
