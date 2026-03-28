import { useState, useRef } from 'react'
import { supabase, ContentType } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

interface Props { onClose: () => void }

const CONTENT_TYPES: { type: ContentType; icon: React.ReactNode; label: string; accept?: string }[] = [
  { type: 'text',     icon: <Icon.PenLine />,   label: 'Text' },
  { type: 'photo',    icon: <Icon.Camera />,    label: 'Photo',    accept: 'image/*' },
  { type: 'audio',    icon: <Icon.Music />,     label: 'Audio',    accept: 'audio/*' },
  { type: 'video',    icon: <Icon.Video />,     label: 'Video',    accept: 'video/*' },
  { type: 'document', icon: <Icon.FileText />,  label: 'Document', accept: '.pdf,.doc,.docx' },
  { type: 'poem',     icon: <Icon.PenLine />,   label: 'Poem' },
]

export default function UploadModal({ onClose }: Props) {
  const { profile } = useAuth()
  const [contentType, setContentType] = useState<ContentType>('text')
  const [caption, setCaption] = useState('')
  const [poemText, setPoemText] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [isProPost, setIsProPost] = useState(false)
  const [postVisibility, setPostVisibility] = useState<'public' | 'friends'>('public')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

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
    const { error } = await supabase.from('posts').insert({ user_id: profile.id, content_type: contentType, caption: caption.trim(), poem_text: poemText.trim(), media_url: mediaUrl, media_path: mediaPath, tags: tagArray, is_pro_post: isProPost, visibility: isProPost ? 'public' : postVisibility })
    setProgress(100)
    if (error) { toast.error('Failed to post: ' + error.message) }
    else { toast.success('Post published!'); onClose() }
    setUploading(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">New post</div>
          <button className="modal-close" onClick={onClose}><Icon.X /></button>
        </div>

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

        <div className="field">
          <label className="field-label">{contentType === 'text' ? 'Your post *' : 'Caption'}</label>
          <textarea className="field-textarea" placeholder={contentType === 'text' ? 'Share something with the world…' : 'Add a caption…'} value={caption} onChange={e => setCaption(e.target.value)} style={{ minHeight: contentType === 'text' ? 90 : 64 }} />
        </div>
        <div className="field">
          <label className="field-label">Tags</label>
          <input className="field-input" placeholder="#photography  #portrait  #blackandwhite" value={tags} onChange={e => setTags(e.target.value)} />
        </div>

        {/* Visibility — always shown */}
        <div className="upload-option-row">
          <div className="upload-option-label">
            <span style={{ display:'flex', width:14, height:14, color:'var(--color-text-3)' }}>{postVisibility === 'friends' ? <Icon.Lock /> : <Icon.Globe />}</span>
            Who can see this?
          </div>
          <div className="upload-option-toggle">
            <button
              className={'upload-vis-btn ' + (postVisibility === 'public' && !isProPost ? 'active' : '')}
              onClick={() => { setPostVisibility('public'); }}
              disabled={isProPost}
            >Public</button>
            <button
              className={'upload-vis-btn ' + (postVisibility === 'friends' && !isProPost ? 'active' : '')}
              onClick={() => { setPostVisibility('friends'); setIsProPost(false) }}
              disabled={isProPost}
            >Friends only</button>
          </div>
        </div>

        {/* Pro post toggle — only for users with a profession */}
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

        {uploading && <div className="upload-progress" style={{ marginBottom:12 }}><div className="upload-progress-fill" style={{ width:`${progress}%` }} /></div>}

        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-ghost" style={{ flex:1 }} onClick={onClose} disabled={uploading}>Cancel</button>
          <button className="btn btn-primary" style={{ flex:2 }} onClick={handleSubmit} disabled={uploading}>
            {uploading ? <><span className="spinner" /> Uploading…</> : 'Publish post'}
          </button>
        </div>
      </div>
    </div>
  )
}
