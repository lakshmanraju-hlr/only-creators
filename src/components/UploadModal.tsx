import { useState, useRef, useEffect } from 'react'
import { supabase, ContentType, Group, Profile, DisciplinePersona, getProfMeta } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import { suggestGroup } from '@/lib/groupCategorization'
import toast from 'react-hot-toast'

interface Props { onClose: () => void; defaultGroup?: Group }

const CONTENT_TYPES: { type: ContentType; icon: React.ReactNode; label: string; accept?: string }[] = [
  { type: 'text',     icon: <Icon.PenLine />,  label: 'Text' },
  { type: 'photo',    icon: <Icon.Camera />,   label: 'Photo',    accept: 'image/*' },
  { type: 'audio',    icon: <Icon.Music />,    label: 'Audio',    accept: 'audio/*' },
  { type: 'video',    icon: <Icon.Video />,    label: 'Video',    accept: 'video/*' },
  { type: 'document', icon: <Icon.FileText />, label: 'Document', accept: '.pdf,.doc,.docx' },
  { type: 'poem',     icon: <Icon.PenLine />,  label: 'Poem' },
]

export default function UploadModal({ onClose, defaultGroup }: Props) {
  const { profile, refreshProfile } = useAuth()

  const [postType, setPostType] = useState<'general' | 'pro'>('general')
  const [selectedPersona, setSelectedPersona] = useState<DisciplinePersona | null>(null)
  const [personas, setPersonas] = useState<DisciplinePersona[]>([])

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

  // Load user's active discipline personas
  useEffect(() => {
    if (!profile) return
    supabase.from('discipline_personas')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        const list = (data || []) as DisciplinePersona[]
        setPersonas(list)
        // If user has personas, default postType to 'pro' and pre-select primary
        if (list.length > 0 && !defaultGroup) {
          const primary = list.find(p => p.discipline === profile.profession) ?? list[0]
          setSelectedPersona(primary)
          setPostType('pro')
        }
      })
  }, [profile?.id])

  // Load groups for the selected persona's discipline (or profile profession)
  useEffect(() => {
    const discipline = selectedPersona?.discipline ?? profile?.profession
    if (!discipline) return
    supabase.from('groups').select('*').eq('discipline', discipline).order('post_count', { ascending: false })
      .then(({ data }) => {
        if (!data) return
        const list = data as Group[]
        if (defaultGroup && !list.find(g => g.id === defaultGroup.id)) {
          setAvailableGroups([defaultGroup, ...list])
        } else {
          setAvailableGroups(list)
        }
      })
  }, [selectedPersona?.discipline, profile?.profession])

  // Group suggestion (only when no defaultGroup)
  useEffect(() => {
    if (defaultGroup || availableGroups.length === 0 || !profile?.profession) return
    const tagArray = tags.split(/[\s,]+/).filter(t => t.startsWith('#')).map(t => t.toLowerCase())
    const suggestion = suggestGroup(caption, tagArray, profile.profession, availableGroups)
    setGroupSuggestion(suggestion)
    if (suggestion && !selectedGroup) setSelectedGroup(suggestion)
  }, [caption, tags, availableGroups])

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

  const currentCT = CONTENT_TYPES.find(c => c.type === contentType)!
  const needsFile = ['photo', 'audio', 'video', 'document'].includes(contentType)

  async function handleSubmit() {
    if (!profile) return
    if (needsFile && !file) return toast.error('Please select a file')
    if (contentType === 'poem' && !poemText.trim()) return toast.error('Please write your poem')
    if (!caption.trim() && contentType === 'text') return toast.error('Please write something')
    if (postType === 'pro' && !selectedPersona) return toast.error('Select a discipline persona for your Pro Post')

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
      persona_discipline: postType === 'pro' ? selectedPersona?.discipline ?? null : null,
      visibility: postType === 'pro' ? 'public' : postVisibility,
      group_id: selectedGroup?.id ?? null,
    })
    setProgress(100)
    if (error) { toast.error('Failed to post: ' + error.message) }
    else { toast.success('Post published!'); onClose() }
    setUploading(false)
  }

  const personaMeta = selectedPersona ? getProfMeta(selectedPersona.discipline) : null

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">New post</div>
          <button className="modal-close" onClick={onClose}><Icon.X /></button>
        </div>

        {/* ── Post type toggle ──────────────────────────────────── */}
        <div className="upload-post-type-row">
          <button
            className={`upload-post-type-btn ${postType === 'general' ? 'active' : ''}`}
            onClick={() => setPostType('general')}
          >
            <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.Globe /></span>
            General Post
          </button>
          <button
            className={`upload-post-type-btn ${postType === 'pro' ? 'active' : ''}`}
            onClick={() => {
              if (personas.length === 0) {
                toast('Add a discipline persona in your profile first to make Pro Posts', { icon: '💡' })
                return
              }
              setPostType('pro')
            }}
            title={personas.length === 0 ? 'Activate a discipline persona first' : undefined}
          >
            <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.Award /></span>
            Pro Post
            {personas.length === 0 && <span style={{ fontSize: 10, opacity: 0.6 }}> · unlock in profile</span>}
          </button>
        </div>

        {/* ── Post type explanation ─────────────────────────────── */}
        <div className="upload-post-type-hint">
          {postType === 'general'
            ? 'Visible to followers + general Explore. No discipline tag.'
            : 'Tagged to your discipline community. Surfaces in the discipline hub and earns Pro Upvotes from peers.'}
        </div>

        {/* ── Persona selector (pro only) ───────────────────────── */}
        {postType === 'pro' && personas.length > 0 && (
          <div className="upload-option-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="upload-option-label" style={{ width: '100%' }}>
              <span style={{ display: 'flex', width: 14, height: 14, color: 'var(--color-pro)' }}><Icon.Award /></span>
              Posting as
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%' }}>
              {personas.map(p => {
                const meta = getProfMeta(p.discipline)
                return (
                  <button
                    key={p.id}
                    className={`upload-vis-btn ${selectedPersona?.id === p.id ? 'active' : ''}`}
                    onClick={() => setSelectedPersona(p)}
                  >
                    {meta?.icon} {meta?.label ?? p.discipline}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Content type ─────────────────────────────────────── */}
        <div className="ct-grid">
          {CONTENT_TYPES.map(ct => (
            <button key={ct.type} className={`ct-btn ${contentType === ct.type ? 'active' : ''}`}
              onClick={() => { setContentType(ct.type); setFile(null); setFilePreview(null) }}>
              <span style={{ display: 'flex', width: 20, height: 20, margin: '0 auto 4px' }}>{ct.icon}</span>
              {ct.label}
            </button>
          ))}
        </div>

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
            {file && <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 10 }}>Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</div>}
          </div>
        )}

        {contentType === 'poem' && (
          <textarea className="poem-editor" placeholder={'Let the words flow…\n\nEach line, a brushstroke\nOn the canvas of silence'} value={poemText} onChange={e => setPoemText(e.target.value)} />
        )}

        <div className="field" style={{ position: 'relative' }}>
          <label className="field-label">{contentType === 'text' ? 'Your post *' : 'Caption'}</label>
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
            className="field-textarea"
            placeholder={contentType === 'text' ? 'Share something… use @ to tag creators' : 'Add a caption… use @ to tag creators'}
            value={caption}
            onChange={handleCaptionChange}
            onKeyDown={handleCaptionKey}
            style={{ minHeight: contentType === 'text' ? 90 : 64 }}
          />
        </div>

        <div className="field">
          <label className="field-label">Tags</label>
          <input className="field-input" placeholder="#photography  #portrait" value={tags} onChange={e => setTags(e.target.value)} />
        </div>

        {/* Visibility — only for general posts */}
        {postType === 'general' && (
          <div className="upload-option-row">
            <div className="upload-option-label">
              <span style={{ display: 'flex', width: 14, height: 14, color: 'var(--color-text-3)' }}>{postVisibility === 'friends' ? <Icon.Lock /> : <Icon.Globe />}</span>
              Who can see this?
            </div>
            <div className="upload-option-toggle">
              <button className={'upload-vis-btn ' + (postVisibility === 'public' ? 'active' : '')} onClick={() => setPostVisibility('public')}>Public</button>
              <button className={'upload-vis-btn ' + (postVisibility === 'friends' ? 'active' : '')} onClick={() => setPostVisibility('friends')}>Friends only</button>
            </div>
          </div>
        )}

        {/* Group selector — show when discipline/persona selected */}
        {availableGroups.length > 0 && (
          <div className="upload-option-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div className="upload-option-label" style={{ width: '100%' }}>
              <span style={{ display: 'flex', width: 14, height: 14, color: 'var(--color-text-3)' }}><Icon.Friends /></span>
              Community group
              {groupSuggestion && selectedGroup?.id === groupSuggestion.id && (
                <span style={{ fontSize: 10, color: 'var(--color-primary)', marginLeft: 6, fontWeight: 500 }}>suggested</span>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: '100%' }}>
              <button className={`upload-vis-btn ${!selectedGroup ? 'active' : ''}`} onClick={() => setSelectedGroup(null)}>None</button>
              {availableGroups.map(g => (
                <button key={g.id} className={`upload-vis-btn ${selectedGroup?.id === g.id ? 'active' : ''}`} onClick={() => setSelectedGroup(g)}>
                  {g.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {uploading && <div className="upload-progress" style={{ marginBottom: 12 }}><div className="upload-progress-fill" style={{ width: `${progress}%` }} /></div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={uploading}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSubmit} disabled={uploading}>
            {uploading ? <><span className="spinner" /> Uploading…</> : 'Publish post'}
          </button>
        </div>
      </div>
    </div>
  )
}
