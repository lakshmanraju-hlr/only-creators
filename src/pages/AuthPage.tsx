import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

type AuthMode = 'login' | 'signup' | 'forgot'

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
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPass, setSignupPass] = useState('')

  // ── Handlers ───────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return toast.error('Please fill in all fields')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) toast.error(error.message)
    setLoading(false)
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName || !signupEmail || !signupPass || !username)
      return toast.error('Please fill in all required fields')
    if (signupPass.length < 6) return toast.error('Password must be at least 6 characters')
    setLoading(true)
    const cleanUser = username.replace('@', '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPass,
      options: { data: { full_name: `${firstName} ${lastName}`.trim(), username: cleanUser } },
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Welcome to only creators!')
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
        <div className="auth-brand-headline">A home for every field.</div>
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
            {/* Tab switcher */}
            <>
              <div className="auth-form-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</div>
              <div className="auth-form-sub">{mode === 'login' ? 'Sign in to continue' : 'Join for free — takes under a minute'}</div>
              <div className="seg-ctrl">
                <button className={`seg-btn ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Sign in</button>
                <button className={`seg-btn ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>Sign up</button>
              </div>
            </>

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

            {/* ── SIGNUP FORM ──────────────────────────────────── */}
            {mode === 'signup' && (
              <form onSubmit={handleSignup}>
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
                <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop: 8 }}>
                  {loading ? <span className="spinner" /> : <>Create account <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.ArrowRight /></span></>}
                </button>
                <div className="or-divider">or</div>
                <button type="button" className="btn btn-ghost btn-full" onClick={() => setMode('login')}>Already have an account? Sign in</button>
              </form>
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
