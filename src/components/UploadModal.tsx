import { useState, useRef, useEffect, useMemo } from 'react'
import { uploadPhoto } from '@/utils/uploadPhoto'
import { supabase, ContentType, Group, Profile, DisciplinePersona, getProfMeta, FIELD_CONTENT_PROFILES } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import { suggestGroup } from '@/lib/groupCategorization'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

interface Props {
  onClose: () => void
  defaultGroup?: Group
  defaultDiscipline?: string
}

// Primary tabs shown at top of composer
const PRIMARY_TYPES: { type: ContentType; icon: React.ReactNode; label: string; accept?: string }[] = [
  { type: 'photo',    icon: <Icon.Camera />,   label: 'Image',  accept: 'image/*' },
  { type: 'video',    icon: <Icon.Video />,    label: 'Video',  accept: 'video/*' },
  { type: 'text',     icon: <Icon.PenLine />,  label: 'Text' },
]

const CONTENT_TYPES: { type: ContentType; icon: React.ReactNode; label: string; accept?: string }[] = [
  { type: 'text',     icon: <Icon.PenLine />,  label: 'Text' },
  { type: 'photo',    icon: <Icon.Camera />,   label: 'Photo',    accept: 'image/*' },
  { type: 'audio',    icon: <Icon.Music />,    label: 'Audio',    accept: 'audio/*' },
  { type: 'video',    icon: <Icon.Video />,    label: 'Video',    accept: 'video/*' },
  { type: 'document', icon: <Icon.FileText />, label: 'Doc',      accept: '.pdf,.doc,.docx' },
  { type: 'poem',     icon: <Icon.PenLine />,  label: 'Poem' },
]

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

