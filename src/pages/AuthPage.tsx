import { useState } from 'react'
import { supabase, PROFESSIONS, Profession } from '@/lib/supabase'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

type AuthMode = 'login' | 'signup' | 'forgot'
type SignupStep = 1 | 2   // 1 = basics, 2 = discipline (optional)

const ALL_DISCIPLINES = Object.entries(PROFESSIONS) as [Profession, typeof PROFESSIONS[Profession]][]

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')

  // ── Login ──────────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  // ── Forgot ─────────────────────────────────────────────────────
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)

  // ── Signup ─────────────────────────────────────────────────────
  const [step, setStep] = useState<SignupStep>(1)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPass, setSignupPass] = useState('')
  const [selectedDiscipline, setSelectedDiscipline] = useState<string | null>(null)

  // ── Handlers ───────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return toast.error('Please fill in all fields')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) toast.error(error.message)
    setLoading(false)
  }

  function handleStep1(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName || !signupEmail || !signupPass || !username)
      return toast.error('Please fill in all required fields')
    if (signupPass.length < 6) return toast.error('Password must be at least 6 characters')
    setStep(2)
  }

  async function handleFinish(discipline: string | null) {
    setLoading(true)
    const cleanUser = username.replace('@', '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPass,
      options: { data: { full_name: `${firstName} ${lastName}`.trim(), username: cleanUser } },
    })
    if (error) { toast.error(error.message); setLoading(false); return }

    if (discipline) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({
          profession: discipline,
          professions: [discipline],
          is_pro: true,
        }).eq('id', user.id)
        await supabase.from('discipline_personas').upsert({
          user_id: user.id,
          discipline,
          level: 'newcomer',
        }, { onConflict: 'user_id,discipline', ignoreDuplicates: true })
      }
    }
    toast.success('Welcome!')
    setLoading(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    if (!forgotEmail) return toast.error('Please enter your email')
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    setForgotSent(true)
    setLoading(false)
  }

  return (
    <div className="auth-page">
      {/* ── Brand panel ─────────────────────────────────────────── */}
      <div className="auth-brand">
        <div className="auth-brand-logo">only <em>creators</em></div>
        <div className="auth-brand-headline">A home for every discipline.</div>
        <p className="auth-brand-sub" style={{ marginTop: 12 }}>
          Browse, connect, and share across 19 professional communities — or just enjoy great content. You're in the right place either way.
        </p>
        <div className="auth-brand-stats">
          <div><div className="auth-stat-num">19+</div><div className="auth-stat-label">Disciplines</div></div>
          <div><div className="auth-stat-num">Free</div><div className="auth-stat-label">Always</div></div>
          <div><div className="auth-stat-num">Real</div><div className="auth-stat-label">Peers</div></div>
        </div>
      </div>

      <div className="auth-form-area">
        {/* ── FORGOT PASSWORD ───────────────────────────────────── */}
        {mode === 'forgot' && (
          <>
            <button className="btn btn-ghost btn-sm" style={{ marginBottom: 20, gap: 6, alignSelf: 'flex-start' }} onClick={() => { setMode('login'); setForgotSent(false) }}>
              <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.ArrowLeft /></span> Back
            </button>
            <div className="auth-form-title">Reset your password</div>
            <div className="auth-form-sub">We'll send a reset link to your email</div>
            {forgotSent ? (
              <div style={{ background: 'var(--green-50)', border: '1px solid #bbf7d0', borderRadius: 'var(--r-lg)', padding: 20, textAlign: 'center', marginTop: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--green-600)' }}>Check your email</div>
                <div style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.6 }}>
                  We sent a reset link to <strong>{forgotEmail}</strong>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => { setMode('login'); setForgotSent(false) }}>Back to sign in</button>
              </div>
            ) : (
              <form onSubmit={handleForgot} style={{ marginTop: 8 }}>
                <div className="field">
                  <label className="field-label">Email address</label>
                  <input className="field-input" type="email" placeholder="you@example.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                </div>
                <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
                  {loading ? <span className="spinner" /> : 'Send reset link'}
                </button>
              </form>
            )}
          </>
        )}

        {/* ── LOGIN / SIGNUP ────────────────────────────────────── */}
        {mode !== 'forgot' && (
          <>
            {/* Tab switcher — only on step 1 */}
            {(mode === 'login' || step === 1) && (
              <>
                <div className="auth-form-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</div>
                <div className="auth-form-sub">{mode === 'login' ? 'Sign in to continue' : "Join for free — takes under a minute"}</div>
                <div className="seg-ctrl">
                  <button className={`seg-btn ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Sign in</button>
                  <button className={`seg-btn ${mode === 'signup' ? 'active' : ''}`} onClick={() => { setMode('signup'); setStep(1) }}>Sign up</button>
                </div>
              </>
            )}

            {/* ── LOGIN FORM ──────────────────────────────────── */}
            {mode === 'login' && (
              <form onSubmit={handleLogin}>
                <div className="field">
                  <label className="field-label">Email</label>
                  <input className="field-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
                </div>
                <div className="field" style={{ position: 'relative' }}>
                  <label className="field-label">Password</label>
                  <input className="field-input" type={showPass ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: 40 }} />
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 12, top: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', display: 'flex', width: 16, height: 16 }}>
                    {showPass ? <Icon.EyeOff /> : <Icon.Eye />}
                  </button>
                </div>
                <button type="button" className="forgot-link" onClick={() => setMode('forgot')}>Forgot password?</button>
                <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
                  {loading ? <span className="spinner" /> : <>Sign in <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.ArrowRight /></span></>}
                </button>
                <div className="or-divider">or</div>
                <button type="button" className="btn btn-ghost btn-full" onClick={() => setMode('signup')}>Create a new account</button>
              </form>
            )}

            {/* ── SIGNUP STEP 1: basics ────────────────────────── */}
            {mode === 'signup' && step === 1 && (
              <form onSubmit={handleStep1}>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">First name *</label>
                    <input className="field-input" placeholder="Alex" value={firstName} onChange={e => setFirstName(e.target.value)} required autoFocus />
                  </div>
                  <div className="field">
                    <label className="field-label">Last name</label>
                    <input className="field-input" placeholder="Rivera" value={lastName} onChange={e => setLastName(e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">Username *</label>
                  <input className="field-input" placeholder="@yourname" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
                <div className="field">
                  <label className="field-label">Email *</label>
                  <input className="field-input" type="email" placeholder="you@example.com" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} required />
                </div>
                <div className="field" style={{ position: 'relative' }}>
                  <label className="field-label">Password *</label>
                  <input className="field-input" type={showPass ? 'text' : 'password'} placeholder="Min. 6 characters" value={signupPass} onChange={e => setSignupPass(e.target.value)} required style={{ paddingRight: 40 }} />
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 12, top: 32, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-3)', display: 'flex', width: 16, height: 16 }}>
                    {showPass ? <Icon.EyeOff /> : <Icon.Eye />}
                  </button>
                </div>
                <button className="btn btn-primary btn-full" type="submit" style={{ marginTop: 8 }}>
                  Continue <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.ArrowRight /></span>
                </button>
              </form>
            )}

            {/* ── SIGNUP STEP 2: discipline (optional) ─────────── */}
            {mode === 'signup' && step === 2 && (
              <div>
                {/* Step indicator */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                  {[1, 2].map(s => (
                    <div key={s} style={{ height: 3, flex: s === 2 ? 2 : 1, borderRadius: 2, background: s <= step ? 'var(--color-primary)' : 'var(--color-border)', transition: 'all 0.2s' }} />
                  ))}
                </div>

                <div className="auth-form-title" style={{ marginBottom: 4 }}>Are you a professional?</div>
                <div className="auth-form-sub" style={{ marginBottom: 20 }}>
                  Choose your field if you'd like to connect with peers in that community. You can always do this later.
                </div>

                <div className="auth-discipline-grid">
                  {ALL_DISCIPLINES.map(([key, val]) => (
                    <button
                      key={key}
                      type="button"
                      className={`auth-discipline-tile ${selectedDiscipline === key ? 'active' : ''}`}
                      onClick={() => setSelectedDiscipline(prev => prev === key ? null : key)}
                    >
                      <span className="auth-discipline-icon">{val.icon}</span>
                      <span className="auth-discipline-label">{val.label}</span>
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ flex: 1 }}
                    onClick={() => handleFinish(null)}
                    disabled={loading}
                  >
                    Skip for now
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                    onClick={() => handleFinish(selectedDiscipline)}
                    disabled={loading}
                  >
                    {loading ? <span className="spinner" /> : selectedDiscipline ? 'Create account' : 'Create account'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <p style={{ marginTop: 20, fontSize: 11, color: 'var(--color-text-3)', textAlign: 'center', lineHeight: 1.7 }}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
