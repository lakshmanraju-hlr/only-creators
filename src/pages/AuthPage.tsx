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

  const fieldClass = "w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:border-brand-600 dark:focus:border-brand-400 transition-colors"
  const labelClass = "block text-[12px] font-medium text-gray-600 dark:text-gray-400 mb-1.5"
  const primaryBtn = "w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium rounded-xl py-2.5 text-[14px] transition-colors"
  const ghostBtn = "w-full flex items-center justify-center gap-2 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium rounded-xl py-2.5 text-[14px] transition-colors"

  return (
    <div className="min-h-screen flex">
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[420px] shrink-0 bg-gray-950 text-white px-12 py-16">
        <div>
          <div className="text-[28px] font-bold tracking-tight mb-1">only <em className="not-italic text-brand-600">creators</em></div>
          <h2 className="text-[32px] font-bold tracking-tight leading-tight mt-10 mb-4">A home for every field.</h2>
          <p className="text-[15px] text-gray-400 leading-relaxed">
            Browse, connect, and share across 19 professional communities — or just enjoy great content. You're in the right place either way.
          </p>
        </div>
        <div className="flex gap-8">
          {[['19+', 'Disciplines'], ['Free', 'Always'], ['Real', 'Peers']].map(([num, label]) => (
            <div key={label}>
              <div className="text-[26px] font-bold text-brand-600">{num}</div>
              <div className="text-[12px] text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Form area */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white dark:bg-gray-950">
        <div className="w-full max-w-[400px]">
          {/* Forgot password */}
          {mode === 'forgot' && (
            <>
              <button
                className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-6 transition-colors"
                onClick={() => { setMode('login'); setForgotSent(false) }}
              >
                <span className="flex w-3.5 h-3.5"><Icon.ArrowLeft /></span> Back
              </button>
              <h1 className="text-[24px] font-bold text-gray-900 dark:text-white tracking-tight mb-1">Reset your password</h1>
              <p className="text-[13.5px] text-gray-400 mb-6">We'll send a reset link to your email</p>
              {forgotSent ? (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-2xl p-5 text-center">
                  <p className="font-semibold text-green-700 dark:text-green-400 mb-1">Check your email</p>
                  <p className="text-[13px] text-gray-600 dark:text-gray-400 leading-relaxed">
                    We sent a reset link to <strong>{forgotEmail}</strong>
                  </p>
                  <button className="mt-4 text-[13px] text-brand-600 font-medium" onClick={() => { setMode('login'); setForgotSent(false) }}>
                    Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className={labelClass}>Email address</label>
                    <input className={fieldClass} type="email" placeholder="you@example.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                  </div>
                  <button className={primaryBtn} type="submit" disabled={loading}>
                    {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Send reset link'}
                  </button>
                </form>
              )}
            </>
          )}

          {/* Login / Signup */}
          {mode !== 'forgot' && (
            <>
              <h1 className="text-[24px] font-bold text-gray-900 dark:text-white tracking-tight mb-1">
                {mode === 'login' ? 'Welcome back' : 'Create your account'}
              </h1>
              <p className="text-[13.5px] text-gray-400 mb-6">
                {mode === 'login' ? 'Sign in to continue' : 'Join for free — takes under a minute'}
              </p>

              {/* Segment control */}
              <div className="flex p-1 bg-gray-100 dark:bg-gray-800 rounded-xl mb-6">
                {(['login', 'signup'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`flex-1 py-2 text-[13px] font-medium rounded-lg transition-all ${
                      mode === m
                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {m === 'login' ? 'Sign in' : 'Sign up'}
                  </button>
                ))}
              </div>

              {/* Login form */}
              {mode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className={labelClass}>Email</label>
                    <input className={fieldClass} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
                  </div>
                  <div className="relative">
                    <label className={labelClass}>Password</label>
                    <input className={fieldClass} type={showPass ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight: 40 }} />
                    <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-[30px] flex w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors">
                      {showPass ? <Icon.EyeOff /> : <Icon.Eye />}
                    </button>
                  </div>
                  <button type="button" className="text-[12.5px] text-brand-600 font-medium" onClick={() => setMode('forgot')}>Forgot password?</button>
                  <button className={primaryBtn} type="submit" disabled={loading}>
                    {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <>Sign in <span className="flex w-3.5 h-3.5"><Icon.ArrowRight /></span></>}
                  </button>
                  <div className="flex items-center gap-3 my-1">
                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                    <span className="text-[11px] text-gray-400">or</span>
                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                  </div>
                  <button type="button" className={ghostBtn} onClick={() => setMode('signup')}>Create a new account</button>
                </form>
              )}

              {/* Signup form */}
              {mode === 'signup' && (
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>First name *</label>
                      <input className={fieldClass} placeholder="Alex" value={firstName} onChange={e => setFirstName(e.target.value)} required autoFocus />
                    </div>
                    <div>
                      <label className={labelClass}>Last name</label>
                      <input className={fieldClass} placeholder="Rivera" value={lastName} onChange={e => setLastName(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Username *</label>
                    <input className={fieldClass} placeholder="@yourname" value={username} onChange={e => setUsername(e.target.value)} required />
                  </div>
                  <div>
                    <label className={labelClass}>Email *</label>
                    <input className={fieldClass} type="email" placeholder="you@example.com" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} required />
                  </div>
                  <div className="relative">
                    <label className={labelClass}>Password *</label>
                    <input className={fieldClass} type={showPass ? 'text' : 'password'} placeholder="Min. 6 characters" value={signupPass} onChange={e => setSignupPass(e.target.value)} required style={{ paddingRight: 40 }} />
                    <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-[30px] flex w-4 h-4 text-gray-400 hover:text-gray-600 transition-colors">
                      {showPass ? <Icon.EyeOff /> : <Icon.Eye />}
                    </button>
                  </div>
                  <button className={primaryBtn} type="submit" disabled={loading}>
                    {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <>Create account <span className="flex w-3.5 h-3.5"><Icon.ArrowRight /></span></>}
                  </button>
                  <div className="flex items-center gap-3 my-1">
                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                    <span className="text-[11px] text-gray-400">or</span>
                    <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
                  </div>
                  <button type="button" className={ghostBtn} onClick={() => setMode('login')}>Already have an account? Sign in</button>
                </form>
              )}
            </>
          )}

          <p className="mt-6 text-[11px] text-gray-400 text-center leading-relaxed">
            By continuing you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}
