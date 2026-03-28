import { useState, useEffect, useRef } from 'react'
import { supabase, PROFESSIONS, Profession } from '@/lib/supabase'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

type AuthMode = 'login' | 'signup' | 'forgot'

const ALL_PROFESSIONS = Object.entries(PROFESSIONS) as [Profession, typeof PROFESSIONS[Profession]][]

function findSimilarPredefined(query: string): [Profession, typeof PROFESSIONS[Profession]][] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  return ALL_PROFESSIONS.filter(([key, val]) =>
    val.label.toLowerCase().includes(q) ||
    q.includes(val.label.toLowerCase().split(' ')[0]) ||
    key.replace(/-/g, ' ').includes(q) ||
    q.includes(key.replace(/-/g, '').slice(0, 4))
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

  // Single mandatory profession
  const [selectedProfession, setSelectedProfession] = useState<string | null>(null)
  const [professionSearch, setProfessionSearch] = useState('')
  const [customConfirmed, setCustomConfirmed] = useState(false)

  // Existing custom disciplines from DB (for duplicate detection)
  const [existingCustom, setExistingCustom] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  // Forgot
  const [forgotEmail, setForgotEmail] = useState('')

  const searchTrimmed = professionSearch.trim()

  // Predefined suggestions filtered by search
  const predefinedSuggestions = ALL_PROFESSIONS.filter(([key, val]) =>
    key !== selectedProfession &&
    (searchTrimmed === '' ||
      val.label.toLowerCase().includes(searchTrimmed.toLowerCase()) ||
      key.toLowerCase().includes(searchTrimmed.toLowerCase()))
  )

  const hasExactPredefinedMatch = ALL_PROFESSIONS.some(([, val]) =>
    val.label.toLowerCase() === searchTrimmed.toLowerCase()
  )

  // Existing custom disciplines matching the search (DB duplicates)
  const matchingExistingCustom = existingCustom.filter(d =>
    d.toLowerCase() !== selectedProfession?.toLowerCase() &&
    d.toLowerCase().includes(searchTrimmed.toLowerCase()) &&
    searchTrimmed.length >= 2
  )

  const hasExactCustomMatch = existingCustom.some(
    d => d.toLowerCase() === searchTrimmed.toLowerCase()
  )

  const showOtherOption =
    searchTrimmed.length >= 2 &&
    !hasExactPredefinedMatch &&
    !hasExactCustomMatch &&
    selectedProfession?.toLowerCase() !== searchTrimmed.toLowerCase()

  const similarToPredefined = findSimilarPredefined(searchTrimmed)
  const showSimilarWarning = showOtherOption && (similarToPredefined.length > 0 || matchingExistingCustom.length > 0) && !customConfirmed

  // Load existing custom disciplines from DB (debounced on search change)
  useEffect(() => {
    if (searchTrimmed.length < 2) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('profession')
        .not('profession', 'is', null)
        .ilike('profession', `%${searchTrimmed}%`)
        .limit(10)
      if (!data) return
      const predefinedKeys = new Set<string>(ALL_PROFESSIONS.map(([k]) => k))
      const customs = [...new Set((data as any[]).map(p => p.profession as string).filter(p => !predefinedKeys.has(p)))]
      setExistingCustom(customs)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchTrimmed])

  function selectPredefined(key: Profession) {
    setSelectedProfession(key)
    setProfessionSearch('')
    setCustomConfirmed(false)
  }

  function selectCustom(value: string) {
    setSelectedProfession(value)
    setProfessionSearch('')
    setCustomConfirmed(false)
  }

  function clearSelection() {
    setSelectedProfession(null)
    setProfessionSearch('')
    setCustomConfirmed(false)
  }

  function profLabel(p: string) {
    const found = ALL_PROFESSIONS.find(([key]) => key === p)
    return found ? found[1].label : p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' ')
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
    if (!selectedProfession) return toast.error('Please select your discipline')
    const cleanUser = username.replace('@', '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email: signupEmail, password: signupPass,
      options: { data: { full_name: `${firstName} ${lastName}`.trim(), username: cleanUser } },
    })
    if (error) { toast.error(error.message); setLoading(false); return }
    const isPredefined = ALL_PROFESSIONS.some(([key]) => key === selectedProfession)
    const profession = isPredefined ? selectedProfession as Profession : selectedProfession
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({
        profession,
        professions: [selectedProfession],
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

                {/* ── PROFESSION SELECTOR (mandatory, single) ── */}
                <div className="pro-callout">
                  <div className="pro-callout-title">
                    <span style={{ display:'flex', width:14, height:14 }}><Icon.Award /></span>
                    What are you a creator of? *
                  </div>
                  <p>Choose your discipline. This determines who can give you Pro Upvotes.</p>

                  {/* Selected chip — shown when one is chosen */}
                  {selectedProfession ? (
                    <div className="prof-chips" style={{ marginTop:10 }}>
                      <div className="prof-chip">
                        <span>{profLabel(selectedProfession)}</span>
                        <button type="button" className="prof-chip-remove" onClick={clearSelection} title="Change discipline">
                          <Icon.X />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Search input */}
                      <div className="field" style={{ marginTop:10, marginBottom:0 }}>
                        <label className="field-label">Select your discipline *</label>
                        <input
                          className="field-input field-input-required"
                          placeholder="Type to search, or pick below…"
                          value={professionSearch}
                          onChange={e => { setProfessionSearch(e.target.value); setCustomConfirmed(false) }}
                          autoComplete="off"
                        />
                      </div>

                      {/* Predefined suggestion pills */}
                      {predefinedSuggestions.length > 0 && (
                        <div className="prof-suggestions">
                          {predefinedSuggestions.map(([key, val]) => (
                            <button key={key} type="button" className="prof-suggestion-pill" onClick={() => selectPredefined(key)}>
                              {val.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Exact custom match in DB — block and suggest */}
                      {hasExactCustomMatch && searchTrimmed.length >= 2 && (
                        <div className="group-duplicate-banner" style={{ marginTop:8 }}>
                          <span style={{ display:'flex', width:13, height:13, flexShrink:0, color:'var(--red-500)' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          </span>
                          <div style={{ flex:1 }}>
                            <strong>"{searchTrimmed}"</strong> already exists.
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              style={{ marginLeft:8, padding:'2px 8px', fontSize:11 }}
                              onClick={() => selectCustom(existingCustom.find(d => d.toLowerCase() === searchTrimmed.toLowerCase())!)}
                            >
                              Select it
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Similar warning — show existing options before allowing custom */}
                      {showOtherOption && showSimilarWarning && (
                        <div className="prof-similar-warning" style={{ marginTop:8 }}>
                          <div className="prof-similar-warning-title">Did you mean one of these?</div>
                          <div className="prof-suggestions" style={{ marginTop:6 }}>
                            {similarToPredefined.map(([key, val]) => (
                              <button key={key} type="button" className="prof-suggestion-pill" onClick={() => selectPredefined(key)}>
                                {val.label}
                              </button>
                            ))}
                            {matchingExistingCustom.map(d => (
                              <button key={d} type="button" className="prof-suggestion-pill" onClick={() => selectCustom(d)}>
                                {d.charAt(0).toUpperCase() + d.slice(1).replace(/-/g, ' ')}
                              </button>
                            ))}
                          </div>
                          <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:12, color:'var(--color-text-3)' }}>Not what you're looking for?</span>
                            <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCustomConfirmed(true)}>
                              Add "{searchTrimmed}" anyway
                            </button>
                          </div>
                        </div>
                      )}

                      {/* "Other" add button — shown after confirming no duplicates */}
                      {showOtherOption && !showSimilarWarning && (
                        <div className="prof-other-section">
                          <button type="button" className="prof-other-btn" onClick={() => selectCustom(searchTrimmed)}>
                            <span style={{ display:'flex', width:12, height:12 }}><Icon.Plus /></span>
                            Add "{searchTrimmed}" as new discipline
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>

                <button
                  className="btn btn-primary btn-full"
                  type="submit"
                  disabled={loading || !selectedProfession}
                  style={{ marginTop:16 }}
                >
                  {loading ? <span className="spinner" /> : <>Create account <span style={{ display:'flex', width:14, height:14 }}><Icon.ArrowRight /></span></>}
                </button>
                {!selectedProfession && (
                  <div style={{ fontSize:11, color:'var(--red-500)', textAlign:'center', marginTop:6 }}>
                    Select a discipline to continue
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
