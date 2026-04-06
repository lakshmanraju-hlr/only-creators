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
    sub: 'Browse Photography, Music, Medicine, Technology and 15+ other fields. Find creators who share your craft and follow their work.',
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

  const fieldClass = "w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-brand-600 dark:focus:border-brand-400 transition-colors"
  const labelClass = "block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1.5"

  return (
    <div className="fixed inset-0 bg-black/55 z-[1000] flex items-center justify-center p-4">
      <div className="w-full max-w-[480px] bg-white dark:bg-gray-900 rounded-3xl shadow-xl overflow-hidden">

        {/* Progress bar */}
        <div className="flex gap-1 px-6 pt-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-[3px] rounded-full transition-colors duration-300 ${i <= step ? 'bg-brand-600' : 'bg-gray-100 dark:bg-gray-800'}`}
            />
          ))}
        </div>

        <div className="px-7 pb-7 pt-6">
          {/* Info steps */}
          {!isLastStep && (
            <div className="text-center py-2 pb-6">
              <div className="text-[44px] leading-none mb-4">{currentStep.icon}</div>
              <h2 className="text-[20px] font-bold tracking-tight text-gray-900 dark:text-white mb-2.5">{currentStep.title}</h2>
              <p className="text-[14px] text-gray-500 dark:text-gray-400 leading-relaxed max-w-[360px] mx-auto">{currentStep.sub}</p>
            </div>
          )}

          {/* Profile setup step */}
          {isLastStep && (
            <div>
              <h2 className="text-[18px] font-bold tracking-tight text-gray-900 dark:text-white mb-1">{currentStep.title}</h2>
              <p className="text-[13px] text-gray-400 mb-5">{currentStep.sub}</p>

              {/* Avatar */}
              <div className="flex items-center gap-4 mb-5">
                <label className="cursor-pointer relative shrink-0">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <div className="w-[72px] h-[72px] rounded-full overflow-hidden bg-brand-50 dark:bg-brand-600/10 border-2 border-dashed border-brand-600 flex items-center justify-center text-[22px] font-bold text-brand-600">
                    {avatarPreview
                      ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                      : initials(profile?.full_name || '')}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-[22px] h-[22px] rounded-full bg-brand-600 flex items-center justify-center">
                    <span className="flex w-[11px] h-[11px] text-white"><Icon.Camera /></span>
                  </div>
                </label>
                <div>
                  <p className="font-semibold text-[14px] text-gray-900 dark:text-white">{profile?.full_name}</p>
                  <p className="text-[12px] text-gray-400">@{profile?.username}</p>
                  <p className="text-[11px] text-gray-400 mt-1">Tap the photo to upload</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <div>
                  <label className={labelClass}>Job title</label>
                  <input className={fieldClass} placeholder="e.g. Surgeon, Engineer…" value={roleTitle} onChange={e => setRoleTitle(e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Workplace</label>
                  <input className={fieldClass} placeholder="e.g. Google, NHS…" value={workplace} onChange={e => setWorkplace(e.target.value)} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Short bio</label>
                <textarea
                  className={fieldClass + ' resize-none'}
                  style={{ minHeight: 64 }}
                  placeholder="Tell the world about your work…"
                  value={bio}
                  onChange={e => setBio(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className={`flex gap-2.5 ${isLastStep ? 'mt-5' : 'mt-1'}`}>
            {isLastStep ? (
              <>
                <button
                  className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-[14px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  onClick={onDone} disabled={saving}
                >Skip for now</button>
                <button
                  className="flex-[2] py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-[14px] font-medium transition-colors flex items-center justify-center gap-2"
                  onClick={saveAndDone} disabled={saving}
                >
                  {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Save & get started'}
                </button>
              </>
            ) : (
              <>
                <button className="text-[12px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-2" onClick={onDone}>
                  Skip tour
                </button>
                <button
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-[14px] font-medium flex items-center justify-center gap-2 transition-colors"
                  onClick={() => setStep(s => s + 1)}
                >
                  Next <span className="flex w-3.5 h-3.5"><Icon.ArrowRight /></span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