export default function UploadModal({ onClose, defaultGroup, defaultDiscipline }: Props) {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // ── Content state ─────────────────────────────────────────────────────────
  const [contentType, setContentType]   = useState<ContentType>('text')
  const [caption, setCaption]           = useState('')
  const [poemText, setPoemText]         = useState('')
  const [tags, setTags]                 = useState('')
  const [file, setFile]                 = useState<File | null>(null)
  const [filePreview, setFilePreview]   = useState<string | null>(null)
  const [postVisibility, setPostVisibility] = useState<'public' | 'friends'>('public')
  const [uploading, setUploading]       = useState(false)
  const [progress, setProgress]         = useState(0)
  const [softPromptDismissed, setSoftPromptDismissed] = useState(false)

  // ── Field & post type state ───────────────────────────────────────────────
  // Post type always defaults to 'general' per spec
  const [postType, setPostType]         = useState<'general' | 'pro'>('general')
  const [personas, setPersonas]         = useState<DisciplinePersona[]>([])
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(defaultDiscipline ?? null)
  const [fieldOpen, setFieldOpen]       = useState(false)
  const [fieldSearch, setFieldSearch]   = useState('')
  const [originalWorkChecked, setOriginalWorkChecked] = useState(false)

  // ── Group state ───────────────────────────────────────────────────────────
  const [availableGroups, setAvailableGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup]     = useState<Group | null>(defaultGroup ?? null)
  const [groupSuggestion, setGroupSuggestion] = useState<Group | null>(null)

  // ── Mention autocomplete ──────────────────────────────────────────────────
  const [mentionQuery, setMentionQuery]   = useState('')
  const [mentionResults, setMentionResults] = useState<Profile[]>([])
  const [mentionIndex, setMentionIndex]   = useState(0)
  const [mentionStart, setMentionStart]   = useState(-1)

  const fileRef    = useRef<HTMLInputElement>(null)
  const captionRef = useRef<HTMLTextAreaElement>(null)
  const fieldSearchRef = useRef<HTMLInputElement>(null)

  // Auto-focus caption on open
  useEffect(() => { captionRef.current?.focus() }, [])

  // Clear checkbox when switching away from Pro
  useEffect(() => {
    if (postType === 'general') setOriginalWorkChecked(false)
  }, [postType])

  // ── Load user's personas ──────────────────────────────────────────────────
  useEffect(() => {
    if (!profile) return
    supabase.from('discipline_personas')
      .select('*').eq('user_id', profile.id).order('post_count', { ascending: false })
      .then(({ data }) => setPersonas((data || []) as DisciplinePersona[]))
  }, [profile?.id])

  // ── Available disciplines for dropdown ───────────────────────────────────
  const availableDisciplines = useMemo(() => {
    const fromPersonas = personas.map(p => p.discipline)
    if (defaultDiscipline && !fromPersonas.includes(defaultDiscipline)) {
      return [defaultDiscipline, ...fromPersonas]
    }
    return fromPersonas
  }, [personas, defaultDiscipline])

  const filteredDisciplines = fieldSearch.trim()
    ? availableDisciplines.filter(d => {
        const label = getProfMeta(d)?.label ?? d
        return label.toLowerCase().includes(fieldSearch.toLowerCase())
      })
    : availableDisciplines

  // ── Auto-select primary content type when switching to Pro ────────────────
  useEffect(() => {
    if (postType !== 'pro' || !selectedDiscipline) return
    const fieldProfile = FIELD_CONTENT_PROFILES[selectedDiscipline]
    if (!fieldProfile) return
    setContentType(fieldProfile.primary[0] as ContentType)
    setSoftPromptDismissed(false)
  }, [postType, selectedDiscipline])

  // ── Load groups for selected discipline ───────────────────────────────────
  useEffect(() => {
    if (!selectedDiscipline) { setAvailableGroups([]); return }
    supabase.from('groups')
      .select('*').eq('discipline', selectedDiscipline).order('post_count', { ascending: false })
      .then(({ data }) => {
        const list = (data || []) as Group[]
        if (defaultGroup && !list.find(g => g.id === defaultGroup.id)) {
          setAvailableGroups([defaultGroup, ...list])
        } else {
          setAvailableGroups(list)
        }
      })
  }, [selectedDiscipline])

  // Clear group when discipline changes (unless it's the defaultGroup)
  useEffect(() => {
    if (!defaultGroup) setSelectedGroup(null)
  }, [selectedDiscipline])

  // ── Group suggestion ──────────────────────────────────────────────────────
  useEffect(() => {
    if (defaultGroup || availableGroups.length === 0 || !selectedDiscipline) return
    const tagArray = tags.split(/[\s,]+/).filter(t => t.startsWith('#')).map(t => t.toLowerCase())
    const suggestion = suggestGroup(caption, tagArray, selectedDiscipline, availableGroups)
    setGroupSuggestion(suggestion)
    if (suggestion && !selectedGroup) setSelectedGroup(suggestion)
  }, [caption, tags, availableGroups, selectedDiscipline])

  // ── Mention autocomplete ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mentionQuery || mentionStart === -1) { setMentionResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles').select('id,username,full_name,avatar_url')
        .ilike('username', mentionQuery + '%').limit(5)
      setMentionResults((data || []) as Profile[])
    }, 180)
    return () => clearTimeout(t)
  }, [mentionQuery, mentionStart])

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleCaptionChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setCaption(val)
    const cursor = e.target.selectionStart ?? val.length
    const before = val.slice(0, cursor)
    const atIdx = before.lastIndexOf('@')
    if (atIdx !== -1) {
      const afterAt = before.slice(atIdx + 1)
      if (!afterAt.includes(' ') && afterAt.length <= 20) {
        setMentionStart(atIdx); setMentionQuery(afterAt); setMentionIndex(0); return
      }
    }
    setMentionStart(-1); setMentionQuery(''); setMentionResults([])
  }

  function handleCaptionKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionResults.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionResults.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionResults[mentionIndex].username) }
    else if (e.key === 'Escape') setMentionResults([])
  }

  function pickMention(username: string) {
    const before = caption.slice(0, mentionStart)
    const after  = caption.slice(mentionStart + 1 + mentionQuery.length)
    setCaption(before + '@' + username + ' ' + after)
    setMentionStart(-1); setMentionQuery(''); setMentionResults([])
    captionRef.current?.focus()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setFile(f)
    if (f.type.startsWith('image/')) setFilePreview(URL.createObjectURL(f))
    else setFilePreview(null)
  }

  function pickDiscipline(d: string) {
    setSelectedDiscipline(d)
    setFieldOpen(false)
    setFieldSearch('')
  }

  // ── Share eligibility ─────────────────────────────────────────────────────
  // Field required for both types; Pro also requires the checkbox
  const canShare = selectedDiscipline !== null &&
    (postType === 'general' || originalWorkChecked)

  // ── Submit ────────────────────────────────────────────────────────────────
  const currentCT  = CONTENT_TYPES.find(c => c.type === contentType)!
  const needsFile  = ['photo', 'audio', 'video', 'document'].includes(contentType)

  async function handleSubmit() {
    if (!profile) return
    if (needsFile && !file) return toast.error('Please select a file')
    if (contentType === 'poem' && !poemText.trim()) return toast.error('Please write your poem')
    if (!caption.trim() && contentType === 'text') return toast.error('Please write something')
    if (!selectedDiscipline) return toast.error('Please select a Field')
    if (postType === 'pro' && !originalWorkChecked) return toast.error('Please confirm this is your original work')

    setUploading(true); setProgress(10)
    let mediaUrl = '', mediaPath = '', thumbUrl = '', displayUrl = ''

    if (file && needsFile) {
      const fileName = `${profile.id}/${Date.now()}`
      setProgress(30)
      try {
        const urls = await uploadPhoto(file, 'posts', fileName)
        thumbUrl   = urls.thumbUrl
        displayUrl = urls.displayUrl
        mediaUrl   = displayUrl
        mediaPath  = fileName
      } catch (err: any) {
        toast.error(err.message ?? 'Upload failed')
        setUploading(false)
        return
      }
      setProgress(70)
    }
    setProgress(85)

    // Auto-create persona on first Pro post in a discipline
    if (postType === 'pro') {
      await supabase.from('discipline_personas').upsert(
        { user_id: profile.id, discipline: selectedDiscipline, level: 'newcomer' },
        { onConflict: 'user_id,discipline', ignoreDuplicates: true }
      )
    }

    const tagArray   = tags.split(/[\s,]+/).filter(t => t.startsWith('#')).map(t => t.toLowerCase())
    const expiresAt  = postType === 'general'
      ? new Date(Date.now() + TWENTY_FOUR_HOURS).toISOString()
      : null

    const { error } = await supabase.from('posts').insert({
      user_id:            profile.id,
      content_type:       contentType,
      caption:            caption.trim(),
      poem_text:          poemText.trim(),
      media_url:          mediaUrl,
      media_path:         mediaPath,
      thumb_url:          thumbUrl,
      display_url:        displayUrl,
      tags:               tagArray,
      post_type:          postType,
      is_pro_post:        postType === 'pro',
      persona_discipline: selectedDiscipline,
      visibility:         postType === 'pro' ? 'public' : postVisibility,
      group_id:           selectedGroup?.id ?? null,
      expires_at:         expiresAt,
    })

    setProgress(100)

    if (error) {
      toast.error('Failed to post: ' + error.message)
    } else {
      const fieldLabel = getProfMeta(selectedDiscipline)?.label ?? selectedDiscipline
      if (postType === 'pro') {
        toast.success(`Pro Post published to your ${fieldLabel} portfolio`)
      } else {
        toast.success('Posted')
      }
      window.dispatchEvent(new CustomEvent('oc:post-created'))
      onClose()
    }
    setUploading(false)
  }

  // ── Style helpers ─────────────────────────────────────────────────────────
  const chipBase     = 'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border'
  const chipInactive = `${chipBase} border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800`
  const chipActive   = `${chipBase} border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-600/10 text-brand-600 dark:text-brand-400`
  const visBtn = (active: boolean) =>
    `px-3 py-1 rounded-full text-[12px] font-medium transition-colors border ${
      active
        ? 'border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-600/10 text-brand-600 dark:text-brand-400'
        : 'border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-700'
    }`

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-[540px] bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 overflow-hidden max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <h2 className="font-bold text-[18px] text-gray-900 dark:text-white tracking-tight">New post</h2>
          <button
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
            onClick={onClose}
          >
            <span className="flex w-4 h-4"><Icon.X /></span>
          </button>
        </div>

        {/* ── Content type tabs ── */}
        <div className="flex gap-2 px-5 pb-4 shrink-0">
          {PRIMARY_TYPES.map(pt => (
            <button
              key={pt.type}
              onClick={() => { setContentType(pt.type); setFile(null); setFilePreview(null) }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[14px] font-semibold transition-all border ${
                contentType === pt.type
                  ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              <span className="flex w-[16px] h-[16px]">{pt.icon}</span>
              {pt.label}
            </button>
          ))}
        </div>

        <div className="h-px bg-gray-100 dark:bg-gray-800 shrink-0" />

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

          {/* Caption / text */}
          <div className="relative">
            {mentionResults.length > 0 && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden z-10">
                {mentionResults.map((r, i) => (
                  <button
                    key={r.id}
                    className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left transition-colors ${i === mentionIndex ? 'bg-brand-50 dark:bg-brand-600/10' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                    onMouseDown={e => { e.preventDefault(); pickMention(r.username) }}
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[8px] font-semibold text-blue-700 dark:text-blue-300 shrink-0">
                      {r.avatar_url
                        ? <img src={r.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        : r.full_name?.slice(0, 2).toUpperCase()
                      }
                    </div>
                    <span className="font-medium text-[13px] text-gray-900 dark:text-white">{r.full_name}</span>
                    <span className="text-[12px] text-gray-400">@{r.username}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={captionRef}
              className="w-full bg-transparent outline-none resize-none text-[14px] text-gray-900 dark:text-white placeholder:text-gray-400 min-h-[80px]"
              placeholder={contentType === 'text' ? "What's on your mind?" : 'Add a caption…'}
              value={caption}
              onChange={handleCaptionChange}
              onKeyDown={handleCaptionKey}
            />
          </div>

          {/* Poem editor */}
          {contentType === 'poem' && (
            <textarea
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 outline-none resize-none text-[14px] text-gray-900 dark:text-white placeholder:text-gray-400 font-serif min-h-[120px]"
              placeholder={'Let the words flow…\n\nEach line, a brushstroke\nOn the canvas of silence'}
              value={poemText}
              onChange={e => setPoemText(e.target.value)}
            />
          )}

          {/* File upload zone */}
          {needsFile && (
            <div>
              <div
                className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-6 text-center cursor-pointer hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {filePreview
                  ? <img src={filePreview} alt="" className="max-h-[160px] rounded-lg mx-auto" loading="lazy" decoding="async" />
                  : <>
                    <span className="flex w-5 h-5 text-brand-600 mx-auto mb-2">{currentCT.icon}</span>
                    <p className="text-[13px] font-medium text-gray-600 dark:text-gray-300">
                      {file ? file.name : 'Click to browse or drag & drop'}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {contentType === 'photo' && 'JPG, PNG, GIF, WebP'}
                      {contentType === 'audio' && 'MP3, WAV, OGG'}
                      {contentType === 'video' && 'MP4, MOV — max 500MB'}
                      {contentType === 'document' && 'PDF, DOC, DOCX'}
                    </p>
                  </>
                }
              </div>
              <input ref={fileRef} type="file" accept={currentCT.accept} className="hidden" onChange={handleFileChange} />
              {file && (
                <p className="text-[12px] text-gray-400 mt-1.5">
                  Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
                </p>
              )}
            </div>
          )}

          {/* Soft prompt for off-profile content types */}
          {postType === 'pro' && !softPromptDismissed && (() => {
            if (!selectedDiscipline) return null
            const fieldProfile = FIELD_CONTENT_PROFILES[selectedDiscipline]
            if (!fieldProfile || fieldProfile.primary.includes(contentType)) return null
            return (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-xl text-[12.5px] text-amber-700 dark:text-amber-400 leading-snug">
                <span className="shrink-0 mt-px">💡</span>
                <span className="flex-1">{fieldProfile.hint}</span>
                <button onClick={() => setSoftPromptDismissed(true)} className="text-amber-400 text-[16px] leading-none shrink-0">×</button>
              </div>
            )
          })()}

          {/* Extra content type chips (audio, poem, doc) */}
          {!['photo', 'video', 'text'].includes(contentType) && (
            <div className="flex gap-1.5 flex-wrap">
              {CONTENT_TYPES.filter(ct => !['photo', 'video', 'text'].includes(ct.type)).map(ct => (
                <button
                  key={ct.type}
                  onClick={() => { setContentType(ct.type); setFile(null); setFilePreview(null) }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors border ${
                    contentType === ct.type
                      ? 'border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-600/10 text-brand-600 dark:text-brand-400'
                      : 'border-gray-100 dark:border-gray-800 text-gray-500 dark:text-gray-400 hover:border-gray-200 dark:hover:border-gray-700'
                  }`}
                >
                  <span className="flex w-3.5 h-3.5">{ct.icon}</span>
                  {ct.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Field, Group & Post Type section ── */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-visible">

            {/* Field selector */}
            <div className="p-3.5 border-b border-gray-100 dark:border-gray-800">
              <p className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
                Field <span className="text-red-400">*</span>
              </p>

              {availableDisciplines.length === 0 ? (
                <div className="text-[13px] text-gray-500 dark:text-gray-400 leading-snug">
                  You haven't joined any Fields yet.{' '}
                  <button
                    className="text-brand-600 dark:text-brand-400 font-medium hover:underline"
                    onClick={() => { onClose(); navigate('/explore') }}
                  >
                    Go to Explore
                  </button>{' '}
                  to join your first Field.
                </div>
              ) : (
                <div className="relative">
                  <button
                    onClick={() => { setFieldOpen(v => !v); setTimeout(() => fieldSearchRef.current?.focus(), 50) }}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-[13.5px] font-medium transition-colors ${
                      selectedDiscipline
                        ? 'border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300'
                        : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {selectedDiscipline ? (
                        <>
                          <span className="text-[15px]">{getProfMeta(selectedDiscipline)?.icon ?? '✦'}</span>
                          <span>{getProfMeta(selectedDiscipline)?.label ?? selectedDiscipline}</span>
                        </>
                      ) : (
                        'Select a Field…'
                      )}
                    </span>
                    <span className={`flex w-4 h-4 transition-transform ${fieldOpen ? 'rotate-180' : ''}`}>
                      <Icon.ChevronDown />
                    </span>
                  </button>

                  {fieldOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-30 overflow-hidden">
                      {/* Search input */}
                      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
                        <span className="flex w-3.5 h-3.5 text-gray-400 shrink-0"><Icon.Search /></span>
                        <input
                          ref={fieldSearchRef}
                          className="flex-1 text-[13px] bg-transparent outline-none placeholder:text-gray-400 text-gray-900 dark:text-white"
                          placeholder="Search fields…"
                          value={fieldSearch}
                          onChange={e => setFieldSearch(e.target.value)}
                        />
                      </div>
                      {/* Options list */}
                      <div className="max-h-44 overflow-y-auto">
                        {filteredDisciplines.length === 0 ? (
                          <div className="px-4 py-4 text-center text-[13px] text-gray-400">No fields found</div>
                        ) : filteredDisciplines.map(d => {
                          const meta = getProfMeta(d)
                          const isSelected = selectedDiscipline === d
                          const isNew = !personas.some(p => p.discipline === d)
                          return (
                            <button
                              key={d}
                              onClick={() => pickDiscipline(d)}
                              className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-[13.5px] transition-colors ${
                                isSelected
                                  ? 'bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200'
                              }`}
                            >
                              <span className="text-[16px]">{meta?.icon ?? '✦'}</span>
                              <span className="flex-1">{meta?.label ?? d}</span>
                              {isNew && (
                                <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">new</span>
                              )}
                              {isSelected && (
                                <span className="flex w-3.5 h-3.5 text-brand-600"><Icon.CheckCircle /></span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Group selector (shown when groups exist for the selected field) */}
            {availableGroups.length > 0 && (
              <div className="p-3.5 border-b border-gray-100 dark:border-gray-800">
                <p className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">
                  Group <span className="text-[10px] font-normal normal-case tracking-normal text-gray-400">(optional)</span>
                  {groupSuggestion && selectedGroup?.id === groupSuggestion.id && (
                    <span className="text-brand-600 dark:text-brand-400 font-medium normal-case tracking-normal ml-1.5">suggested</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button className={visBtn(!selectedGroup)} onClick={() => setSelectedGroup(null)}>None</button>
                  {availableGroups.map(g => (
                    <button key={g.id} className={visBtn(selectedGroup?.id === g.id)} onClick={() => setSelectedGroup(g)}>
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Post type toggle */}
            <div className="p-3.5">
              <p className="text-[10.5px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2.5">Post type</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPostType('general')}
                  className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold border transition-all ${
                    postType === 'general'
                      ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  General Post
                </button>
                <button
                  onClick={() => setPostType('pro')}
                  className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold border transition-all ${
                    postType === 'pro'
                      ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  Pro Post ✦
                </button>
              </div>

              {/* Pro Post info banner */}
              {postType === 'pro' && (
                <div className="mt-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-[12.5px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  <span className="font-semibold">Pro Posts are permanent</span> and represent your professional work in this Field. They are eligible for Pro Votes from Experts and Authorities.
                </div>
              )}

              {/* Original work checkbox — required for Pro Posts */}
              {postType === 'pro' && (
                <label className="flex items-start gap-2.5 mt-3.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={originalWorkChecked}
                    onChange={e => setOriginalWorkChecked(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded accent-brand-600 cursor-pointer shrink-0"
                  />
                  <span className="text-[13px] text-gray-700 dark:text-gray-200 leading-snug">
                    This is my original work
                  </span>
                </label>
              )}
            </div>
          </div>

          {/* Tags */}
          <input
            className="w-full bg-transparent outline-none text-[12.5px] text-gray-500 dark:text-gray-400 placeholder:text-gray-300 dark:placeholder:text-gray-600 border-t border-gray-100 dark:border-gray-800 pt-3"
            placeholder="#tag1  #tag2  #tag3"
            value={tags}
            onChange={e => setTags(e.target.value)}
          />

          {/* Upload progress */}
          {uploading && (
            <div className="h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-600 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>

        {/* ── Action bar ── */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            {postType === 'general' && (
              <button
                onClick={() => setPostVisibility(v => v === 'public' ? 'friends' : 'public')}
                className={postVisibility === 'friends' ? chipActive : chipInactive}
                title={postVisibility === 'public' ? 'Public — click to restrict to friends' : 'Friends only — click to make public'}
              >
                <span className="flex w-3 h-3">{postVisibility === 'friends' ? <Icon.Lock /> : <Icon.Globe />}</span>
                {postVisibility === 'friends' ? 'Friends' : 'Public'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-full text-[13px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-full text-[13px] font-semibold flex items-center gap-2 transition-colors"
              onClick={handleSubmit}
              disabled={uploading || !canShare}
              title={
                !selectedDiscipline
                  ? 'Select a Field to post'
                  : postType === 'pro' && !originalWorkChecked
                  ? 'Confirm this is your original work'
                  : undefined
              }
            >
              {uploading
                ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Posting…</>
                : 'Share'
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
