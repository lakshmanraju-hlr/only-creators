import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

interface Props { onDone: () => void }

const STEPS = [
  {
    key: 'welcome',
    icon: '✦',
    title: 'Welcome to only creators',
    sub: 'A platform built for people who make things. Share your work, connect with professionals in your field, and get recognised by your peers.',
  },
  {
    key: 'explore',
    icon: '🔭',
    title: 'Explore professional fields',
    sub: 'Browse Photography, Music, Medicine, Technology and 15+ other disciplines. Find creators who share your craft and follow their work.',
  },
  {
    key: 'post',
    icon: '📸',
    title: 'Share your work as a Pro post',
    sub: 'When you post under a field (e.g. Photography), you become part of that professional community. Other verified creators can Pro-upvote your work.',
  },
  {
    key: 'profile',
    icon: '👤',
    title: 'Set up your profile',
    sub: 'Add a photo, your job title, and a short bio so others know who you are. Takes 30 seconds.',
  },
]

export default function OnboardingModal({ onDone }: Props) {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState(profile?.avatar_url || '')
  const [roleTitle, setRoleTitle] = useState(profile?.role_title || '')
  const [workplace, setWorkplace] = useState((profile as any)?.workplace || '')
  const [bio, setBio] = useState(profile?.bio || '')
  const [saving, setSaving] = useState(false)

  function initials(n: string) { return n?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?' }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setAvatarFile(f)
    setAvatarPreview(URL.createObjectURL(f))
  }

  async function saveAndDone() {
    if (!profile) { onDone(); return }
    setSaving(true)
    let avatarUrl = profile.avatar_url
    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop()
      const path = profile.id + '/avatar.' + ext
      await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true })
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      avatarUrl = data.publicUrl + '?t=' + Date.now()
    }
    await supabase.from('profiles').update({
      avatar_url: avatarUrl,
      role_title: roleTitle.trim() || null,
      workplace: workplace.trim() || null,
      bio: bio.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', profile.id)
    await refreshProfile()
    toast.success('Profile saved!')
    setSaving(false)
    onDone()
  }

  const isLastStep = step === STEPS.length - 1
  const currentStep = STEPS[step]

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--gray-0)', borderRadius: 'var(--r-2xl)', width: '100%', maxWidth: 480, boxShadow: 'var(--shadow-xl)', overflow: 'hidden' }}>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, padding: '16px 24px 0' }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? 'var(--color-primary)' : 'var(--color-border)', transition: 'background 0.3s' }} />
          ))}
        </div>

        <div style={{ padding: '24px 28px 28px' }}>
          {/* Info steps */}
          {!isLastStep && (
            <div style={{ textAlign: 'center', padding: '8px 0 24px' }}>
              <div style={{ fontSize: 44, marginBottom: 16, lineHeight: 1 }}>{currentStep.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px', marginBottom: 10 }}>{currentStep.title}</div>
              <div style={{ fontSize: 14, color: 'var(--color-text-2)', lineHeight: 1.65, maxWidth: 360, margin: '0 auto' }}>{currentStep.sub}</div>
            </div>
          )}

          {/* Profile setup step */}
          {isLastStep && (
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px', marginBottom: 4 }}>{currentStep.title}</div>
              <div style={{ fontSize: 13, color: 'var(--color-text-3)', marginBottom: 20 }}>{currentStep.sub}</div>

              {/* Avatar upload */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                <label style={{ cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', border: '2px dashed var(--color-primary)', fontSize: 22, fontWeight: 700, color: 'var(--color-primary)' }}>
                    {avatarPreview
                      ? <img src={avatarPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : initials(profile?.full_name || '')}
                  </div>
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ display: 'flex', width: 11, height: 11, color: '#fff' }}><Icon.Camera /></span>
                  </div>
                </label>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{profile?.full_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-3)' }}>@{profile?.username}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginTop: 4 }}>Tap the photo to upload</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="field-label" style={{ fontSize: 11 }}>Job title</label>
                  <input className="field-input" placeholder="e.g. Surgeon, Engineer…" value={roleTitle} onChange={e => setRoleTitle(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="field-label" style={{ fontSize: 11 }}>Workplace</label>
                  <input className="field-input" placeholder="e.g. Google, NHS…" value={workplace} onChange={e => setWorkplace(e.target.value)} />
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label className="field-label" style={{ fontSize: 11 }}>Short bio</label>
                <textarea className="field-textarea" style={{ minHeight: 64 }} placeholder="Tell the world about your work…" value={bio} onChange={e => setBio(e.target.value)} />
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: isLastStep ? 20 : 4 }}>
            {isLastStep ? (
              <>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onDone} disabled={saving}>
                  Skip for now
                </button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={saveAndDone} disabled={saving}>
                  {saving ? <span className="spinner" /> : 'Save & get started'}
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={onDone}>
                  Skip tour
                </button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setStep(s => s + 1)}>
                  Next <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.ArrowRight /></span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
