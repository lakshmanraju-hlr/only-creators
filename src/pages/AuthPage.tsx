import { useState, useEffect, useRef } from 'react'
import { supabase, PROFESSIONS, Profession, DISCIPLINE_ALIASES } from '@/lib/supabase'
import { Icon } from '@/lib/icons'
import toast from 'react-hot-toast'

type AuthMode = 'login' | 'signup' | 'forgot'
type SignupStep = 1 | 2 | 3   // 1=account basics, 2=interests, 3=optional profession

const ALL_PROFESSIONS = Object.entries(PROFESSIONS) as [Profession, typeof PROFESSIONS[Profession]][]

// Interest tiles shown in step 2 — same as disciplines but framed as topics
const INTEREST_TILES = ALL_PROFESSIONS.map(([key, val]) => ({ key, label: val.label, icon: val.icon }))

function findSimilarPredefined(query: string): [Profession, typeof PROFESSIONS[Profession]][] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  const aliasCanonical = DISCIPLINE_ALIASES[q]
  return ALL_PROFESSIONS.filter(([key, val]) =>
    key === aliasCanonical ||
    val.label.toLowerCase().includes(q) ||
    q.includes(val.label.toLowerCase().split(' ')[0]) ||
    key.replace(/-/g, ' ').includes(q) ||
    q.includes(key.replace(/-/g, '').slice(0, 4))
  )
}

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

  // ── Signup multi-step ──────────────────────────────────────────
  const [step, setStep] = useState<SignupStep>(1)

  // Step 1 — basics
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPass, setSignupPass] = useState('')

  // Step 2 — interests (required: 1+, encouraged: 3-5)
  const [interests, setInterests] = useState<string[]>([])

  // Step 3 — optional profession / persona
  const [wantProfession, setWantProfession] = useState<boolean | null>(null)
  const [selectedProfession, setSelectedProfession] = useState<string | null>(null)
  const [professionSearch, setProfessionSearch] = useState('')
  const [customConfirmed, setCustomConfirmed] = useState(false)
  const [existingCustom, setExistingCustom] = useState<string[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const searchTrimmed = professionSearch.trim()

  const predefinedSuggestions = ALL_PROFESSIONS.filter(([key, val]) =>
    key !== selectedProfession &&
    (searchTrimmed === '' ||
      val.label.toLowerCase().includes(searchTrimmed.toLowerCase()) ||
      key.toLowerCase().includes(searchTrimmed.toLowerCase()))
  )

  const hasExactPredefinedMatch = ALL_PROFESSIONS.some(([, val]) =>
    val.label.toLowerCase() === searchTrimmed.toLowerCase()
  )
  const hasExactCustomMatch = existingCustom.some(d => d.toLowerCase() === searchTrimmed.toLowerCase())
  const showOtherOption =
    searchTrimmed.length >= 2 && !hasExactPredefinedMatch && !hasExactCustomMatch &&
    selectedProfession?.toLowerCase() !== searchTrimmed.toLowerCase()
  const similarToPredefined = findSimilarPredefined(searchTrimmed)
  const matchingExistingCustom = existingCustom.filter(d =>
    d.toLowerCase() !== selectedProfession?.toLowerCase() &&
    d.toLowerCase().includes(searchTrimmed.toLowerCase()) &&
    searchTrimmed.length >= 2
  )
  const showSimilarWarning = showOtherOption && (similarToPredefined.length > 0 || matchingExistingCustom.length > 0) && !customConfirmed

  useEffect(() => {
    if (searchTrimmed.length < 2) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('profession')
        .not('profession', 'is', null).ilike('profession', `%${searchTrimmed}%`).limit(10)
      if (!data) return
      const predefinedKeys = new Set<string>(ALL_PROFESSIONS.map(([k]) => k))
      const customs = [...new Set((data as any[]).map(p => p.profession as string).filter(p => !predefinedKeys.has(p)))]
      setExistingCustom(customs)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchTrimmed])

  function toggleInterest(key: string) {
    setInterests(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
  }

  function selectPredefined(key: Profession) {
    setSelectedProfession(key); setProfessionSearch(''); setCustomConfirmed(false)
  }
  function selectCustom(value: string) {
    setSelectedProfession(value); setProfessionSearch(''); setCustomConfirmed(false)
  }
  function clearProfession() {
    setSelectedProfession(null); setProfessionSearch(''); setCustomConfirmed(false)
  }
  function profLabel(p: string) {
    const found = ALL_PROFESSIONS.find(([key]) => key === p)
    return found ? found[1].label : p.charAt(0).toUpperCase() + p.slice(1).replace(/-/g, ' ')
  }

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

  function handleStep2() {
    if (interests.length === 0) return toast.error('Pick at least one topic to continue')
    setStep(3)
  }

  async function handleFinish() {
    setLoading(true)
    const cleanUser = username.replace('@', '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    const { error } = await supabase.auth.signUp({
      email: signupEmail, password: signupPass,
      options: { data: { full_name: `${firstName} ${lastName}`.trim(), username: cleanUser } },
    })
    if (error) { toast.error(error.message); setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const isPredefined = ALL_PROFESSIONS.some(([key]) => key === selectedProfession)
      await supabase.from('profiles').update({
        interests,
        ...(selectedProfession ? {
          profession: isPredefined ? selectedProfession as Profession : selectedProfession,
          professions: [selectedProfession],
          is_pro: true,
        } : {}),
      }).eq('id', user.id)

      // Create discipline persona record if profession selected
      if (selectedProfession) {
        await supabase.from('discipline_personas').upsert({
          user_id: user.id,
          discipline: selectedProfession,
          level: 'newcomer',
        }, { onConflict: 'user_id,discipline', ignoreDuplicates: true })
      }
    }
    toast.success('Welcome to Only Creators!')
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

  // ── Progress indicator ─────────────────────────────────────────
  function StepDots() {
    return (
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 24 }}>
        {([1, 2, 3] as SignupStep[]).map(s => (
          <div key={s} style={{
            width: s === step ? 20 : 8, height: 8, borderRadius: 4,
            background: s <= step ? 'var(--color-primary)' : 'var(--color-border)',
            transition: 'all 0.2s',
          }} />
        ))}
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="auth-brand-logo">only <em>creators</em></div>
        <div className="auth-brand-headline">One identity. Multiple disciplines.</div>
        <p className="auth-brand-sub" style={{ marginTop: 12 }}>
          Browse any field, post as a general user, or unlock your professional voice by activating a discipline persona. Your doctor can also be a chef — both audiences, one profile.
        </p>
        <div className="auth-brand-stats">
          <div><div className="auth-stat-num">19+</div><div className="auth-stat-label">Disciplines</div></div>
          <div><div className="auth-stat-num">Free</div><div className="auth-stat-label">Always</div></div>
          <div><div className="auth-stat-num">Real</div><div className="auth-stat-label">Peers</div></div>
        </div>
      </div>

      <div className="auth-form-area">
        {/* ── FORGOT ────────────────────────────────────────────── */}
        {mode === 'forgot' && (
          <>
            <div style={{ marginBottom: 24 }}>
              <button className="btn btn-ghost btn-sm" style={{ marginBottom: 16, gap: 6 }} onClick={() => { setMode('login'); setForgotSent(false) }}>
                <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.ArrowLeft /></span> Back
              </button>
              <div className="auth-form-title">Reset your password</div>
              <div className="auth-form-sub">We'll send a reset link to your email</div>
            </div>
            {forgotSent ? (
              <div style={{ background: 'var(--green-50)', border: '1px solid #bbf7d0', borderRadius: 'var(--r-lg)', padding: 20, textAlign: 'center' }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: 'var(--green-600)' }}>Check your email</div>
                <div style={{ fontSize: 13, color: 'var(--gray-600)', lineHeight: 1.6 }}>
                  We sent a reset link to <strong>{forgotEmail}</strong>
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => { setMode('login'); setForgotSent(false) }}>Back to sign in</button>
              </div>
            ) : (
              <form onSubmit={handleForgot}>
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

        {/* ── LOGIN / SIGNUP TABS ───────────────────────────────── */}
        {mode !== 'forgot' && (
          <>
            {mode === 'login' || (mode === 'signup' && step === 1) ? (
              <>
                <div className="auth-form-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</div>
                <div className="auth-form-sub">{mode === 'login' ? 'Sign in to continue' : "Join the community — it's free"}</div>
                <div className="seg-ctrl">
                  <button className={`seg-btn ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login') }}>Sign in</button>
                  <button className={`seg-btn ${mode === 'signup' ? 'active' : ''}`} onClick={() => { setMode('signup'); setStep(1) }}>Create account</button>
                </div>
              </>
            ) : null}

            {/* ── LOGIN FORM ──────────────────────────────────── */}
            {mode === 'login' && (
              <form onSubmit={handleLogin}>
                <div className="field">
                  <label className="field-label">Email address</label>
                  <input className="field-input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
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
                  <div className="field"><label className="field-label">First name *</label><input className="field-input" placeholder="Alex" value={firstName} onChange={e => setFirstName(e.target.value)} required /></div>
                  <div className="field"><label className="field-label">Last name</label><input className="field-input" placeholder="Rivera" value={lastName} onChange={e => setLastName(e.target.value)} /></div>
                </div>
                <div className="field">
                  <label className="field-label">Username *</label>
                  <input className="field-input" placeholder="@yourname" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
                <div className="field">
                  <label className="field-label">Email address *</label>
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

            {/* ── SIGNUP STEP 2: interests ─────────────────────── */}
            {mode === 'signup' && step === 2 && (
              <div>
                <StepDots />
                <div className="auth-form-title" style={{ marginBottom: 4 }}>What topics interest you?</div>
                <div className="auth-form-sub" style={{ marginBottom: 4 }}>Pick at least one. This shapes your feed from day one.</div>
                <div style={{ fontSize: 11, color: 'var(--color-primary)', marginBottom: 16, fontWeight: 500 }}>
                  {interests.length === 0 ? 'Select topics below' : `${interests.length} selected${interests.length >= 3 ? ' — great mix!' : ''}`}
                </div>

                <div className="pref-pill-grid" style={{ marginBottom: 20 }}>
                  {INTEREST_TILES.map(t => (
                    <button
                      key={t.key}
                      type="button"
                      className={`pref-pill ${interests.includes(t.key) ? 'active' : ''}`}
                      onClick={() => toggleInterest(t.key)}
                    >
                      <span>{t.icon}</span> {t.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(1)}>
                    <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.ArrowLeft /></span> Back
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 2 }}
                    onClick={handleStep2}
                    disabled={interests.length === 0}
                  >
                    Continue <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.ArrowRight /></span>
                  </button>
                </div>
              </div>
            )}

            {/* ── SIGNUP STEP 3: optional profession ──────────── */}
            {mode === 'signup' && step === 3 && (
              <div>
                <StepDots />
                <div className="auth-form-title" style={{ marginBottom: 4 }}>Are you a professional?</div>
                <div className="auth-form-sub" style={{ marginBottom: 20 }}>
                  Activating a discipline lets you make Pro Posts, get peer recognition, and build a second audience. You can always do this later.
                </div>

                {wantProfession === null && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                    <button
                      className="auth-persona-choice"
                      onClick={() => setWantProfession(true)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 24 }}>🎯</span>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>Yes, I'm a professional</div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>Add my discipline and unlock Pro Posts</div>
                        </div>
                        <span style={{ marginLeft: 'auto', display: 'flex', width: 14, height: 14, color: 'var(--color-text-3)' }}><Icon.ChevronRight /></span>
                      </div>
                    </button>
                    <button
                      className="auth-persona-choice"
                      onClick={() => setWantProfession(false)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 24 }}>👋</span>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>Just browsing for now</div>
                          <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 2 }}>Follow creators, explore content, post generally</div>
                        </div>
                        <span style={{ marginLeft: 'auto', display: 'flex', width: 14, height: 14, color: 'var(--color-text-3)' }}><Icon.ChevronRight /></span>
                      </div>
                    </button>
                  </div>
                )}

                {wantProfession === true && (
                  <div style={{ marginBottom: 16 }}>
                    <button
                      className="btn btn-ghost btn-xs"
                      style={{ marginBottom: 12, gap: 5 }}
                      onClick={() => { setWantProfession(null); clearProfession() }}
                    >
                      <span style={{ display: 'flex', width: 12, height: 12 }}><Icon.ArrowLeft /></span> Back
                    </button>

                    {selectedProfession ? (
                      <div style={{ marginBottom: 12 }}>
                        <div className="prof-chips">
                          <div className="prof-chip">
                            <span>{profLabel(selectedProfession)}</span>
                            <button type="button" className="prof-chip-remove" onClick={clearProfession}><Icon.X /></button>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginTop: 8, lineHeight: 1.6 }}>
                          You'll be able to make Pro Posts under this discipline and receive peer upvotes from verified {profLabel(selectedProfession)}s.
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="field" style={{ marginBottom: 8 }}>
                          <label className="field-label">Search your profession</label>
                          <input
                            className="field-input"
                            placeholder="e.g. photographer, doctor, chef…"
                            value={professionSearch}
                            onChange={e => { setProfessionSearch(e.target.value); setCustomConfirmed(false) }}
                            autoFocus
                            autoComplete="off"
                          />
                        </div>

                        {predefinedSuggestions.length > 0 && (
                          <div className="prof-suggestions">
                            {predefinedSuggestions.map(([key, val]) => (
                              <button key={key} type="button" className="prof-suggestion-pill" onClick={() => selectPredefined(key)}>
                                {val.icon} {val.label}
                              </button>
                            ))}
                          </div>
                        )}

                        {showOtherOption && showSimilarWarning && (
                          <div className="prof-similar-warning" style={{ marginTop: 8 }}>
                            <div className="prof-similar-warning-title">Did you mean one of these?</div>
                            <div className="prof-suggestions" style={{ marginTop: 6 }}>
                              {similarToPredefined.map(([key, val]) => (
                                <button key={key} type="button" className="prof-suggestion-pill" onClick={() => selectPredefined(key)}>
                                  {val.icon} {val.label}
                                </button>
                              ))}
                              {matchingExistingCustom.map(d => (
                                <button key={d} type="button" className="prof-suggestion-pill" onClick={() => selectCustom(d)}>
                                  {d.charAt(0).toUpperCase() + d.slice(1)}
                                </button>
                              ))}
                            </div>
                            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 12, color: 'var(--color-text-3)' }}>Not listed?</span>
                              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCustomConfirmed(true)}>
                                Add "{searchTrimmed}" anyway
                              </button>
                            </div>
                          </div>
                        )}

                        {showOtherOption && !showSimilarWarning && (
                          <div className="prof-other-section">
                            <button type="button" className="prof-other-btn" onClick={() => selectCustom(searchTrimmed)}>
                              <span style={{ display: 'flex', width: 12, height: 12 }}><Icon.Plus /></span>
                              Add "{searchTrimmed}" as new discipline
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  {wantProfession === null && (
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(2)}>
                      <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.ArrowLeft /></span> Back
                    </button>
                  )}
                  {(wantProfession === false || (wantProfession === true && selectedProfession)) && (
                    <button
                      className="btn btn-primary btn-full"
                      onClick={handleFinish}
                      disabled={loading}
                    >
                      {loading ? <span className="spinner" /> : <>Create account <span style={{ display: 'flex', width: 14, height: 14 }}><Icon.ArrowRight /></span></>}
                    </button>
                  )}
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
