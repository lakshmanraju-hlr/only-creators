import { useState } from 'react'
import { supabase, PROFESSIONS, Profession } from '@/lib/supabase'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

type AuthMode = 'login' | 'signup' | 'forgot'

const MAX_PROFESSIONS = 3

// All predefined professions as [key, label] pairs
const ALL_PROFESSIONS = Object.entries(PROFESSIONS) as [Profession, typeof PROFESSIONS[Profession]][]

// Find predefined professions that are similar to a custom string
function findSimilarPredefined(query: string, alreadySelected: string[]): [Profession, typeof PROFESSIONS[Profession]][] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  return ALL_PROFESSIONS.filter(([key, val]) =>
    !alreadySelected.includes(key) && (
      val.label.toLowerCase().includes(q) ||
      q.includes(val.label.toLowerCase().split(' ')[0]) ||
      key.replace(/-/g, ' ').includes(q) ||
      q.includes(key.replace(/-/g, '').slice(0, 4))
    )
  )
}

export default function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)

  // Login
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Signup
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPass, setSignupPass] = useState('')

  // Profession multi-select (string[] to support custom "other" entries)
  const [selectedProfessions, setSelectedProfessions] = useState<string[]>([])
  const [professionSearch, setProfessionSearch] = useState('')
  // When adding a custom "other" profession, track if we showed the similar warning
  const [customConfirmed, setCustomConfirmed] = useState(false)

  // Forgot
  const [forgotEmail, setForgotEmail] = useState('')

  const searchTrimmed = professionSearch.trim()
  const atMax = selectedProfessions.length >= MAX_PROFESSIONS

  // Predefined suggestions matching the current search
  const predefinedSuggestions = ALL_PROFESSIONS.filter(([key, val]) =>
    !selectedProfessions.includes(key) &&
    (searchTrimmed === '' ||
      val.label.toLowerCase().includes(searchTrimmed.toLowerCase()) ||
      key.toLowerCase().includes(searchTrimmed.toLowerCase()))
  )

  // Whether to show the "Other: add as custom" option
  const hasExactPredefinedMatch = ALL_PROFESSIONS.some(([, val]) =>
    val.label.toLowerCase() === searchTrimmed.toLowerCase()
  )
  const showOtherOption =
    !atMax &&
    searchTrimmed.length >= 2 &&
    !hasExactPredefinedMatch &&
    !selectedProfessions.some(p => p.toLowerCase() === searchTrimmed.toLowerCase())

  // Similar predefined professions to warn about before adding a custom one
  const similarToCustom = findSimilarPredefined(searchTrimmed, selectedProfessions)
  const showSimilarWarning = showOtherOption && similarToCustom.length > 0 && !customConfirmed

  function addPredefined(key: Profession) {
    if (atMax) return
    setSelectedProfessions(prev => prev.includes(key) ? prev : [...prev, key])
    setProfessionSearch('')
    setCustomConfirmed(false)
  }

  function addCustom() {
    if (!searchTrimmed || atMax) return
    setSelectedProfessions(prev => [...prev, searchTrimmed])
    setProfessionSearch('')
    setCustomConfirmed(false)
  }

  function remove(p: string) {
    setSelectedProfessions(prev => prev.filter(x => x !== p))
  }

  // Label to display for a profession (predefined label or raw custom string)
  function profLabel(p: string) {
    const found = ALL_PROFESSIONS.find(([key]) => key === p)
    return found ? found[1].label : p
  }

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
      return toast.error('Please fill in required fields')
    if (signupPass.length < 6) return toast.error('Password must be at least 6 characters')
    if (selectedProfessions.length === 0) return toast.error('Please select at least one profession')
    const cleanUser = username.replace('@', '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: signupEmail, password: signupPass,
      options: { data: { full_name: `${firstName} ${lastName}`.trim(), username: cleanUser } },
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    // Primary profession = first predefined one selected, or null if all are custom
    const primaryProfession = (selectedProfessions.find(p =>
      ALL_PROFESSIONS.some(([key]) => key === p)
    ) ?? null) as Profession | null
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({
        profession: primaryProfession,
        professions: selectedProfessions,
        is_pro: true,
      }).eq('id', user.id)
    }
    toast.success('Welcome to Only Creators!')
    setLoading(false)
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    if (!forgotEmail) return toast.error('Please enter your email address')
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
      {/* Brand panel */}
      <div className="auth-brand">
        <div className="auth-brand-logo">only <em>creators</em></div>
        <div className="auth-brand-headline">Where professionals recognize each other.</div>
        <p className="auth-brand-sub" style={{ marginTop:12 }}>
          Share your craft. Earn peer recognition from verified creators in your discipline — not just generic likes.
        </p>
        <div className="auth-brand-stats">
          <div><div className="auth-stat-num">8+</div><div className="auth-stat-label">Disciplines</div></div>
          <div><div className="auth-stat-num">Free</div><div className="auth-stat-label">Always</div></div>
          <div><div className="auth-stat-num">Real</div><div className="auth-stat-label">Connections</div></div>
        </div>
      </div>

      {/* Form panel */}
      <div className="auth-form-area">

        {/* FORGOT PASSWORD */}
        {mode === 'forgot' && (
          <>
            <div style={{ marginBottom:24 }}>
              <button className="btn btn-ghost btn-sm" style={{ marginBottom:16, gap:6 }} onClick={() => { setMode('login'); setForgotSent(false) }}>
                <span style={{ display:'flex', width:14, height:14 }}><Icon.ArrowLeft /></span> Back to sign in
              </button>
              <div className="auth-form-title">Reset your password</div>
              <div className="auth-form-sub">We'll send a reset link to your email address</div>
            </div>
            {forgotSent ? (
              <div style={{ background:'var(--green-50)', border:'1px solid #bbf7d0', borderRadius:'var(--r-lg)', padding:20, textAlign:'center' }}>
                <div style={{ width:48, height:48, background:'var(--green-500)', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', color:'white' }}>
                  <span style={{ display:'flex', width:22, height:22 }}><Icon.Mail /></span>
                </div>
                <div style={{ fontWeight:600, marginBottom:4, color:'var(--green-600)' }}>Check your email</div>
                <div style={{ fontSize:13, color:'var(--gray-600)', lineHeight:1.6 }}>
                  We sent a password reset link to <strong>{forgotEmail}</strong>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop:14 }} onClick={() => { setMode('login'); setForgotSent(false) }}>Back to sign in</button>
              </div>
            ) : (
              <form onSubmit={handleForgot}>
                <div className="field">
                  <label className="field-label">Email address</label>
                  <input className="field-input" type="email" placeholder="you@example.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                </div>
                <button className="btn btn-primary btn-full" type="submit" disabled={loading} style={{ marginTop:4 }}>
                  {loading ? <span className="spinner" /> : 'Send reset link'}
                </button>
              </form>
            )}
          </>
        )}

        {/* LOGIN / SIGNUP */}
        {mode !== 'forgot' && (
          <>
            <div className="auth-form-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</div>
            <div className="auth-form-sub">{mode === 'login' ? 'Sign in to your creator account' : 'Join the creator community — it\'s free'}</div>

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
                <div className="field" style={{ position:'relative' }}>
                  <label className="field-label">Password</label>
                  <input className="field-input" type={showPass ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required style={{ paddingRight:40 }} />
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{ position:'absolute', right:12, top:32, background:'none', border:'none', cursor:'pointer', color:'var(--color-text-3)', display:'flex', width:16, height:16 }}>
                    {showPass ? <Icon.EyeOff /> : <Icon.Eye />}
                  </button>
                </div>
                <button type="button" className="forgot-link" onClick={() => setMode('forgot')}>Forgot password?</button>
                <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
                  {loading ? <span className="spinner" /> : <>Sign in <span style={{ display:'flex', width:14, height:14 }}><Icon.ArrowRight /></span></>}
                </button>
                <div className="or-divider">or</div>
                <button type="button" className="btn btn-ghost btn-full" onClick={() => setMode('signup')}>Create a new account</button>
              </form>
            ) : (
              <form onSubmit={handleSignup} style={{ overflowY:'auto' }}>
                <div className="field-row">
                  <div className="field"><label className="field-label">First name *</label><input className="field-input" placeholder="Alex" value={firstName} onChange={e => setFirstName(e.target.value)} required /></div>
                  <div className="field"><label className="field-label">Last name</label><input className="field-input" placeholder="Rivera" value={lastName} onChange={e => setLastName(e.target.value)} /></div>
                </div>
                <div className="field"><label className="field-label">Username *</label><input className="field-input" placeholder="@yourname" value={username} onChange={e => setUsername(e.target.value)} required /></div>
                <div className="field"><label className="field-label">Email address *</label><input className="field-input" type="email" placeholder="you@example.com" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} required /></div>
                <div className="field" style={{ position:'relative' }}>
                  <label className="field-label">Password *</label>
                  <input className="field-input" type={showPass ? 'text' : 'password'} placeholder="Min. 6 characters" value={signupPass} onChange={e => setSignupPass(e.target.value)} required style={{ paddingRight:40 }} />
                  <button type="button" onClick={() => setShowPass(v => !v)} style={{ position:'absolute', right:12, top:32, background:'none', border:'none', cursor:'pointer', color:'var(--color-text-3)', display:'flex', width:16, height:16 }}>
                    {showPass ? <Icon.EyeOff /> : <Icon.Eye />}
                  </button>
                </div>

                {/* ── PROFESSION SELECTOR (mandatory) ── */}
                <div className="pro-callout">
                  <div className="pro-callout-title">
                    <span style={{ display:'flex', width:14, height:14 }}><Icon.Award /></span>
                    What are you a creator of? *
                    <span style={{ marginLeft:'auto', fontSize:10, color:'var(--color-text-3)', fontWeight:400 }}>
                      {selectedProfessions.length}/{MAX_PROFESSIONS}
                    </span>
                  </div>
                  <p>Choose up to {MAX_PROFESSIONS} disciplines. The first will be your primary for Pro Upvotes.</p>

                  {/* Selected chips */}
                  {selectedProfessions.length > 0 && (
                    <div className="prof-chips">
                      {selectedProfessions.map((p, i) => (
                        <div key={p} className="prof-chip">
                          <span>{profLabel(p)}</span>
                          {i === 0 && <span className="prof-chip-primary">primary</span>}
                          <button type="button" className="prof-chip-remove" onClick={() => remove(p)}>
                            <Icon.X />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Search input — hidden when at max */}
                  {!atMax && (
                    <div className="field" style={{ marginTop:10, marginBottom:0 }}>
                      <label className="field-label">
                        {selectedProfessions.length === 0 ? 'Select your discipline *' : 'Add another discipline'}
                      </label>
                      <input
                        className={`field-input ${selectedProfessions.length === 0 ? 'field-input-required' : ''}`}
                        placeholder="Type to search, or scroll below…"
                        value={professionSearch}
                        onChange={e => { setProfessionSearch(e.target.value); setCustomConfirmed(false) }}
                        autoComplete="off"
                      />
                    </div>
                  )}
                  {atMax && (
                    <div style={{ fontSize:12, color:'var(--color-text-3)', marginTop:8, textAlign:'center' }}>
                      Maximum of {MAX_PROFESSIONS} disciplines reached
                    </div>
                  )}

                  {/* Predefined suggestion pills */}
                  {!atMax && predefinedSuggestions.length > 0 && (
                    <div className="prof-suggestions">
                      {predefinedSuggestions.map(([key, val]) => (
                        <button key={key} type="button" className="prof-suggestion-pill" onClick={() => addPredefined(key)}>
                          {val.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* "Other" option — shown when typed text has no predefined match */}
                  {showOtherOption && (
                    <div className="prof-other-section">
                      {/* Similar predefined warning */}
                      {showSimilarWarning ? (
                        <div className="prof-similar-warning">
                          <div className="prof-similar-warning-title">Did you mean one of these?</div>
                          <div className="prof-suggestions" style={{ marginTop:6 }}>
                            {similarToCustom.map(([key, val]) => (
                              <button key={key} type="button" className="prof-suggestion-pill" onClick={() => addPredefined(key)}>
                                {val.label}
                              </button>
                            ))}
                          </div>
                          <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:12, color:'var(--color-text-3)' }}>Not what you're looking for?</span>
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => setCustomConfirmed(true)}
                            >
                              Add "{searchTrimmed}" anyway
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="prof-other-btn"
                          onClick={addCustom}
                        >
                          <span style={{ display:'flex', width:12, height:12 }}><Icon.Plus /></span>
                          Add "{searchTrimmed}" as Other
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <button
                  className="btn btn-primary btn-full"
                  type="submit"
                  disabled={loading || selectedProfessions.length === 0}
                  style={{ marginTop:16 }}
                >
                  {loading ? <span className="spinner" /> : <>Create account <span style={{ display:'flex', width:14, height:14 }}><Icon.ArrowRight /></span></>}
                </button>
                {selectedProfessions.length === 0 && (
                  <div style={{ fontSize:11, color:'var(--red-500)', textAlign:'center', marginTop:6 }}>
                    Select at least one discipline to continue
                  </div>
                )}
              </form>
            )}
          </>
        )}

        <p style={{ marginTop:20, fontSize:11, color:'var(--color-text-3)', textAlign:'center', lineHeight:1.7 }}>
          By continuing you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
