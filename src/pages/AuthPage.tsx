import { useState } from 'react'
import { supabase, PROFESSIONS, Profession } from '@/lib/supabase'
import toast from 'react-hot-toast'

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [loading, setLoading] = useState(false)

  // Login fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Signup fields
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName]   = useState('')
  const [username, setUsername]   = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPass, setSignupPass]   = useState('')
  const [profession, setProfession]   = useState<Profession | ''>('')

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
    if (!firstName || !signupEmail || !signupPass || !username) return toast.error('Please fill required fields')
    if (signupPass.length < 6) return toast.error('Password must be at least 6 characters')
    if (username.length < 3) return toast.error('Username must be at least 3 characters')
    const cleanUsername = username.replace('@', '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPass,
      options: {
        data: {
          full_name: `${firstName} ${lastName}`.trim(),
          username: cleanUsername,
        }
      }
    })
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }
    // Update profession if provided
    if (profession) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('profiles').update({ profession, is_pro: true }).eq('id', user.id)
      }
    }
    toast.success('Account created! Welcome to Only Creators ✦')
    setLoading(false)
  }

  return (
    <div className="auth-page">
      {/* Brand panel */}
      <div className="auth-brand">
        <div className="auth-brand-logo">only <em>creators</em></div>
        <div className="auth-brand-headline">
          Where <em>professionals</em><br />recognize each other.
        </div>
        <p className="auth-brand-sub" style={{ marginTop: 16 }}>
          Share your craft across every medium. Earn peer recognition — not just likes — from verified creators in your own discipline.
        </p>
        <div className="auth-brand-stats">
          <div>
            <div className="auth-stat-num">∞</div>
            <div className="auth-stat-label">Content types</div>
          </div>
          <div>
            <div className="auth-stat-num">8</div>
            <div className="auth-stat-label">Disciplines</div>
          </div>
          <div>
            <div className="auth-stat-num">Free</div>
            <div className="auth-stat-label">Always</div>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="auth-form-area">
        <div className="auth-form-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</div>
        <div className="auth-form-sub">{mode === 'login' ? 'Sign in to your creator account' : 'Join the creator community'}</div>

        <div className="seg-ctrl">
          <button className={`seg-btn ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Sign in</button>
          <button className={`seg-btn ${mode === 'signup' ? 'active' : ''}`} onClick={() => setMode('signup')}>Create account</button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="field">
              <label className="field-label">Email address</label>
              <input className="field-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field-label">Password</label>
              <input className="field-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Sign in →'}
            </button>
            <div className="or-divider">or</div>
            <button type="button" className="btn btn-ghost btn-full" onClick={() => setMode('signup')}>
              Create a new account
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            <div className="field-row">
              <div className="field">
                <label className="field-label">First name *</label>
                <input className="field-input" placeholder="Alex" value={firstName} onChange={e => setFirstName(e.target.value)} required />
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
              <label className="field-label">Email address *</label>
              <input className="field-input" type="email" placeholder="you@example.com" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label className="field-label">Password *</label>
              <input className="field-input" type="password" placeholder="Min. 6 characters" value={signupPass} onChange={e => setSignupPass(e.target.value)} required />
            </div>

            <div className="pro-callout">
              <div className="pro-callout-title">
                ◆ Professional Creator Verification
                <span className="pro-chip" style={{ marginLeft: 'auto' }}>Optional</span>
              </div>
              <p>Verify your profession to unlock <strong>Pro Upvotes</strong> — peer endorsements only between creators of the same discipline.</p>
              <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
                <label className="field-label">I am a professional</label>
                <select className="field-select" value={profession} onChange={e => setProfession(e.target.value as Profession | '')}>
                  <option value="">— General account —</option>
                  {Object.entries(PROFESSIONS).map(([key, val]) => (
                    <option key={key} value={key}>{val.icon}  {val.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop: 18 }}>
              {loading ? <span className="spinner" /> : 'Create account →'}
            </button>
          </form>
        )}

        <p style={{ marginTop: 20, fontSize: 11, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
