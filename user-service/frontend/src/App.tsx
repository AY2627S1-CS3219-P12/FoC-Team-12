import { type FormEvent, useState } from 'react'

import { ApiError, api } from './api/client'
import { clearSession, readSession, saveSession, type AuthSession } from './auth/session'

type View = 'login' | 'register' | 'reset-request' | 'reset-confirmation'
type State = 'idle' | 'loading' | 'success' | 'error'

const eligibleEmail = /^[^@]+@(u\.nus\.edu|u\.duke\.nus\.edu|u\.yale-nus\.edu\.sg)$/i
const emailFormat = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function App() {
  const [view, setView] = useState<View>('login')
  const [session, setSession] = useState<AuthSession | null>(() => readSession())
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginState, setLoginState] = useState<State>('idle')
  const [loginMessage, setLoginMessage] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [registrationState, setRegistrationState] = useState<State>('idle')
  const [registrationMessage, setRegistrationMessage] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetRequestState, setResetRequestState] = useState<State>('idle')
  const [resetRequestMessage, setResetRequestMessage] = useState('')
  const [resetConfirmationState, setResetConfirmationState] = useState<State>('idle')
  const [resetConfirmationMessage, setResetConfirmationMessage] = useState('')

  const show = (nextView: View) => {
    setView(nextView)
    setLoginState('idle')
    setLoginMessage('')
    setRegistrationState('idle')
    setRegistrationMessage('')
    setResetRequestState('idle')
    setResetRequestMessage('')
    setResetConfirmationState('idle')
    setResetConfirmationMessage('')
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
    try {
      const nextSession = await api.login({ email: loginEmail, password: loginPassword })
      saveSession(nextSession)
      setSession(nextSession)
      setLoginState('success')
    } catch {
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
      setRegistrationState('success')
      setRegistrationMessage('Registration successful. You can now sign in.')
    } catch (error) {
      setRegistrationState('error')
      setRegistrationMessage(error instanceof ApiError && error.status === 400
        ? error.message
        : 'Registration could not be completed. Please try again.')
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
    return <main><section aria-labelledby="signed-in-title">
      <p className="eyebrow">Friend on Campus</p>
      <h1 id="signed-in-title">You’re signed in</h1>
      <p className="intro">This browser session is active until you sign out or close the tab.</p>
      <dl className="identity-card">
        <div><dt>Username</dt><dd>{session.username}</dd></div>
        <div><dt>Role</dt><dd>{session.role}</dd></div>
        <div><dt>User ID</dt><dd className="identifier">{session.userId}</dd></div>
        <div><dt>Expires</dt><dd>{new Date(session.expiresAt).toLocaleString()}</dd></div>
      </dl>
      <button type="button" className="secondary" onClick={() => { clearSession(); setSession(null); show('login') }}>Sign out</button>
    </section></main>
  }

  const busy = loginState === 'loading' || registrationState === 'loading'
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
      <label>Email<input type="email" value={loginEmail} onChange={event => setLoginEmail(event.target.value)} disabled={busy} aria-invalid={loginState === 'error'} /></label>
      <label>Password<input type="password" value={loginPassword} onChange={event => setLoginPassword(event.target.value)} disabled={busy} aria-invalid={loginState === 'error'} /></label>
      <button disabled={busy}>{loginState === 'loading' ? 'Signing in…' : 'Sign in'}</button>
      <button type="button" className="text-button" onClick={() => show('reset-request')}>Forgot password?</button>
      {loginMessage && <p role="alert" className="error">{loginMessage}</p>}
    </form>}

    {view === 'register' && <form onSubmit={register} noValidate aria-busy={busy} aria-label="Create account form">
      <h1 id="account-title">Create your account</h1>
      <p className="intro">Use your NUS student email to join the campus community.</p>
      <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} disabled={busy} aria-invalid={registrationState === 'error'} /></label>
      <label>Username<input value={username} maxLength={20} onChange={event => setUsername(event.target.value)} disabled={busy} aria-invalid={registrationState === 'error'} /></label>
      <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} disabled={busy} aria-invalid={registrationState === 'error'} /></label>
      <button disabled={busy}>{registrationState === 'loading' ? 'Creating account…' : 'Create account'}</button>
      {registrationMessage && <p role={registrationState === 'error' ? 'alert' : 'status'} className={registrationState}>{registrationMessage}</p>}
    </form>}

    {view === 'reset-request' && <form onSubmit={requestPasswordReset} noValidate aria-busy={busy} aria-label="Request password reset form">
      <h1 id="account-title">Reset your password</h1>
      <p className="intro">Enter your email and we’ll send a reset code if an eligible active account matches it.</p>
      <label>Email<input type="email" autoComplete="email" value={resetEmail} onChange={event => setResetEmail(event.target.value)} disabled={busy} aria-invalid={resetRequestState === 'error'} /></label>
      <button disabled={busy}>{resetRequestState === 'loading' ? 'Sending…' : 'Send reset code'}</button>
      {resetRequestMessage && <p role={resetRequestState === 'error' ? 'alert' : 'status'} className={resetRequestState}>{resetRequestMessage}</p>}
      {resetRequestState === 'success' && <button type="button" className="secondary" onClick={() => show('reset-confirmation')}>Enter reset code</button>}
      <button type="button" className="text-button" onClick={() => show('login')}>Back to sign in</button>
    </form>}

    {view === 'reset-confirmation' && <form onSubmit={confirmPasswordReset} noValidate aria-busy={busy} aria-label="Confirm password reset form">
      <h1 id="account-title">Choose a new password</h1>
      <p className="intro">Enter the six-digit code sent to your email and choose a new password.</p>
      <label>Email<input type="email" autoComplete="email" value={resetEmail} onChange={event => setResetEmail(event.target.value)} disabled={busy} aria-invalid={resetConfirmationState === 'error'} /></label>
      <label>Reset code<input inputMode="numeric" autoComplete="one-time-code" value={resetCode} maxLength={6} onChange={event => setResetCode(event.target.value.replace(/\D/g, ''))} disabled={busy} aria-invalid={resetConfirmationState === 'error'} /></label>
      <label>New password<input type="password" autoComplete="new-password" value={newPassword} onChange={event => setNewPassword(event.target.value)} disabled={busy} aria-invalid={resetConfirmationState === 'error'} /></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={busy} aria-invalid={resetConfirmationState === 'error'} /></label>
      <button disabled={busy}>{resetConfirmationState === 'loading' ? 'Updating…' : 'Update password'}</button>
      {resetConfirmationMessage && <p role={resetConfirmationState === 'error' ? 'alert' : 'status'} className={resetConfirmationState}>{resetConfirmationMessage}</p>}
      {resetConfirmationState === 'success' && <button type="button" className="secondary" onClick={() => show('login')}>Sign in</button>}
      <button type="button" className="text-button" onClick={() => show('reset-request')}>Request another code</button>
    </form>}
  </section></main>
}
