import { useState, useRef, useEffect } from 'react'
import { supabase, ContentType, Group, Profile, PROFESSIONS, Profession, DISCIPLINE_ALIASES, getProfMeta } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import { suggestGroup } from '@/lib/groupCategorization'
import toast from 'react-hot-toast'

interface Props { onClose: () => void }

const ALL_PROFESSIONS = Object.entries(PROFESSIONS) as [Profession, typeof PROFESSIONS[Profession]][]

const CONTENT_TYPES: { type: ContentType; icon: React.ReactNode; label: string; accept?: string }[] = [
  { type: 'text',     icon: <Icon.PenLine />,   label: 'Text' },
  { type: 'photo',    icon: <Icon.Camera />,    label: 'Photo',    accept: 'image/*' },
  { type: 'audio',    icon: <Icon.Music />,     label: 'Audio',    accept: 'audio/*' },
  { type: 'video',    icon: <Icon.Video />,     label: 'Video',    accept: 'video/*' },
  { type: 'document', icon: <Icon.FileText />,  label: 'Document', accept: '.pdf,.doc,.docx' },
  { type: 'poem',     icon: <Icon.PenLine />,   label: 'Poem' },
]

// ── First-post profession capture ──────────────────────────────────────────
function findSimilarPredefined(query: string): [Profession, typeof PROFESSIONS[Profession]][] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  const aliasCanonical = DISCIPLINE_ALIASES[q]
  return ALL_PROFESSIONS.filter(([key, val]) =>
    key === aliasCanonical ||
    val.label.toLowerCase().includes(q) ||
    q.includes(val.label.toLowerCase().split(' ')[0]) ||
    key.replace(/-/g, ' ').includes(q)
  )
}

interface ProfStepProps {
  onConfirm: (profession: string) => void
  onSkip: () => void
}

function ProfessionStep({ onConfirm, onSkip }: ProfStepProps) {
  const [search, setSearch] = useState('')
  const [customConfirmed, setCustomConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const searchTrimmed = search.trim()

  const suggestions = ALL_PROFESSIONS.filter(([key, val]) =>
    searchTrimmed === '' ||
    val.label.toLowerCase().includes(searchTrimmed.toLowerCase()) ||
    key.toLowerCase().includes(searchTrimmed.toLowerCase())
  )

  const hasExactMatch = ALL_PROFESSIONS.some(([, val]) =>
    val.label.toLowerCase() === searchTrimmed.toLowerCase()
  )

  const similar = findSimilarPredefined(searchTrimmed)
  const showOther = searchTrimmed.length >= 2 && !hasExactMatch
  const showSimilar = showOther && similar.length > 0 && !customConfirmed

  function selectPredefined(key: Profession) {
    onConfirm(key)
  }

  function confirmCustom() {
    onConfirm(searchTrimmed)
  }

  return (
    <div style={{ padding:'4px 0' }}>
      <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>Before your first post…</div>
      <div style={{ fontSize:13, color:'var(--color-text-3)', marginBottom:16, lineHeight:1.6 }}>
        What do you do? We'll try to match you to the right discipline so peers can upvote your work.
      </div>

      <div className="field" style={{ marginBottom:0 }}>
        <label className="field-label">Your profession or role</label>
        <input
          className="field-input"
          placeholder="e.g. photographer, doctor, chef…"
          value={search}
          onChange={e => { setSearch(e.target.value); setCustomConfirmed(false) }}
          autoFocus
          autoComplete="off"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="prof-suggestions" style={{ marginTop:10 }}>
          {suggestions.map(([key, val]) => (
            <button key={key} type="button" className="prof-suggestion-pill" onClick={() => selectPredefined(key)}>
              {val.icon} {val.label}
            </button>
          ))}
        </div>
      )}

      {showOther && showSimilar && (
        <div className="prof-similar-warning" style={{ marginTop:10 }}>
          <div className="prof-similar-warning-title">Did you mean one of these?</div>
          <div className="prof-suggestions" style={{ marginTop:6 }}>
            {similar.map(([key, val]) => (
              <button key={key} type="button" className="prof-suggestion-pill" onClick={() => selectPredefined(key)}>
                {val.icon} {val.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:12, color:'var(--color-text-3)' }}>Not listed?</span>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCustomConfirmed(true)}>
              Add "{searchTrimmed}" anyway
            </button>
          </div>
        </div>
      )}

      {showOther && !showSimilar && (
        <div className="prof-other-section" style={{ marginTop:10 }}>
          <button type="button" className="prof-other-btn" onClick={confirmCustom}>
            <span style={{ display:'flex', width:12, height:12 }}><Icon.Plus /></span>
            Use "{searchTrimmed}" as my discipline
          </button>
        </div>
      )}

      <div style={{ display:'flex', gap:10, marginTop:20 }}>
        <button className="btn btn-ghost" style={{ flex:1 }} onClick={onSkip}>Skip for now</button>
      </div>
    </div>
  )
}
// ──────────────────────────────────────────────────────────────────────────

