import { type FormEvent, type KeyboardEvent, type RefObject, useEffect, useRef, useState } from 'react'

import { ApiError, api, type UserProfile } from './api/client'
import { clearSession, readSession, saveSession, type AuthSession } from './auth/session'
import { OtpInput } from './OtpInput'

type View = 'login' | 'register' | 'email-verification' | 'reset-request' | 'reset-confirmation'
type State = 'idle' | 'loading' | 'success' | 'error'

const eligibleEmail = /^[^@]+@(u\.nus\.edu|u\.duke\.nus\.edu|u\.yale-nus\.edu\.sg)$/i
const emailFormat = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const verificationCooldownKey = (email: string) => `foc.email-verification-resend:${email.trim().toLowerCase()}`

function PasswordInput({
  value, onChange, disabled, invalid, autoComplete, inputRef, onKeyDown,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  invalid: boolean
  autoComplete?: string
  inputRef?: RefObject<HTMLInputElement | null>
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
}) {
  const [visible, setVisible] = useState(false)
  return <span className="password-control">
    <input ref={inputRef} type={visible ? 'text' : 'password'} autoComplete={autoComplete} value={value}
      onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown} disabled={disabled} aria-invalid={invalid} />
    <button type="button" className="password-toggle" aria-label={visible ? 'Hide password' : 'Show password'}
      aria-pressed={visible} onClick={() => setVisible(current => !current)} disabled={disabled}>
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false"><path d="M2.2 12s3.4-6 9.8-6 9.8 6 9.8 6-3.4 6-9.8 6-9.8-6-9.8-6Z" /><circle cx="12" cy="12" r="2.8" />{visible && <path d="m4 4 16 16" />}</svg>
    </button>
  </span>
}

