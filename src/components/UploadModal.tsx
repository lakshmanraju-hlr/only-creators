import { useState, useRef, useEffect } from 'react'
import { supabase, ContentType, Group, Profile, DisciplinePersona, getProfMeta } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import { suggestGroup } from '@/lib/groupCategorization'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

interface Props { onClose: () => void; defaultGroup?: Group; defaultDiscipline?: string }

const CONTENT_TYPES: { type: ContentType; icon: React.ReactNode; label: string; accept?: string }[] = [
  { type: 'text',     icon: <Icon.PenLine />,  label: 'Text' },
  { type: 'photo',    icon: <Icon.Camera />,   label: 'Photo',    accept: 'image/*' },
  { type: 'audio',    icon: <Icon.Music />,    label: 'Audio',    accept: 'audio/*' },
  { type: 'video',    icon: <Icon.Video />,    label: 'Video',    accept: 'video/*' },
  { type: 'document', icon: <Icon.FileText />, label: 'Doc',      accept: '.pdf,.doc,.docx' },
  { type: 'poem',     icon: <Icon.PenLine />,  label: 'Poem' },
]

export default function UploadModal({ onClose, defaultGroup, defaultDiscipline }: Props) {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // If a discipline is pre-selected, open in Pro mode
  const [postType, setPostType] = useState<'general' | 'pro'>(defaultDiscipline ? 'pro' : 'general')
  const [personas, setPersonas] = useState<DisciplinePersona[]>([])
  const [selectedPersona, setSelectedPersona] = useState<DisciplinePersona | null>(null)
  // For when posting from a discipline page — may not have a persona yet
  const [overrideDiscipline] = useState<string | null>(defaultDiscipline ?? null)

  const [contentType, setContentType] = useState<ContentType>('text')
  const [caption, setCaption] = useState('')
  const [poemText, setPoemText] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [postVisibility, setPostVisibility] = useState<'public' | 'friends'>('public')

  const [availableGroups, setAvailableGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(defaultGroup ?? null)
  const [groupSuggestion, setGroupSuggestion] = useState<Group | null>(null)

  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<Profile[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionStart, setMentionStart] = useState(-1)

  const fileRef = useRef<HTMLInputElement>(null)
  const captionRef = useRef<HTMLTextAreaElement>(null)

  // Auto-focus textarea on open
  useEffect(() => { captionRef.current?.focus() }, [])

  // Load user's existing Pro personas
  useEffect(() => {
    if (!profile) return
    supabase.from('discipline_personas').select('*').eq('user_id', profile.id).order('post_count', { ascending: false })
      .then(({ data }) => {
        const list = (data || []) as DisciplinePersona[]
        setPersonas(list)
        if (overrideDiscipline) {
          // Pre-select the override discipline if a persona exists, otherwise it's a new one
          const match = list.find(p => p.discipline === overrideDiscipline)
          if (match) setSelectedPersona(match)
          // If no persona yet, selectedPersona stays null — submit will create it
        } else if (list.length > 0) {
          setSelectedPersona(list[0])
        }
      })
  }, [profile?.id])

  // Load groups for the selected Pro persona's discipline
  useEffect(() => {
    if (postType !== 'pro' || !selectedPersona) { setAvailableGroups([]); return }
    supabase.from('groups').select('*').eq('discipline', selectedPersona.discipline).order('post_count', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        const list = data as Group[]
        if (defaultGroup && !list.find(g => g.id === defaultGroup.id)) {
          setAvailableGroups([defaultGroup, ...list])
        } else {
          setAvailableGroups(list)
        }
      })
  }, [postType, selectedPersona?.discipline])

  // Clear groups when switching back to general
  useEffect(() => {
    if (postType === 'general' && !defaultGroup) {
      setAvailableGroups([])
      setSelectedGroup(null)
      setGroupSuggestion(null)
    }
  }, [postType])

  // Group suggestion
  useEffect(() => {
    if (defaultGroup || postType !== 'pro' || availableGroups.length === 0 || !selectedPersona) return
    const tagArray = tags.split(/[\s,]+/).filter(t => t.startsWith('#')).map(t => t.toLowerCase())
    const suggestion = suggestGroup(caption, tagArray, selectedPersona.discipline, availableGroups)
    setGroupSuggestion(suggestion)
    if (suggestion && !selectedGroup) setSelectedGroup(suggestion)
  }, [caption, tags, availableGroups, postType])

  // Mention autocomplete
  useEffect(() => {
    if (!mentionQuery || mentionStart === -1) { setMentionResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id,username,full_name,avatar_url').ilike('username', mentionQuery + '%').limit(5)
      setMentionResults((data || []) as Profile[])
    }, 180)
    return () => clearTimeout(t)
  }, [mentionQuery, mentionStart])

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
    const after = caption.slice(mentionStart + 1 + mentionQuery.length)
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

  function togglePro() {
    if (postType === 'pro') { setPostType('general'); return }
    setPostType('pro')
  }

  const currentCT = CONTENT_TYPES.find(c => c.type === contentType)!
  const needsFile = ['photo', 'audio', 'video', 'document'].includes(contentType)

  async function handleSubmit() {
    if (!profile) return
    if (needsFile && !file) return toast.error('Please select a file')
    if (contentType === 'poem' && !poemText.trim()) return toast.error('Please write your poem')
    if (!caption.trim() && contentType === 'text') return toast.error('Please write something')
    const effectiveDiscipline = selectedPersona?.discipline ?? overrideDiscipline
    if (postType === 'pro' && !effectiveDiscipline) return toast.error('Choose a discipline for your Pro post')

    setUploading(true); setProgress(10)
    let mediaUrl = '', mediaPath = ''
    if (file && needsFile) {
      const ext = file.name.split('.').pop()
      const path = `${profile.id}/${Date.now()}.${ext}`
      setProgress(30)
      const { error } = await supabase.storage.from('posts').upload(path, file, { cacheControl: '3600', upsert: false })
      if (error) { toast.error('Upload failed: ' + error.message); setUploading(false); return }
      setProgress(70)
      const { data } = supabase.storage.from('posts').getPublicUrl(path)
      mediaUrl = data.publicUrl; mediaPath = path
    }
    setProgress(85)

    // Auto-create persona record on first Pro post in a discipline
    if (postType === 'pro' && effectiveDiscipline) {
      await supabase.from('discipline_personas').upsert(
        { user_id: profile.id, discipline: effectiveDiscipline, level: 'newcomer' },
        { onConflict: 'user_id,discipline', ignoreDuplicates: true }
      )
    }

    const tagArray = tags.split(/[\s,]+/).filter(t => t.startsWith('#')).map(t => t.toLowerCase())
    const { error } = await supabase.from('posts').insert({
      user_id: profile.id,
      content_type: contentType,
      caption: caption.trim(),
      poem_text: poemText.trim(),
      media_url: mediaUrl,
      media_path: mediaPath,
      tags: tagArray,
      post_type: postType,
      is_pro_post: postType === 'pro',
      persona_discipline: postType === 'pro' ? effectiveDiscipline : null,
      visibility: postType === 'pro' ? 'public' : postVisibility,
      group_id: selectedGroup?.id ?? null,
    })
    setProgress(100)
    if (error) { toast.error('Failed to post: ' + error.message) }
    else { toast.success('Posted!'); onClose() }
    setUploading(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal upload-modal">
        <div className="modal-header">
          <div className="modal-title">New post</div>
          <button className="modal-close" onClick={onClose}><Icon.X /></button>
        </div>

        {/* ── Caption / text ─────────────────────────────────── */}
        <div style={{ position: 'relative' }}>
          {mentionResults.length > 0 && (
            <div className="mention-dropdown">
              {mentionResults.map((r, i) => (
                <button key={r.id} className={'mention-option ' + (i === mentionIndex ? 'active' : '')} onMouseDown={e => { e.preventDefault(); pickMention(r.username) }}>
                  <div className="post-avatar" style={{ width: 24, height: 24, fontSize: 8, flexShrink: 0 }}>
                    {r.avatar_url ? <img src={r.avatar_url} alt="" /> : r.full_name?.slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{r.full_name}</span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>@{r.username}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={captionRef}
            className="upload-caption"
            placeholder={contentType === 'poem' ? 'Add a caption…' : contentType === 'text' ? "What's on your mind?" : 'Add a caption…'}
            value={caption}
            onChange={handleCaptionChange}
            onKeyDown={handleCaptionKey}
          />
        </div>

        {/* ── Poem editor ───────────────────────────────────── */}
        {contentType === 'poem' && (
          <textarea className="poem-editor" placeholder={'Let the words flow…\n\nEach line, a brushstroke\nOn the canvas of silence'} value={poemText} onChange={e => setPoemText(e.target.value)} />
        )}

        {/* ── File upload zone ──────────────────────────────── */}
        {needsFile && (
          <div>
            <div className="upload-zone" onClick={() => fileRef.current?.click()}>
              {filePreview
                ? <img src={filePreview} alt="" style={{ maxHeight: 160, borderRadius: 'var(--r-md)', margin: '0 auto' }} />
                : <>
                  <div className="upload-zone-icon"><span style={{ display: 'flex', width: 20, height: 20, color: 'var(--color-primary)' }}>{currentCT.icon}</span></div>
                  <div className="upload-zone-text">{file ? file.name : 'Click to browse or drag & drop'}</div>
                  <div className="upload-zone-sub">
                    {contentType === 'photo' && 'JPG, PNG, GIF, WebP'}
                    {contentType === 'audio' && 'MP3, WAV, OGG'}
                    {contentType === 'video' && 'MP4, MOV — max 500MB'}
                    {contentType === 'document' && 'PDF, DOC, DOCX'}
                  </div>
                </>}
            </div>
            <input ref={fileRef} type="file" accept={currentCT.accept} style={{ display: 'none' }} onChange={handleFileChange} />
            {file && <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 8 }}>Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</div>}
          </div>
        )}

        {/* ── Content type icon row ─────────────────────────── */}
        <div className="upload-ct-row">
          {CONTENT_TYPES.map(ct => (
            <button
              key={ct.type}
              className={`upload-ct-btn ${contentType === ct.type ? 'active' : ''}`}
              onClick={() => { setContentType(ct.type); setFile(null); setFilePreview(null) }}
              title={ct.label}
            >
              <span style={{ display: 'flex', width: 16, height: 16 }}>{ct.icon}</span>
              <span>{ct.label}</span>
            </button>
          ))}
        </div>

        {/* ── Pro expansion (only when Pro mode active) ─────── */}
        {postType === 'pro' && (
          <div className="upload-pro-section">
            {personas.length === 0 && !overrideDiscipline ? (
              <div style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.5 }}>
                You haven't joined any discipline as a Pro yet.{' '}
                <button
                  className="btn btn-ghost btn-xs"
                  style={{ color: 'var(--color-primary)', padding: '0 2px', fontSize: 13, display: 'inline' }}
                  onClick={() => { onClose(); navigate('/explore') }}
                >
                  Browse disciplines →
                </button>
              </div>
            ) : overrideDiscipline && !selectedPersona ? (
              // First Pro post in this discipline — show it as pre-selected, no picker needed
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ display: 'flex', width: 13, height: 13, color: 'var(--color-pro)' }}><Icon.Award /></span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{getProfMeta(overrideDiscipline)?.label ?? overrideDiscipline}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-3)' }}>· This post establishes you as a Newcomer</span>
              </div>
            ) : (
              <>
                <div className="upload-pro-section-label">
                  <span style={{ display: 'flex', width: 13, height: 13, color: 'var(--color-pro)' }}><Icon.Award /></span>
                  Posting as
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {personas.map(p => {
                    const meta = getProfMeta(p.discipline)
                    return (
                      <button
                        key={p.id}
                        className={`upload-vis-btn ${selectedPersona?.id === p.id ? 'active' : ''}`}
                        onClick={() => { setSelectedPersona(p); setSelectedGroup(null); setGroupSuggestion(null) }}
                      >
                        {meta?.icon} {meta?.label ?? p.discipline}
                      </button>
                    )
                  })}
                </div>

                {availableGroups.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="upload-pro-section-label">
                      <span style={{ display: 'flex', width: 13, height: 13 }}><Icon.Friends /></span>
                      Community group
                      {groupSuggestion && selectedGroup?.id === groupSuggestion.id && (
                        <span style={{ fontSize: 10, color: 'var(--color-primary)', marginLeft: 6, fontWeight: 500 }}>suggested</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      <button className={`upload-vis-btn ${!selectedGroup ? 'active' : ''}`} onClick={() => setSelectedGroup(null)}>None</button>
                      {availableGroups.map(g => (
                        <button key={g.id} className={`upload-vis-btn ${selectedGroup?.id === g.id ? 'active' : ''}`} onClick={() => setSelectedGroup(g)}>
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Tags (subtle) ─────────────────────────────────── */}
        <input
          className="upload-tags-input"
          placeholder="#tag1  #tag2  #tag3"
          value={tags}
          onChange={e => setTags(e.target.value)}
        />

        {uploading && <div className="upload-progress" style={{ marginBottom: 10 }}><div className="upload-progress-fill" style={{ width: `${progress}%` }} /></div>}

        {/* ── Bottom action bar ─────────────────────────────── */}
        <div className="upload-action-bar">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {postType === 'general' && (
              <button
                className={`upload-chip ${postVisibility === 'friends' ? 'active' : ''}`}
                onClick={() => setPostVisibility(v => v === 'public' ? 'friends' : 'public')}
                title={postVisibility === 'public' ? 'Public — click to restrict to friends' : 'Friends only — click to make public'}
              >
                <span style={{ display: 'flex', width: 13, height: 13 }}>{postVisibility === 'friends' ? <Icon.Lock /> : <Icon.Globe />}</span>
                {postVisibility === 'friends' ? 'Friends' : 'Public'}
              </button>
            )}
            <button
              className={`upload-chip ${postType === 'pro' ? 'pro-active' : ''}`}
              onClick={togglePro}
              title={postType === 'pro' ? 'Pro Post — click to switch to general' : 'Make this a Pro Post for a specific discipline'}
            >
              <span style={{ display: 'flex', width: 13, height: 13 }}><Icon.Award /></span>
              Pro
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={uploading}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={uploading}>
              {uploading ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Posting…</> : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