export default function UploadModal({ onClose }: Props) {
  const { profile, refreshProfile } = useAuth()

  // First-post profession capture
  const needsProfSetup = !profile?.profession
  const [profSetupDone, setProfSetupDone] = useState(!needsProfSetup)

  const [contentType, setContentType] = useState<ContentType>('text')
  const [caption, setCaption] = useState('')
  const [poemText, setPoemText] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [isProPost, setIsProPost] = useState(false)
  const [postVisibility, setPostVisibility] = useState<'public' | 'friends'>('public')
  const [availableGroups, setAvailableGroups] = useState<Group[]>([])
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  const [groupSuggestion, setGroupSuggestion] = useState<Group | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionResults, setMentionResults] = useState<Profile[]>([])
  const [mentionIndex, setMentionIndex] = useState(0)
  const [mentionStart, setMentionStart] = useState(-1)
  const fileRef = useRef<HTMLInputElement>(null)
  const captionRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!profile?.profession) return
    supabase.from('groups').select('*').eq('discipline', profile.profession).order('post_count', { ascending: false })
      .then(({ data }) => { if (data) setAvailableGroups(data as Group[]) })
  }, [profile?.profession])

  useEffect(() => {
    if (!profile?.profession || availableGroups.length === 0) return
    const tagArray = tags.split(/[\s,]+/).filter(t => t.startsWith('#')).map(t => t.toLowerCase())
    const suggestion = suggestGroup(caption, tagArray, profile.profession, availableGroups)
    setGroupSuggestion(suggestion)
    if (suggestion && !selectedGroup) setSelectedGroup(suggestion)
  }, [caption, tags, availableGroups])

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

  async function handleProfessionConfirm(profession: string) {
    if (!profile) return
    const isPredefined = ALL_PROFESSIONS.some(([key]) => key === profession)
    await supabase.from('profiles').update({
      profession: isPredefined ? profession as Profession : profession,
      professions: [profession],
      is_pro: true,
    }).eq('id', profile.id)
    await refreshProfile()
    setProfSetupDone(true)
    toast.success('Discipline saved!')
  }

  const currentCT = CONTENT_TYPES.find(c => c.type === contentType)!
  const needsFile = ['photo','audio','video','document'].includes(contentType)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setFile(f)
    if (f.type.startsWith('image/')) setFilePreview(URL.createObjectURL(f))
    else setFilePreview(null)
  }

  async function handleSubmit() {
    if (!profile) return
    if (needsFile && !file) return toast.error('Please select a file')
    if (contentType === 'poem' && !poemText.trim()) return toast.error('Please write your poem')
    if (!caption.trim() && contentType === 'text') return toast.error('Please write something')
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
    const { error } = await supabase.from('posts').insert({ user_id: profile.id, content_type: contentType, caption: caption.trim(), poem_text: poemText.trim(), media_url: mediaUrl, media_path: mediaPath, tags: tagArray, is_pro_post: isProPost, visibility: isProPost ? 'public' : postVisibility, group_id: selectedGroup?.id ?? null })
    setProgress(100)
    if (error) { toast.error('Failed to post: ' + error.message) }
    else { toast.success('Post published!'); onClose() }
    setUploading(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">{!profSetupDone ? 'Set up your profile' : 'New post'}</div>
          <button className="modal-close" onClick={onClose}><Icon.X /></button>
        </div>

        {/* First-post profession capture */}
        {!profSetupDone ? (
          <ProfessionStep
            onConfirm={handleProfessionConfirm}
            onSkip={() => setProfSetupDone(true)}
          />
        ) : (
          <>
            <div className="ct-grid">
              {CONTENT_TYPES.map(ct => (
                <button key={ct.type} className={`ct-btn ${contentType === ct.type ? 'active' : ''}`}
                  onClick={() => { setContentType(ct.type); setFile(null); setFilePreview(null) }}>
                  <span style={{ display:'flex', width:20, height:20, margin:'0 auto 4px' }}>{ct.icon}</span>
                  {ct.label}
                </button>
              ))}
            </div>

            {needsFile && (
              <div>
                <div className="upload-zone" onClick={() => fileRef.current?.click()}>
                  {filePreview
                    ? <img src={filePreview} alt="" style={{ maxHeight:160, borderRadius:'var(--r-md)', margin:'0 auto' }} />
                    : <>
                      <div className="upload-zone-icon"><span style={{ display:'flex', width:20, height:20, color:'var(--color-primary)' }}>{currentCT.icon}</span></div>
                      <div className="upload-zone-text">{file ? file.name : 'Click to browse or drag & drop'}</div>
                      <div className="upload-zone-sub">
                        {contentType === 'photo' && 'JPG, PNG, GIF, WebP'}
                        {contentType === 'audio' && 'MP3, WAV, OGG'}
                        {contentType === 'video' && 'MP4, MOV — max 500MB'}
                        {contentType === 'document' && 'PDF, DOC, DOCX'}
                      </div>
                    </>}
                </div>
                <input ref={fileRef} type="file" accept={currentCT.accept} style={{ display:'none' }} onChange={handleFileChange} />
                {file && <div style={{ fontSize:12, color:'var(--color-text-3)', marginBottom:10 }}>Selected: {file.name} ({(file.size/1024/1024).toFixed(1)} MB)</div>}
              </div>
            )}

            {contentType === 'poem' && (
              <textarea className="poem-editor" placeholder={'Let the words flow…\n\nEach line, a brushstroke\nOn the canvas of silence'} value={poemText} onChange={e => setPoemText(e.target.value)} />
            )}

            <div className="field" style={{ position:'relative' }}>
              <label className="field-label">{contentType === 'text' ? 'Your post *' : 'Caption'}</label>
              {mentionResults.length > 0 && (
                <div className="mention-dropdown">
                  {mentionResults.map((r, i) => (
                    <button key={r.id} className={'mention-option ' + (i === mentionIndex ? 'active' : '')} onMouseDown={e => { e.preventDefault(); pickMention(r.username) }}>
                      <div className="post-avatar" style={{ width:24, height:24, fontSize:8, flexShrink:0 }}>
                        {r.avatar_url ? <img src={r.avatar_url} alt="" /> : r.full_name?.slice(0,2).toUpperCase()}
                      </div>
                      <span style={{ fontWeight:500, fontSize:13 }}>{r.full_name}</span>
                      <span style={{ fontSize:12, color:'var(--color-text-3)' }}>@{r.username}</span>
                    </button>
                  ))}
                </div>
              )}
              <textarea ref={captionRef} className="field-textarea" placeholder={contentType === 'text' ? 'Share something… use @ to tag creators' : 'Add a caption… use @ to tag creators'} value={caption} onChange={handleCaptionChange} onKeyDown={handleCaptionKey} style={{ minHeight: contentType === 'text' ? 90 : 64 }} />
            </div>
            <div className="field">
              <label className="field-label">Tags</label>
              <input className="field-input" placeholder="#photography  #portrait  #blackandwhite" value={tags} onChange={e => setTags(e.target.value)} />
            </div>

            <div className="upload-option-row">
              <div className="upload-option-label">
                <span style={{ display:'flex', width:14, height:14, color:'var(--color-text-3)' }}>{postVisibility === 'friends' ? <Icon.Lock /> : <Icon.Globe />}</span>
                Who can see this?
              </div>
              <div className="upload-option-toggle">
                <button className={'upload-vis-btn ' + (postVisibility === 'public' && !isProPost ? 'active' : '')} onClick={() => { setPostVisibility('public') }} disabled={isProPost}>Public</button>
                <button className={'upload-vis-btn ' + (postVisibility === 'friends' && !isProPost ? 'active' : '')} onClick={() => { setPostVisibility('friends'); setIsProPost(false) }} disabled={isProPost}>Friends only</button>
              </div>
            </div>

            {profile?.profession && (
              <div className="upload-option-row pro-option-row" onClick={() => { setIsProPost(v => !v); if (!isProPost) setPostVisibility('public') }}>
                <div className="upload-option-label">
                  <span className="pro-badge-inline">◆</span>
                  Mark as original work (Pro post)
                </div>
                <div className={`upload-toggle ${isProPost ? 'on' : ''}`} />
                {isProPost && <div style={{ width:'100%', fontSize:11, color:'var(--color-text-3)', marginTop:4 }}>
                  Pro posts are always public and visible on your Pro Profile. Creators in your discipline can upvote them.
                </div>}
              </div>
            )}

            {profile?.profession && availableGroups.length > 0 && (
              <div className="upload-option-row" style={{ flexWrap:'wrap', gap:8 }}>
                <div className="upload-option-label" style={{ width:'100%' }}>
                  <span style={{ display:'flex', width:14, height:14, color:'var(--color-text-3)' }}><Icon.Friends /></span>
                  Community group
                  {groupSuggestion && selectedGroup?.id === groupSuggestion.id && (
                    <span style={{ fontSize:10, color:'var(--color-primary)', marginLeft:6, fontWeight:500 }}>suggested</span>
                  )}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6, width:'100%' }}>
                  <button className={`upload-vis-btn ${!selectedGroup ? 'active' : ''}`} onClick={() => setSelectedGroup(null)}>None</button>
                  {availableGroups.map(g => (
                    <button key={g.id} className={`upload-vis-btn ${selectedGroup?.id === g.id ? 'active' : ''}`} onClick={() => setSelectedGroup(g)}>
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {uploading && <div className="upload-progress" style={{ marginBottom:12 }}><div className="upload-progress-fill" style={{ width:`${progress}%` }} /></div>}

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={onClose} disabled={uploading}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2 }} onClick={handleSubmit} disabled={uploading}>
                {uploading ? <><span className="spinner" /> Uploading…</> : 'Publish post'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