export function App() {
  const [view, setView] = useState<View>('login')
  const [session, setSession] = useState<AuthSession | null>(() => readSession())
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileMessage, setProfileMessage] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginState, setLoginState] = useState<State>('idle')
  const [loginMessage, setLoginMessage] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [registrationState, setRegistrationState] = useState<State>('idle')
  const [registrationMessage, setRegistrationMessage] = useState('')
  const [verificationEmail, setVerificationEmail] = useState('')
  const [verificationDigits, setVerificationDigits] = useState<string[]>(() => Array(6).fill(''))
  const [verificationState, setVerificationState] = useState<State>('idle')
  const [verificationMessage, setVerificationMessage] = useState('')
  const [verificationFocusVersion, setVerificationFocusVersion] = useState(0)
  const [resendState, setResendState] = useState<State>('idle')
  const [resendMessage, setResendMessage] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetRequestState, setResetRequestState] = useState<State>('idle')
  const [resetRequestMessage, setResetRequestMessage] = useState('')
  const [resetConfirmationState, setResetConfirmationState] = useState<State>('idle')
  const [resetConfirmationMessage, setResetConfirmationMessage] = useState('')
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const verificationInFlight = useRef(false)
  const loginPasswordRef = useRef<HTMLInputElement>(null)
  const registrationUsernameRef = useRef<HTMLInputElement>(null)
  const registrationPasswordRef = useRef<HTMLInputElement>(null)
  const resetCodeRef = useRef<HTMLInputElement>(null)
  const newPasswordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!session) {
      return
    }

    let cancelled = false
    void api.getProfile()
      .then(value => {
        if (!cancelled) {
          setProfile(value)
          setProfileMessage('')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfileMessage('Unable to load your profile. Please sign out and sign in again.')
        }
      })

    return () => { cancelled = true }
  }, [session])

  useEffect(() => {
    if (!resendAvailableAt) {
      return
    }
    const timer = window.setInterval(() => {
      const now = Date.now()
      setCurrentTime(now)
      if (now >= resendAvailableAt) {
        window.clearInterval(timer)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resendAvailableAt])

  const resendSecondsRemaining = resendAvailableAt
    ? Math.max(0, Math.ceil((resendAvailableAt - currentTime) / 1000))
    : 0

  const show = (nextView: View) => {
    setView(nextView)
    setLoginState('idle')
    setLoginMessage('')
    setRegistrationState('idle')
    setRegistrationMessage('')
    setVerificationState('idle')
    setVerificationMessage('')
    setResendState('idle')
    setResendMessage('')
    setResetRequestState('idle')
    setResetRequestMessage('')
    setResetConfirmationState('idle')
    setResetConfirmationMessage('')
  }

  const startResendCooldown = (emailAddress: string, seconds = 90) => {
    const deadline = Date.now() + seconds * 1000
    sessionStorage.setItem(verificationCooldownKey(emailAddress), String(deadline))
    setResendAvailableAt(deadline)
    setCurrentTime(Date.now())
  }

  const restoreResendCooldown = (emailAddress: string) => {
    const deadline = Number(sessionStorage.getItem(verificationCooldownKey(emailAddress)))
    setResendAvailableAt(Number.isFinite(deadline) && deadline > Date.now() ? deadline : null)
    setCurrentTime(Date.now())
  }

  const focusOnEnter = (event: KeyboardEvent<HTMLInputElement>, next: RefObject<HTMLInputElement | null>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      next.current?.focus()
    }
  }

  const login = async (event: FormEvent) => {
    event.preventDefault()
    if (!eligibleEmail.test(loginEmail)) {
      setLoginState('error')
      setLoginMessage('Use an eligible NUS student email.')
      return
    }
    if (!loginPassword) {
      setLoginState('error')
      setLoginMessage('Password is required.')
      return
    }
    setLoginState('loading')
    setLoginMessage('')
    setProfile(null)
    setProfileMessage('')
    try {
      const nextSession = await api.login({ email: loginEmail, password: loginPassword })
      saveSession(nextSession)
      setSession(nextSession)
      setLoginState('success')
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_VERIFICATION_REQUIRED') {
        show('email-verification')
        setVerificationEmail(loginEmail.trim())
        restoreResendCooldown(loginEmail)
        setLoginPassword('')
        return
      }
      setLoginState('error')
      setLoginMessage('Unable to sign in with those credentials.')
    }
  }

  const register = async (event: FormEvent) => {
    event.preventDefault()
    if (!eligibleEmail.test(email)) {
      setRegistrationState('error')
      setRegistrationMessage('Use an eligible NUS student email.')
      return
    }
    if (!username.trim() || username.length > 20) {
      setRegistrationState('error')
      setRegistrationMessage('Username is required and must be at most 20 characters.')
      return
    }
    if (password.length < 15 || password.length > 64) {
      setRegistrationState('error')
      setRegistrationMessage('Password must be 15 to 64 characters.')
      return
    }
    setRegistrationState('loading')
    setRegistrationMessage('')
    try {
      await api.register({ email, username, password })
      setVerificationEmail(email)
      setVerificationDigits(Array(6).fill(''))
      startResendCooldown(email)
      show('email-verification')
    } catch (error) {
      setRegistrationState('error')
      setRegistrationMessage(error instanceof ApiError && error.status === 400
        ? error.message
        : 'Registration could not be completed. Please try again.')
    }
  }

  const verifyEmail = async (completedCode?: string) => {
    if (verificationInFlight.current) {
      return
    }
    if (!eligibleEmail.test(verificationEmail)) {
      setVerificationState('error')
      setVerificationMessage('Use an eligible NUS student email.')
      return
    }
    const verificationCode = completedCode ?? verificationDigits.join('')
    if (!/^\d{6}$/.test(verificationCode)) {
      setVerificationState('error')
      setVerificationMessage('Enter the six-digit code from your email.')
      return
    }
    verificationInFlight.current = true
    setVerificationState('loading')
    setVerificationMessage('')
    try {
      await api.verifyEmail({ email: verificationEmail, code: verificationCode })
      setVerificationState('success')
      setVerificationMessage('Email verified. You can now sign in.')
      setVerificationDigits(Array(6).fill(''))
    } catch (error) {
      setVerificationState('error')
      setVerificationMessage(error instanceof ApiError
        ? error.message
        : 'Unable to verify your email right now. Please try again.')
      if (error instanceof ApiError) {
        setVerificationDigits(Array(6).fill(''))
        setVerificationFocusVersion(version => version + 1)
      }
    } finally {
      verificationInFlight.current = false
    }
  }

  const resendVerification = async () => {
    if (resendSecondsRemaining > 0) {
      return
    }
    if (!eligibleEmail.test(verificationEmail)) {
      setResendState('error')
      setResendMessage('Use an eligible NUS student email.')
      return
    }
    setResendState('loading')
    setResendMessage('')
    try {
      await api.resendEmailVerification({ email: verificationEmail })
      setResendState('success')
      setResendMessage('A new verification code has been sent.')
      startResendCooldown(verificationEmail)
    } catch (error) {
      setResendState('error')
      if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds) {
        setResendMessage(`Please wait ${error.retryAfterSeconds} seconds before requesting another code.`)
        startResendCooldown(verificationEmail, error.retryAfterSeconds)
      } else {
        setResendMessage(error instanceof ApiError ? error.message : 'Unable to resend a verification code right now. Please try again.')
      }
    }
  }

  const requestPasswordReset = async (event: FormEvent) => {
    event.preventDefault()
    if (!emailFormat.test(resetEmail)) {
      setResetRequestState('error')
      setResetRequestMessage('Enter a valid email address.')
      return
    }
    setResetRequestState('loading')
    setResetRequestMessage('')
    try {
      await api.requestPasswordReset({ email: resetEmail })
      setResetRequestState('success')
      setResetRequestMessage('If an eligible active account matches that email, a reset code has been sent.')
    } catch {
      setResetRequestState('error')
      setResetRequestMessage('Unable to request a password reset right now. Please try again.')
    }
  }

  const confirmPasswordReset = async (event: FormEvent) => {
    event.preventDefault()
    if (!emailFormat.test(resetEmail)) {
      setResetConfirmationState('error')
      setResetConfirmationMessage('Enter a valid email address.')
      return
    }
    if (!/^\d{6}$/.test(resetCode)) {
      setResetConfirmationState('error')
      setResetConfirmationMessage('Enter the six-digit code from your email.')
      return
    }
    if (newPassword.length < 15 || newPassword.length > 64) {
      setResetConfirmationState('error')
      setResetConfirmationMessage('Password must be 15 to 64 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setResetConfirmationState('error')
      setResetConfirmationMessage('Passwords do not match.')
      return
    }
    setResetConfirmationState('loading')
    setResetConfirmationMessage('')
    try {
      await api.confirmPasswordReset({ email: resetEmail, code: resetCode, password: newPassword })
      setResetConfirmationState('success')
      setResetConfirmationMessage('Your password has been updated. You can now sign in.')
      setResetCode('')
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setResetConfirmationState('error')
      setResetConfirmationMessage('The code is invalid or expired. Request a new code and try again.')
    }
  }

  if (session) {
    const displayedProfile = profile?.userId === session.userId ? profile : null
    return <main><section aria-labelledby="profile-title">
      <p className="eyebrow">Friend on Campus</p>
      <h1 id="profile-title">Your profile</h1>
      <p className="intro">Your account details are read from Friend on Campus.</p>
      {!displayedProfile && !profileMessage && <p role="status">Loading your profile…</p>}
      {profileMessage && <p role="alert" className="error">{profileMessage}</p>}
      {displayedProfile && <dl className="identity-card">
        <div><dt>Email</dt><dd>{displayedProfile.email}</dd></div>
        <div><dt>Username</dt><dd>{displayedProfile.username}</dd></div>
        <div><dt>Role</dt><dd>{displayedProfile.role}</dd></div>
        <div><dt>Account status</dt><dd>{displayedProfile.status}</dd></div>
        <div><dt>Member since</dt><dd>{new Date(displayedProfile.createdAt).toLocaleString()}</dd></div>
      </dl>}
      <button type="button" className="secondary" onClick={() => { clearSession(); setSession(null); show('login') }}>Sign out</button>
    </section></main>
  }

  const busy = loginState === 'loading' || registrationState === 'loading'
    || verificationState === 'loading' || resendState === 'loading'
    || resetRequestState === 'loading' || resetConfirmationState === 'loading'

  return <main><section aria-labelledby="account-title">
    <p className="eyebrow">Friend on Campus</p>
    {(view === 'login' || view === 'register') && <nav className="tabs" aria-label="Account actions">
      <button type="button" aria-pressed={view === 'login'} className={view === 'login' ? 'tab active' : 'tab'} onClick={() => show('login')}>Sign in</button>
      <button type="button" aria-pressed={view === 'register'} className={view === 'register' ? 'tab active' : 'tab'} onClick={() => show('register')}>Create account</button>
    </nav>}

    {view === 'login' && <form onSubmit={login} noValidate aria-busy={busy} aria-label="Sign in form">
      <h1 id="account-title">Sign in</h1>
      <p className="intro">Use your NUS student email to continue.</p>
      <label>Email<input type="email" autoFocus value={loginEmail} onChange={event => setLoginEmail(event.target.value)} onKeyDown={event => focusOnEnter(event, loginPasswordRef)} disabled={busy} aria-invalid={loginState === 'error'} /></label>
      <label>Password<PasswordInput value={loginPassword} onChange={setLoginPassword} inputRef={loginPasswordRef} disabled={busy} invalid={loginState === 'error'} autoComplete="current-password" /></label>
      <button disabled={busy}>{loginState === 'loading' ? 'Signing in…' : 'Sign in'}</button>
      <button type="button" className="text-button" onClick={() => show('reset-request')}>Forgot password?</button>
      {loginMessage && <p role="alert" className="error">{loginMessage}</p>}
    </form>}

    {view === 'register' && <form onSubmit={register} noValidate aria-busy={busy} aria-label="Create account form">
      <h1 id="account-title">Create your account</h1>
      <p className="intro">Use your NUS student email to join the campus community.</p>
      <label>Email<input type="email" autoFocus value={email} onChange={event => setEmail(event.target.value)} onKeyDown={event => focusOnEnter(event, registrationUsernameRef)} disabled={busy} aria-invalid={registrationState === 'error'} /></label>
      <label>Username<input ref={registrationUsernameRef} value={username} maxLength={20} onChange={event => setUsername(event.target.value)} onKeyDown={event => focusOnEnter(event, registrationPasswordRef)} disabled={busy} aria-invalid={registrationState === 'error'} /></label>
      <label>Password<PasswordInput value={password} onChange={setPassword} inputRef={registrationPasswordRef} disabled={busy} invalid={registrationState === 'error'} autoComplete="new-password" /></label>
      <button disabled={busy}>{registrationState === 'loading' ? 'Creating account…' : 'Create account'}</button>
      {registrationMessage && <p role={registrationState === 'error' ? 'alert' : 'status'} className={registrationState}>{registrationMessage}</p>}
    </form>}

    {view === 'email-verification' && <form onSubmit={event => { event.preventDefault(); void verifyEmail() }} noValidate aria-busy={busy} aria-label="Verify email form">
      <h1 id="account-title">Verify your email</h1>
      <p className="intro">Enter the six-digit code sent to your NUS email. You must verify your email before you can sign in.</p>
      <p className="verification-email">Verification code sent to <strong>{verificationEmail}</strong>.</p>
      <label>Verification code<OtpInput value={verificationDigits} onChange={setVerificationDigits} onComplete={code => { void verifyEmail(code) }} focusFirst={verificationFocusVersion} disabled={busy} invalid={verificationState === 'error'} /></label>
      {verificationMessage && <p role={verificationState === 'error' ? 'alert' : 'status'} className={verificationState}>{verificationMessage}</p>}
      {verificationState === 'success' && <button type="button" className="secondary" onClick={() => show('login')}>Sign in</button>}
      {verificationState !== 'success' && <>
        <button type="button" className="secondary" disabled={busy || resendSecondsRemaining > 0} onClick={resendVerification}>{resendState === 'loading' ? 'Sending…' : resendSecondsRemaining > 0 ? `Resend in ${resendSecondsRemaining}s` : 'Resend verification code'}</button>
        {resendMessage && <p role={resendState === 'error' ? 'alert' : 'status'} className={resendState}>{resendMessage}</p>}
      </>}
      <button type="button" className="text-button" onClick={() => show('login')}>Back to sign in</button>
    </form>}

    {view === 'reset-request' && <form onSubmit={requestPasswordReset} noValidate aria-busy={busy} aria-label="Request password reset form">
      <h1 id="account-title">Reset your password</h1>
      <p className="intro">Enter your email and we’ll send a reset code if an eligible active account matches it.</p>
      <label>Email<input type="email" autoFocus autoComplete="email" value={resetEmail} onChange={event => setResetEmail(event.target.value)} disabled={busy} aria-invalid={resetRequestState === 'error'} /></label>
      <button disabled={busy}>{resetRequestState === 'loading' ? 'Sending…' : 'Send reset code'}</button>
      {resetRequestMessage && <p role={resetRequestState === 'error' ? 'alert' : 'status'} className={resetRequestState}>{resetRequestMessage}</p>}
      {resetRequestState === 'success' && <button type="button" className="secondary" onClick={() => show('reset-confirmation')}>Enter reset code</button>}
      <button type="button" className="text-button" onClick={() => show('login')}>Back to sign in</button>
    </form>}

    {view === 'reset-confirmation' && <form onSubmit={confirmPasswordReset} noValidate aria-busy={busy} aria-label="Confirm password reset form">
      <h1 id="account-title">Choose a new password</h1>
      <p className="intro">Enter the six-digit code sent to your email and choose a new password.</p>
      <label>Email<input type="email" autoComplete="email" value={resetEmail} onChange={event => setResetEmail(event.target.value)} onKeyDown={event => focusOnEnter(event, resetCodeRef)} disabled={busy} aria-invalid={resetConfirmationState === 'error'} /></label>
      <label>Reset code<input ref={resetCodeRef} autoFocus inputMode="numeric" autoComplete="one-time-code" value={resetCode} maxLength={6} onChange={event => setResetCode(event.target.value.replace(/\D/g, ''))} onKeyDown={event => focusOnEnter(event, newPasswordRef)} disabled={busy} aria-invalid={resetConfirmationState === 'error'} /></label>
      <label>New password<PasswordInput value={newPassword} onChange={setNewPassword} inputRef={newPasswordRef} onKeyDown={event => focusOnEnter(event, confirmPasswordRef)} disabled={busy} invalid={resetConfirmationState === 'error'} autoComplete="new-password" /></label>
      <label>Confirm new password<PasswordInput value={confirmPassword} onChange={setConfirmPassword} inputRef={confirmPasswordRef} disabled={busy} invalid={resetConfirmationState === 'error'} autoComplete="new-password" /></label>
      <button disabled={busy}>{resetConfirmationState === 'loading' ? 'Updating…' : 'Update password'}</button>
      {resetConfirmationMessage && <p role={resetConfirmationState === 'error' ? 'alert' : 'status'} className={resetConfirmationState}>{resetConfirmationMessage}</p>}
      {resetConfirmationState === 'success' && <button type="button" className="secondary" onClick={() => show('login')}>Sign in</button>}
      <button type="button" className="text-button" onClick={() => show('reset-request')}>Request another code</button>
    </form>}
  </section></main>
}
