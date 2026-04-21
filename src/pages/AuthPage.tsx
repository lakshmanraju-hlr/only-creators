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
  const [showSignupPass, setShowSignupPass] = useState(false)

  // ── Error states ────────────────────────────────────────────────
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // ── Handlers ───────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    if (!email) { setFieldErrors({ email: 'Email is required' }); return }
    if (!password) { setFieldErrors({ password: 'Password is required' }); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error(error.message)
      setFieldErrors({ password: error.message })
    }
    setLoading(false)
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    const errors: Record<string, string> = {}
    if (!firstName) errors.firstName = 'Required'
    if (!signupEmail) errors.signupEmail = 'Required'
    if (!signupPass) errors.signupPass = 'Required'
    if (!username) errors.username = 'Required'
    if (signupPass && signupPass.length < 6) errors.signupPass = 'Min. 6 characters'
    if (Object.keys(errors).length) { setFieldErrors(errors); return }
    setLoading(true)
    const cleanUser = username.replace('@', '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPass,
      options: { data: { full_name: `${firstName} ${lastName}`.trim(), username: cleanUser } },
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Welcome to Only Creators!')
    setLoading(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setFieldErrors({})
    if (!forgotEmail) { setFieldErrors({ forgotEmail: 'Email is required' }); return }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    setForgotSent(true)
    setLoading(false)
  }

  // ── Style helpers ──────────────────────────────────────────────
  function inputClass(field?: string) {
    const hasError = field && fieldErrors[field]
    return [
      'w-full h-12 px-3.5 text-[15px] text-[#111111] placeholder:text-[#9CA3AF]',
      'border rounded-[8px] outline-none transition-colors bg-white',
      hasError
        ? 'border-[#EF4444] focus:border-[#EF4444]'
        : 'border-[#E5E7EB] focus:border-[#2563EB]',
    ].join(' ')
  }

  const primaryBtn =
    'w-full h-12 flex items-center justify-center gap-2 bg-[#1A1A1A] hover:bg-[#333333] active:scale-[0.97] disabled:bg-[#D1D5DB] disabled:cursor-not-allowed text-white text-[15px] font-semibold rounded-[8px] transition-all'

  const secondaryBtn =
    'w-full h-12 flex items-center justify-center gap-2 border border-[#1A1A1A] hover:bg-[#F8F8F6] active:scale-[0.97] text-[#1A1A1A] text-[15px] font-semibold rounded-[8px] transition-all bg-transparent'

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-12"
      style={{ background: '#F8F8F6' }}
    >
      <div className="w-full" style={{ maxWidth: 380 }}>

        {/* ── Forgot password ── */}
        {mode === 'forgot' && (
          <>
            <button
              className="flex items-center gap-1.5 text-[13px] text-[#6B7280] hover:text-[#111111] mb-8 transition-colors"
              onClick={() => { setMode('login'); setForgotSent(false); setFieldErrors({}) }}
            >
              <span className="flex w-4 h-4"><Icon.ArrowLeft /></span>
              Back
            </button>

            <h1 className="text-[24px] font-semibold text-[#111111] tracking-tight mb-1">
              Reset your password
            </h1>
            <p className="text-[15px] text-[#6B7280] mb-8">
              We'll send a reset link to your email.
            </p>

            {forgotSent ? (
              <div className="bg-white border border-[#E5E7EB] rounded-[12px] p-6 text-center shadow-card">
                <p className="font-semibold text-[#10B981] mb-1">Check your email</p>
                <p className="text-[13px] text-[#6B7280] leading-relaxed">
                  We sent a reset link to <strong className="text-[#111111]">{forgotEmail}</strong>
                </p>
                <button
                  className="mt-5 text-[13px] text-[#2563EB] font-semibold"
                  onClick={() => { setMode('login'); setForgotSent(false) }}
                >
                  Back to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <input
                    className={inputClass('forgotEmail')}
                    type="email"
                    placeholder="Email address"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                    autoFocus
                  />
                  {fieldErrors.forgotEmail && (
                    <p className="text-[12px] text-[#EF4444] mt-1">{fieldErrors.forgotEmail}</p>
                  )}
                </div>
                <button className={primaryBtn} type="submit" disabled={loading}>
                  {loading
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : 'Send reset link'
                  }
                </button>
              </form>
            )}

            <p className="mt-8 text-[11px] text-[#9CA3AF] text-center">
              By continuing you agree to our{' '}
              <span className="text-[#6B7280] underline cursor-pointer">Terms of Service</span>
              {' '}and{' '}
              <span className="text-[#6B7280] underline cursor-pointer">Privacy Policy</span>.
            </p>
          </>
        )}

        {/* ── Login / Sign up ── */}
        {mode !== 'forgot' && (
          <>
            {/* Logo + tagline */}
            <div className="text-center mb-10" style={{ marginTop: 64 }}>
              <h1 className="text-[24px] font-bold text-[#1A1A1A] tracking-tight">
                Only Creators
              </h1>
              <p className="text-[15px] text-[#6B7280] mt-1">
                A home for every creative field.
              </p>
            </div>

            {/* Social sign-in buttons */}
            <div className="flex flex-col gap-3 mb-6">
              <SocialButton
                icon={<GoogleIcon />}
                label="Continue with Google"
                onClick={() =>
                  supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: { redirectTo: window.location.origin },
                  })
                }
              />
              <SocialButton
                icon={<AppleIcon />}
                label="Continue with Apple"
                dark
                onClick={() =>
                  supabase.auth.signInWithOAuth({
                    provider: 'apple',
                    options: { redirectTo: window.location.origin },
                  })
                }
              />
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-[#E5E7EB]" />
              <span className="text-[13px] text-[#9CA3AF]">or</span>
              <div className="flex-1 h-px bg-[#E5E7EB]" />
            </div>

            {/* Login form */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <input
                    className={inputClass('email')}
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoFocus
                  />
                  {fieldErrors.email && (
                    <p className="text-[12px] text-[#EF4444] mt-1">{fieldErrors.email}</p>
                  )}
                </div>

                <div>
                  <div className="relative">
                    <input
                      className={inputClass('password')}
                      type={showPass ? 'text' : 'password'}
                      placeholder="Password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 flex w-5 h-5 text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                    >
                      {showPass ? <Icon.EyeOff /> : <Icon.Eye />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <p className="text-[12px] text-[#EF4444] mt-1">{fieldErrors.password}</p>
                  )}
                </div>

                <button
                  type="button"
                  className="text-[13px] text-[#2563EB] font-semibold"
                  onClick={() => { setMode('forgot'); setFieldErrors({}) }}
                >
                  Forgot password?
                </button>

                <button className={primaryBtn} type="submit" disabled={loading} style={{ marginTop: 16 }}>
                  {loading
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : 'Sign in'
                  }
                </button>

                <button
                  type="button"
                  className={secondaryBtn}
                  onClick={() => { setMode('signup'); setFieldErrors({}) }}
                >
                  Don't have an account? Sign up
                </button>
              </form>
            )}

            {/* Sign up form */}
            {mode === 'signup' && (
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      className={inputClass('firstName')}
                      placeholder="First name"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      autoFocus
                    />
                    {fieldErrors.firstName && (
                      <p className="text-[12px] text-[#EF4444] mt-1">{fieldErrors.firstName}</p>
                    )}
                  </div>
                  <div>
                    <input
                      className={inputClass()}
                      placeholder="Last name"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <input
                    className={inputClass('username')}
                    placeholder="Username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                  />
                  {fieldErrors.username && (
                    <p className="text-[12px] text-[#EF4444] mt-1">{fieldErrors.username}</p>
                  )}
                </div>

                <div>
                  <input
                    className={inputClass('signupEmail')}
                    type="email"
                    placeholder="Email address"
                    value={signupEmail}
                    onChange={e => setSignupEmail(e.target.value)}
                  />
                  {fieldErrors.signupEmail && (
                    <p className="text-[12px] text-[#EF4444] mt-1">{fieldErrors.signupEmail}</p>
                  )}
                </div>

                <div>
                  <div className="relative">
                    <input
                      className={inputClass('signupPass')}
                      type={showSignupPass ? 'text' : 'password'}
                      placeholder="Password"
                      value={signupPass}
                      onChange={e => setSignupPass(e.target.value)}
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 flex w-5 h-5 text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                    >
                      {showSignupPass ? <Icon.EyeOff /> : <Icon.Eye />}
                    </button>
                  </div>
                  {fieldErrors.signupPass && (
                    <p className="text-[12px] text-[#EF4444] mt-1">{fieldErrors.signupPass}</p>
                  )}
                </div>

                <button className={primaryBtn} type="submit" disabled={loading} style={{ marginTop: 16 }}>
                  {loading
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : 'Create account'
                  }
                </button>

                <button
                  type="button"
                  className={secondaryBtn}
                  onClick={() => { setMode('login'); setFieldErrors({}) }}
                >
                  Already have an account? Sign in
                </button>
              </form>
            )}

            <p className="mt-8 text-[11px] text-[#9CA3AF] text-center pb-12">
              By continuing you agree to our{' '}
              <span className="text-[#6B7280] underline cursor-pointer">Terms of Service</span>
              {' '}and{' '}
              <span className="text-[#6B7280] underline cursor-pointer">Privacy Policy</span>.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Social sign-in button ───────────────────────────────────────
function SocialButton({
  icon,
  label,
  dark = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  dark?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full h-12 flex items-center justify-center gap-3 rounded-[8px] border text-[15px] font-semibold transition-all active:scale-[0.97]',
        dark
          ? 'bg-[#1A1A1A] border-[#1A1A1A] text-white hover:bg-[#333333]'
          : 'bg-white border-[#E5E7EB] text-[#111111] hover:bg-[#F8F8F6]',
      ].join(' ')}
    >
      <span className="flex w-5 h-5 shrink-0">{icon}</span>
      {label}
    </button>
  )
}

// ── SVG icons ──────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 3.99zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
    </svg>
  )
}
