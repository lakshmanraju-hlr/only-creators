import { useState, useRef } from 'react'
import { supabase, ContentType } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import toast from 'react-hot-toast'

interface Props { onClose: () => void }

const CONTENT_TYPES: { type: ContentType; icon: string; label: string; accept?: string }[] = [
  { type: 'text',     icon: '💬', label: 'Text' },
  { type: 'photo',    icon: '🖼',  label: 'Photo',    accept: 'image/*' },
  { type: 'audio',    icon: '🎵', label: 'Audio',    accept: 'audio/*' },
  { type: 'video',    icon: '🎬', label: 'Video',    accept: 'video/*' },
  { type: 'document', icon: '📄', label: 'Document', accept: '.pdf,.doc,.docx' },
  { type: 'poem',     icon: '✍️', label: 'Poem' },
]

export default function UploadModal({ onClose }: Props) {
  const { profile } = useAuth()
  const [contentType, setContentType] = useState<ContentType>('text')
  const [caption, setCaption] = useState('')
  const [poemText, setPoemText] = useState('')
  const [tags, setTags] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const currentCT = CONTENT_TYPES.find(c => c.type === contentType)!
  const needsFile = ['photo', 'audio', 'video', 'document'].includes(contentType)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    if (f.type.startsWith('image/')) {
      setFilePreview(URL.createObjectURL(f))
    } else {
      setFilePreview(null)
    }
  }

  async function handleSubmit() {
    if (!profile) return
    if (needsFile && !file) return toast.error('Please select a file to upload')
    if (contentType === 'poem' && !poemText.trim()) return toast.error('Please write your poem')
    if (!caption.trim() && contentType === 'text') return toast.error('Please write something to post')

    setUploading(true)
    setUploadProgress(10)

    let mediaUrl = ''
    let mediaPath = ''

    // Upload file to Supabase Storage
    if (file && needsFile) {
      const ext = file.name.split('.').pop()
      const path = `${profile.id}/${Date.now()}.${ext}`
      setUploadProgress(30)
      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(path, file, { cacheControl: '3600', upsert: false })

      if (uploadError) {
        toast.error('Upload failed: ' + uploadError.message)
        setUploading(false)
        return
      }
      setUploadProgress(70)
      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path)
      mediaUrl = urlData.publicUrl
      mediaPath = path
    }

    setUploadProgress(85)

    // Parse tags
    const tagArray = tags.split(/[\s,]+/).filter(t => t.startsWith('#')).map(t => t.toLowerCase())

    const { error } = await supabase.from('posts').insert({
      user_id: profile.id,
      content_type: contentType,
      caption: caption.trim(),
      poem_text: poemText.trim(),
      media_url: mediaUrl,
      media_path: mediaPath,
      tags: tagArray,
    })

    setUploadProgress(100)

    if (error) {
      toast.error('Failed to post: ' + error.message)
    } else {
      toast.success('Post published! ✦')
      onClose()
    }
    setUploading(false)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">New post</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Content type selector */}
        <div className="ct-grid">
          {CONTENT_TYPES.map(ct => (
            <button
              key={ct.type}
              className={`ct-btn ${contentType === ct.type ? 'active' : ''}`}
              onClick={() => { setContentType(ct.type); setFile(null); setFilePreview(null) }}
            >
              <span className="ct-icon">{ct.icon}</span>
              {ct.label}
            </button>
          ))}
        </div>

        {/* File upload zone */}
        {needsFile && (
          <div>
            <div className="upload-zone" onClick={() => fileRef.current?.click()}>
              {filePreview
                ? <img src={filePreview} alt="" style={{ maxHeight: 180, borderRadius: 8, margin: '0 auto' }} />
                : <>
                  <div className="upload-zone-icon">{currentCT.icon}</div>
                  <div className="upload-zone-text">{file ? file.name : 'Click to browse or drag & drop'}</div>
                  <div className="upload-zone-sub">
                    {currentCT.type === 'photo' && 'JPG, PNG, GIF, WebP — max 500MB'}
                    {currentCT.type === 'audio' && 'MP3, WAV, OGG — max 500MB'}
                    {currentCT.type === 'video' && 'MP4, MOV — max 500MB'}
                    {currentCT.type === 'document' && 'PDF, DOC, DOCX — max 500MB'}
                  </div>
                </>
              }
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={currentCT.accept}
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            {file && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>✓ {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</div>}
          </div>
        )}

        {/* Poem editor */}
        {contentType === 'poem' && (
          <textarea
            className="poem-editor"
            placeholder={"Let the words flow…\n\nEach line, a brushstroke\nOn the canvas of silence"}
            value={poemText}
            onChange={e => setPoemText(e.target.value)}
          />
        )}

        {/* Caption */}
        <div className="field">
          <label className="field-label">{contentType === 'text' ? 'Your post *' : 'Caption'}</label>
          <textarea
            className="field-textarea"
            placeholder={contentType === 'text' ? 'Share something with the world…' : 'Add a caption…'}
            value={caption}
            onChange={e => setCaption(e.target.value)}
            style={{ minHeight: contentType === 'text' ? 100 : 70 }}
          />
        </div>

        {/* Tags */}
        <div className="field">
          <label className="field-label">Tags</label>
          <input
            className="field-input"
            placeholder="#photography  #portrait  #blackandwhite"
            value={tags}
            onChange={e => setTags(e.target.value)}
          />
        </div>

        {/* Upload progress */}
        {uploading && (
          <div className="upload-progress" style={{ marginBottom: 14 }}>
            <div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={uploading}>Cancel</button>
          <button className="btn btn-primary" style={{ flex: 2 }} onClick={handleSubmit} disabled={uploading}>
            {uploading ? <><span className="spinner" /> Uploading…</> : 'Publish post →'}
          </button>
        </div>
      </div>
    </div>
  )
}
