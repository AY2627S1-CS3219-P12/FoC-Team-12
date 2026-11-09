import { type FormEvent, type KeyboardEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Coins,
  Eye,
  EyeOff,
  HandHeart,
  House,
  MapPin,
  PackageCheck,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
} from 'lucide-react'

import { ApiError, api, type UserProfile } from './api/client'
import {
  clearSession,
  readSession,
  safeReturnTo,
  isAdminDestination,
  saveSession,
  type AuthSession,
  type WorkspaceRole,
} from './auth/session'
import { OtpInput } from './OtpInput'
import { AdminUserManagement } from './AdminUserManagement'
import { NotificationBell } from './components/NotificationBell'
import { navigateTo } from './navigation'
import bagIcon from './assets/foc-bag.svg'

type View = 'login' | 'register' | 'email-verification' | 'reset-request' | 'reset-verification' | 'reset-confirmation' | 'reset-complete'
type State = 'idle' | 'loading' | 'success' | 'error'

const eligibleEmail = /^[^@]+@(u\.nus\.edu|u\.duke\.nus\.edu|u\.yale-nus\.edu\.sg)$/i
const verificationCooldownKey = (email: string) => `foc.email-verification-resend:${email.trim().toLowerCase()}`
const resetCooldownKey = (email: string) => `foc.password-reset-resend:${email.trim().toLowerCase()}`
const resetPendingEmailKey = 'foc.password-reset-pending-email'
const loginFailureKey = (email: string) => `foc.login-failures:${email.trim().toLowerCase()}`

function PasswordInput({
  value, onChange, disabled, invalid, autoComplete, autoFocus, inputRef, onKeyDown,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  invalid: boolean
  autoComplete?: string
  autoFocus?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
}) {
  const [visible, setVisible] = useState(false)
  return <span className="password-control">
    <input ref={inputRef} type={visible ? 'text' : 'password'} autoComplete={autoComplete} autoFocus={autoFocus} value={value}
      onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown} disabled={disabled} aria-invalid={invalid} />
    <button type="button" className="password-toggle" aria-label={visible ? 'Hide password' : 'Show password'}
      aria-pressed={visible} onClick={() => setVisible(current => !current)} disabled={disabled}>
      {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </button>
  </span>
}
export function App() {
  const [view, setView] = useState<View>('login')
  const [session, setSession] = useState<AuthSession | null>(() => readSession())
  const accountMenuRef = useRef<HTMLDetailsElement>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileUsername, setProfileUsername] = useState('')
  const [profileUsernameState, setProfileUsernameState] = useState<State>('idle')
  const [profileUsernameMessage, setProfileUsernameMessage] = useState('')
  const [profileUsernameEditing, setProfileUsernameEditing] = useState(false)
  const profileUsernameNoticeTimer = useRef<number | null>(null)
  const [passwordChangeEditing, setPasswordChangeEditing] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [changedPassword, setChangedPassword] = useState('')
  const [changedPasswordConfirmation, setChangedPasswordConfirmation] = useState('')
  const [passwordChangeState, setPasswordChangeState] = useState<State>('idle')
  const [passwordChangeMessage, setPasswordChangeMessage] = useState('')
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginState, setLoginState] = useState<State>('idle')
  const [loginMessage, setLoginMessage] = useState('')
  const [workspaceState, setWorkspaceState] = useState<State>('idle')
  const [workspaceMessage, setWorkspaceMessage] = useState('')
  const [loginPasswordFocusVersion, setLoginPasswordFocusVersion] = useState(0)
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
  const [resetEmail, setResetEmail] = useState(() => sessionStorage.getItem(resetPendingEmailKey) ?? '')
  const [resetCode, setResetCode] = useState('')
  const [resetDigits, setResetDigits] = useState<string[]>(() => Array(6).fill(''))
  const [resetFocusVersion, setResetFocusVersion] = useState(0)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetRequestState, setResetRequestState] = useState<State>('idle')
  const [resetRequestMessage, setResetRequestMessage] = useState('')
  const [resetVerificationState, setResetVerificationState] = useState<State>('idle')
  const [resetVerificationMessage, setResetVerificationMessage] = useState('')
  const [resetConfirmationState, setResetConfirmationState] = useState<State>('idle')
  const [resetConfirmationMessage, setResetConfirmationMessage] = useState('')
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null)
  const [resetResendAvailableAt, setResetResendAvailableAt] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [resetResendState, setResetResendState] = useState<State>('idle')
  const [resetResendMessage, setResetResendMessage] = useState('')
  const verificationInFlight = useRef(false)
  const resetVerificationInFlight = useRef(false)
  const requestedAuthFocus = useRef<View | null>(null)
  const loginEmailRef = useRef<HTMLInputElement>(null)
  const loginPasswordRef = useRef<HTMLInputElement>(null)
  const registrationEmailRef = useRef<HTMLInputElement>(null)
  const registrationUsernameRef = useRef<HTMLInputElement>(null)
  const registrationPasswordRef = useRef<HTMLInputElement>(null)
  const newPasswordRef = useRef<HTMLInputElement>(null)
  const confirmPasswordRef = useRef<HTMLInputElement>(null)
  const currentPasswordRef = useRef<HTMLInputElement>(null)
  const changedPasswordRef = useRef<HTMLInputElement>(null)

  const clearProfileUsernameSuccess = () => {
    if (profileUsernameNoticeTimer.current !== null) {
      window.clearTimeout(profileUsernameNoticeTimer.current)
      profileUsernameNoticeTimer.current = null
    }
    setProfileUsernameState(current => current === 'success' ? 'idle' : current)
    setProfileUsernameMessage(current => current === 'Username updated.' ? '' : current)
  }

  const clearPasswordChange = () => {
    setPasswordChangeEditing(false)
    setCurrentPassword('')
    setChangedPassword('')
    setChangedPasswordConfirmation('')
    setPasswordChangeState('idle')
    setPasswordChangeMessage('')
  }

  useEffect(() => {
    if (!session) {
      return
    }

    let cancelled = false
    void api.getProfile()
      .then(value => {
        if (!cancelled) {
          setProfile(value)
          setProfileUsername(value.username)
          setProfileMessage('')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProfileMessage('We couldn’t load your profile. Please sign out and sign in again.')
        }
      })

    return () => { cancelled = true }
  }, [session])

  useEffect(() => () => {
    if (profileUsernameNoticeTimer.current !== null) {
      window.clearTimeout(profileUsernameNoticeTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!resendAvailableAt && !resetResendAvailableAt) {
      return
    }
    const timer = window.setInterval(() => {
      const now = Date.now()
      setCurrentTime(now)
      if ((!resendAvailableAt || now >= resendAvailableAt) && (!resetResendAvailableAt || now >= resetResendAvailableAt)) {
        window.clearInterval(timer)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [resendAvailableAt, resetResendAvailableAt])

  useLayoutEffect(() => {
    if (loginPasswordFocusVersion > 0) {
      loginPasswordRef.current?.focus()
    }
  }, [loginPasswordFocusVersion])

  useLayoutEffect(() => {
    if (requestedAuthFocus.current !== view) return
    if (view === 'login') loginEmailRef.current?.focus()
    if (view === 'register') registrationEmailRef.current?.focus()
    requestedAuthFocus.current = null
  }, [view])

  useLayoutEffect(() => {
    if (passwordChangeEditing) {
      currentPasswordRef.current?.focus()
    }
  }, [passwordChangeEditing])

  const resendSecondsRemaining = resendAvailableAt
    ? Math.max(0, Math.ceil((resendAvailableAt - currentTime) / 1000))
    : 0
  const resetResendSecondsRemaining = resetResendAvailableAt
    ? Math.max(0, Math.ceil((resetResendAvailableAt - currentTime) / 1000))
    : 0

  const show = (nextView: View) => {
    setView(nextView)
    setLoginState('idle')
    setLoginMessage('')
    setWorkspaceMessage('')
    setRegistrationState('idle')
    setRegistrationMessage('')
    setVerificationState('idle')
    setVerificationMessage('')
    setResendState('idle')
    setResendMessage('')
    setResetRequestState('idle')
    setResetRequestMessage('')
    setResetVerificationState('idle')
    setResetVerificationMessage('')
    setResetResendState('idle')
    setResetResendMessage('')
    setResetConfirmationState('idle')
    setResetConfirmationMessage('')
  }

  const returnFromPasswordResetToSignIn = () => {
    setResetCode('')
    setResetDigits(Array(6).fill(''))
    setNewPassword('')
    setConfirmPassword('')
    show('login')
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

  const recordLoginFailure = (emailAddress: string) => {
    const key = loginFailureKey(emailAddress)
    const previousFailures = Number(sessionStorage.getItem(key))
    const failures = (Number.isInteger(previousFailures) && previousFailures > 0 ? previousFailures : 0) + 1
    sessionStorage.setItem(key, String(failures))
    return failures
  }

  const clearLoginFailures = (emailAddress: string) => {
    sessionStorage.removeItem(loginFailureKey(emailAddress))
  }

  const startResetResendCooldown = (emailAddress: string, seconds = 90) => {
    const deadline = Date.now() + seconds * 1000
    sessionStorage.setItem(resetCooldownKey(emailAddress), String(deadline))
    setResetResendAvailableAt(deadline)
    setCurrentTime(Date.now())
  }

  const restoreResetResendCooldown = (emailAddress: string) => {
    const deadline = Number(sessionStorage.getItem(resetCooldownKey(emailAddress)))
    setResetResendAvailableAt(Number.isFinite(deadline) && deadline > Date.now() ? deadline : null)
    setCurrentTime(Date.now())
  }

  const rememberPendingPasswordReset = (emailAddress: string) => {
    const normalizedEmail = emailAddress.trim().toLowerCase()
    sessionStorage.setItem(resetPendingEmailKey, normalizedEmail)
    setResetEmail(normalizedEmail)
  }

  const clearPendingPasswordReset = (emailAddress: string) => {
    sessionStorage.removeItem(resetPendingEmailKey)
    sessionStorage.removeItem(resetCooldownKey(emailAddress))
    setResetEmail('')
    setResetResendAvailableAt(null)
  }

  const openPasswordReset = () => {
    const pendingEmail = sessionStorage.getItem(resetPendingEmailKey)
    if (pendingEmail && eligibleEmail.test(pendingEmail)) {
      setResetEmail(pendingEmail)
      setResetCode('')
      setResetDigits(Array(6).fill(''))
      restoreResetResendCooldown(pendingEmail)
      show('reset-verification')
      return
    }
    sessionStorage.removeItem(resetPendingEmailKey)
    setResetEmail('')
    setResetResendAvailableAt(null)
    show('reset-request')
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
      clearLoginFailures(loginEmail)
      clearProfileUsernameSuccess()
      clearPasswordChange()
      setLoginPassword('')
      setSession(saveSession(nextSession))
      setLoginState('success')
      void api.activateCreditAccount().catch(() => undefined)
      const destination = safeReturnTo()
      if (destination && (destination === '/credits' || destination.startsWith('/credits/') || destination.startsWith('/admin/reports/') || destination === '/errands' || destination.startsWith('/errands/') || isAdminDestination(destination))) {
        if (isAdminDestination(destination) && nextSession.role !== 'ADMIN' && nextSession.availableRoles?.includes('ADMIN')) {
          setSession(saveSession(await api.changeSessionRole({ role: 'ADMIN' })))
        }
        navigateTo(destination)
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_VERIFICATION_REQUIRED') {
        clearLoginFailures(loginEmail)
        show('email-verification')
        setVerificationEmail(loginEmail.trim())
        restoreResendCooldown(loginEmail)
        setLoginPassword('')
        return
      }
      setLoginState('error')
      if (error instanceof ApiError && error.status === 401) {
        const failures = recordLoginFailure(loginEmail)
        setLoginPassword('')
        setLoginPasswordFocusVersion(version => version + 1)
        setLoginMessage(failures >= 2
          ? 'Incorrect email or password. If you’ve made several attempts, wait 30 seconds or reset your password.'
          : 'Incorrect email or password.')
      } else {
        setLoginMessage('Incorrect email or password.')
      }
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
        : 'We couldn’t create your account. Please try again.')
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
        : 'We couldn’t verify your email. Please try again.')
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
        setResendMessage(error instanceof ApiError ? error.message : 'We couldn’t send a new code. Please try again.')
      }
    }
  }

  const requestPasswordReset = async (event: FormEvent) => {
    event.preventDefault()
    if (!eligibleEmail.test(resetEmail)) {
      setResetRequestState('error')
      setResetRequestMessage('Use an eligible NUS student email.')
      return
    }
    setResetRequestState('loading')
    setResetRequestMessage('')
    try {
      const retryAfterSeconds = await api.requestPasswordReset({ email: resetEmail })
      rememberPendingPasswordReset(resetEmail)
      setResetDigits(Array(6).fill(''))
      startResetResendCooldown(resetEmail, retryAfterSeconds)
      show('reset-verification')
    } catch {
      setResetRequestState('error')
      setResetRequestMessage('We couldn’t send a reset code. Please try again.')
    }
  }

  const resendPasswordReset = async () => {
    if (resetResendSecondsRemaining > 0 || !eligibleEmail.test(resetEmail)) {
      return
    }
    setResetResendState('loading')
    setResetResendMessage('')
    try {
      const retryAfterSeconds = await api.requestPasswordReset({ email: resetEmail })
      rememberPendingPasswordReset(resetEmail)
      setResetResendState('success')
      setResetResendMessage('If this email has an account, we’ve sent you a reset code.')
      setResetDigits(Array(6).fill(''))
      startResetResendCooldown(resetEmail, retryAfterSeconds)
    } catch {
      setResetResendState('error')
      setResetResendMessage('We couldn’t send another code. Please try again.')
    }
  }

  const verifyPasswordReset = async (completedCode?: string) => {
    if (resetVerificationInFlight.current) {
      return
    }
    const code = completedCode ?? resetDigits.join('')
    if (!eligibleEmail.test(resetEmail)) {
      setResetVerificationState('error')
      setResetVerificationMessage('Use an eligible NUS student email.')
      return
    }
    if (!/^\d{6}$/.test(code)) {
      setResetVerificationState('error')
      setResetVerificationMessage('Enter the six-digit code from your email.')
      return
    }
    resetVerificationInFlight.current = true
    setResetVerificationState('loading')
    setResetVerificationMessage('')
    try {
      await api.verifyPasswordReset({ email: resetEmail, code })
      setResetCode(code)
      show('reset-confirmation')
    } catch (error) {
      setResetVerificationState('error')
      setResetVerificationMessage(error instanceof ApiError ? error.message : 'We couldn’t check that code. Please try again.')
      if (error instanceof ApiError) {
        setResetDigits(Array(6).fill(''))
        setResetFocusVersion(version => version + 1)
      }
    } finally {
      resetVerificationInFlight.current = false
    }
  }

  const confirmPasswordReset = async (event: FormEvent) => {
    event.preventDefault()
    if (!eligibleEmail.test(resetEmail)) {
      setResetConfirmationState('error')
      setResetConfirmationMessage('Use an eligible NUS student email.')
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
      clearLoginFailures(resetEmail)
      clearPendingPasswordReset(resetEmail)
      setResetCode('')
      setNewPassword('')
      setConfirmPassword('')
      show('reset-complete')
    } catch (error) {
      setResetConfirmationState('error')
      setResetConfirmationMessage(error instanceof ApiError && error.code === 'PASSWORD_REUSE'
        ? error.message
        : 'The code is invalid or expired. Request a new code and try again.')
    }
  }

  const changeUsername = async (event: FormEvent) => {
    event.preventDefault()
    if (!profileUsername.trim() || profileUsername.length > 20) {
      setProfileUsernameState('error')
      setProfileUsernameMessage('Username is required and must be at most 20 characters.')
      return
    }
    setProfileUsernameState('loading')
    setProfileUsernameMessage('')
    try {
      const updatedProfile = await api.changeUsername({ username: profileUsername })
      setProfile(updatedProfile)
      setProfileUsername(updatedProfile.username)
      setProfileUsernameState('success')
      setProfileUsernameMessage('Username updated.')
      setProfileUsernameEditing(false)
      if (profileUsernameNoticeTimer.current !== null) {
        window.clearTimeout(profileUsernameNoticeTimer.current)
      }
      profileUsernameNoticeTimer.current = window.setTimeout(() => {
        setProfileUsernameState('idle')
        setProfileUsernameMessage('')
        profileUsernameNoticeTimer.current = null
      }, 3000)
    } catch (error) {
      setProfileUsernameState('error')
      setProfileUsernameMessage(error instanceof ApiError && error.status === 409
        ? 'Username is already taken.'
        : 'We couldn’t update your username. Please try again.')
    }
  }

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    if (!currentPassword) {
      setPasswordChangeState('error')
      setPasswordChangeMessage('Enter your current password.')
      return
    }
    if (changedPassword.length < 15 || changedPassword.length > 64) {
      setPasswordChangeState('error')
      setPasswordChangeMessage('New password must be 15 to 64 characters.')
      return
    }
    if (changedPassword !== changedPasswordConfirmation) {
      setPasswordChangeState('error')
      setPasswordChangeMessage('New passwords do not match.')
      return
    }
    if (changedPassword === currentPassword) {
      setPasswordChangeState('error')
      setPasswordChangeMessage('New password must be different from your current password.')
      return
    }

    setPasswordChangeState('loading')
    setPasswordChangeMessage('')
    try {
      await api.changePassword({ currentPassword, newPassword: changedPassword })
      const emailAddress = profile?.email ?? ''
      clearProfileUsernameSuccess()
      clearSession()
      setSession(null)
      setProfile(null)
      clearPasswordChange()
      show('login')
      setLoginEmail(emailAddress)
      setLoginPassword('')
      setLoginPasswordFocusVersion(version => version + 1)
      setLoginState('success')
      setLoginMessage('Password updated. Sign in with your new password.')
    } catch (error) {
      setPasswordChangeState('error')
      setPasswordChangeMessage(error instanceof ApiError && error.status === 400
        ? error.message
        : 'We couldn’t change your password. Please try again.')
    }
  }

  const selectWorkspaceRole = async (role: WorkspaceRole) => {
    if (!session || role === session.role) {
      return true
    }
    setWorkspaceState('loading')
    setWorkspaceMessage('')
    try {
      const replacement = await api.changeSessionRole({ role })
      const savedReplacement = saveSession(replacement)
      setSession(savedReplacement)
      setProfile(current => current && current.userId === replacement.userId
        ? { ...current, roles: savedReplacement.availableRoles ?? [] }
        : current)
      setWorkspaceState('success')
      return true
    } catch (error) {
      setWorkspaceState('error')
      setWorkspaceMessage(error instanceof ApiError
        ? error.message
        : "We couldn't switch your role. Please try again.")
      return false
    }
  }

  if (session) {
    const displayedProfile = profile?.userId === session.userId ? profile : null
    const adminMode = session.role === 'ADMIN'
    const adminUsersPage = adminMode && new URLSearchParams(window.location.search).get('view') === 'users'
    const suppliersPath = adminMode ? '/admin/suppliers' : '/suppliers'
    const canUseAdmin = session.availableRoles?.includes('ADMIN') ?? false
    const accountInitial = session.username.trim().charAt(0).toUpperCase()
    const signOut = () => {
      const emailAddress = displayedProfile?.email ?? ''
      clearProfileUsernameSuccess()
      clearPasswordChange()
      clearSession()
      setProfile(null)
      setSession(null)
      show('login')
      setLoginEmail(emailAddress)
      setLoginPassword('')
      setLoginPasswordFocusVersion(version => version + 1)
    }
    return <div className="profile-shell">
      <header className="profile-app-header">
        <div className="profile-app-header-content">
          <a className="profile-brand" href="/">
            <img alt="" height="24" src={bagIcon} width="24" />
            <span>Friend on Campus</span>
          </a>
          <nav className="profile-service-nav" aria-label="Main navigation">
            <a aria-current={adminUsersPage ? undefined : 'page'} href="/"><House aria-hidden="true" />Home</a>
            <a href="/errands/browse"><ClipboardList aria-hidden="true" />Errands</a>
            <a href={suppliersPath}><Store aria-hidden="true" />Suppliers</a>
            <a href="/credits"><Coins aria-hidden="true" />Credits</a>
            {adminMode && <a href="/admin"><ShieldCheck aria-hidden="true" />Admin</a>}
          </nav>
          <nav className="profile-app-actions" aria-label="Account and workspace">
            {!adminMode && <div className="workspace-selector" role="group" aria-label="Choose your current role">
              <span className="workspace-selector-options">
                <button type="button" aria-pressed={session.role === 'REQUESTER'} disabled={workspaceState === 'loading'}
                  onClick={() => { void selectWorkspaceRole('REQUESTER') }}>Requester</button>
                <button type="button" aria-pressed={session.role === 'COURIER'} disabled={workspaceState === 'loading'}
                  onClick={() => { void selectWorkspaceRole('COURIER') }}>Courier</button>
              </span>
            </div>}
            <NotificationBell />
            <details className="profile-account-menu" ref={accountMenuRef}>
              <summary aria-label={`Open account menu for ${session.username}`} title="Account menu">
                <span aria-hidden="true" className="profile-account-avatar">{accountInitial}</span>
                <span className="profile-account-name">{session.username}</span>
                <span aria-hidden="true" className="account-menu-chevron" />
              </summary>
              <div className="profile-account-menu-items">
                <a aria-current={adminUsersPage ? undefined : 'page'} href="/">Profile</a>
                {adminMode && <a aria-current={adminUsersPage ? 'page' : undefined} href="/?view=users">Manage users</a>}
                {canUseAdmin && !adminMode && <button type="button" disabled={workspaceState === 'loading'}
                  onClick={() => { void selectWorkspaceRole('ADMIN').then(changed => {
                    if (changed) {
                      if (accountMenuRef.current) accountMenuRef.current.open = false
                      navigateTo('/admin')
                    }
                  }) }}>Switch to Admin</button>}
                {adminMode && <button type="button" disabled={workspaceState === 'loading'}
                  onClick={() => { void selectWorkspaceRole('REQUESTER').then(changed => {
                    if (!changed) return
                    if (accountMenuRef.current) accountMenuRef.current.open = false
                    navigateTo('/')
                  }) }}>Switch to User</button>}
                <span aria-hidden="true" className="profile-account-menu-divider" />
                <button type="button" className="profile-account-menu-sign-out" onClick={signOut}>Sign out</button>
              </div>
            </details>
          </nav>
        </div>
      </header>
      {workspaceMessage && <p className="access-message profile-workspace-error" role="alert">{workspaceMessage}</p>}
      {adminUsersPage
        ? <main className="admin-users-main"><AdminUserManagement currentUserId={session.userId} /></main>
        : <main className="profile-main"><section className="dashboard-page" aria-labelledby="dashboard-title">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">{adminMode ? 'Administration' : 'Your campus dashboard'}</p>
          <h1 id="dashboard-title">{adminMode ? 'Keep FoC running smoothly.' : <>Good to see you, <span>{session.username}</span>.</>}</h1>
          <p className="intro">{adminMode
            ? 'Manage the people and places that keep Friend on Campus useful and safe.'
            : 'What would make your day a little easier?'}</p>
        </div>
      </header>

      {!adminMode && <nav className="dashboard-actions" aria-label="Start an errand">
        <a className="dashboard-action dashboard-action-request" href="/errands/new" onClick={event => {
          if (session.role === 'REQUESTER') return
          event.preventDefault()
          void selectWorkspaceRole('REQUESTER').then(changed => { if (changed) navigateTo('/errands/new') })
        }}>
          <span className="dashboard-action-icon"><HandHeart aria-hidden="true" /></span>
          <span><small>I need a hand</small><strong>Request help</strong><em>Post a pickup or delivery and choose the credit reward.</em></span>
          <ArrowUpRight aria-hidden="true" />
        </a>
        <a className="dashboard-action dashboard-action-courier" href="/errands/browse" onClick={event => {
          if (session.role === 'COURIER') return
          event.preventDefault()
          void selectWorkspaceRole('COURIER').then(changed => { if (changed) navigateTo('/errands/browse') })
        }}>
          <span className="dashboard-action-icon"><PackageCheck aria-hidden="true" /></span>
          <span><small>I have time to help</small><strong>Run an errand</strong><em>Find an open request nearby and earn credits.</em></span>
          <ArrowUpRight aria-hidden="true" />
        </a>
      </nav>}

      <div className="dashboard-content">
        <section className="dashboard-explore" aria-labelledby="explore-title">
          <div className="section-heading"><div><p className="eyebrow">Quick access</p><h2 id="explore-title">Explore Friend on Campus</h2></div></div>
          <nav className="service-grid" aria-label="Friend on Campus services">
            {!adminMode && <a className="service-card" href="/errands/mine"><Clock3 aria-hidden="true" /><strong>My errands</strong><span>Track requests, deliveries and completed handoffs.</span><ArrowRight aria-hidden="true" /></a>}
            {!adminMode && <a className="service-card" href="/suppliers"><Store aria-hidden="true" /><strong>Browse suppliers</strong><span>Find food, coffee, printing and shopping across campus.</span><ArrowRight aria-hidden="true" /></a>}
            {adminMode && <a className="service-card admin-card" href="/admin/suppliers"><Store aria-hidden="true" /><strong>Manage suppliers</strong><span>Create, update, activate or remove campus locations.</span><ArrowRight aria-hidden="true" /></a>}
            {adminMode && <a className="service-card admin-card" href="/?view=users"><ShieldCheck aria-hidden="true" /><strong>Manage users</strong><span>Manage roles, account access and account status.</span><ArrowRight aria-hidden="true" /></a>}
            <a className="service-card" href="/credits"><Coins aria-hidden="true" /><strong>View my credits</strong><span>See available credits, reservations and transaction history.</span><ArrowRight aria-hidden="true" /></a>
          </nav>
        </section>

        <section className="account-panel" aria-labelledby="profile-title">
          <div className="section-heading account-panel-heading"><div><p className="eyebrow">Account settings</p><h2 id="profile-title">Profile</h2></div><span className="account-security"><CheckCircle2 aria-hidden="true" />Verified</span></div>
      {!displayedProfile && !profileMessage && <p role="status">Loading your profile…</p>}
      {profileMessage && <p role="alert" className="error">{profileMessage}</p>}
      {displayedProfile && <dl className="identity-card">
        <div><dt>Email</dt><dd>{displayedProfile.email}</dd></div>
        <div className="profile-username-card"><dt>Username</dt><dd>
          {!profileUsernameEditing && <span className="profile-username-display">
            <span>{displayedProfile.username}</span>
            <span className="profile-username-actions">
              {profileUsernameState === 'success' && <span role="status" className="profile-username-notice success" style={{ fontSize: '0.75rem', fontWeight: 400 }}>{profileUsernameMessage}</span>}
              <button type="button" className="secondary compact-action" aria-label="Edit username" onClick={() => {
                setProfileUsername(displayedProfile.username)
                clearProfileUsernameSuccess()
                setProfileUsernameEditing(true)
              }}>Edit</button>
            </span>
          </span>}
          {profileUsernameEditing && <form className="profile-username-editor" onSubmit={changeUsername} noValidate aria-busy={profileUsernameState === 'loading'} aria-label="Change username form">
            <input aria-label="Username" value={profileUsername} maxLength={20} autoFocus onChange={event => setProfileUsername(event.target.value)} disabled={profileUsernameState === 'loading'} aria-invalid={profileUsernameState === 'error'} />
            <span className="profile-username-actions">
              <button type="submit" className="secondary compact-action" disabled={profileUsernameState === 'loading' || profileUsername === displayedProfile.username}>{profileUsernameState === 'loading' ? 'Saving…' : 'Save'}</button>
              <button type="button" className="text-button compact-text-action" disabled={profileUsernameState === 'loading'} onClick={() => {
                setProfileUsername(displayedProfile.username)
                clearProfileUsernameSuccess()
                setProfileUsernameEditing(false)
              }}>Cancel</button>
            </span>
          </form>}
          {profileUsernameState === 'error' && profileUsernameMessage && <p role="alert" className="error">{profileUsernameMessage}</p>}
        </dd></div>
        <div><dt>Account access</dt><dd>{canUseAdmin ? 'Admin' : 'User'}</dd></div>
        <div className="profile-password-card"><dt>Password</dt><dd>
          {!passwordChangeEditing && <span className="profile-password-display">
            <span aria-label="Password is set">••••••••</span>
            <button type="button" className="secondary compact-action" onClick={() => {
              setPasswordChangeEditing(true)
              setPasswordChangeState('idle')
              setPasswordChangeMessage('')
            }}>Change</button>
          </span>}
          {passwordChangeEditing && <form className="profile-password-editor" onSubmit={changePassword} noValidate aria-busy={passwordChangeState === 'loading'} aria-label="Change password form">
            <label>Current password<PasswordInput value={currentPassword} onChange={setCurrentPassword} inputRef={currentPasswordRef} onKeyDown={event => focusOnEnter(event, changedPasswordRef)} disabled={passwordChangeState === 'loading'} invalid={passwordChangeState === 'error'} autoComplete="current-password" /></label>
            <label>New password<PasswordInput value={changedPassword} onChange={setChangedPassword} inputRef={changedPasswordRef} onKeyDown={event => focusOnEnter(event, confirmPasswordRef)} disabled={passwordChangeState === 'loading'} invalid={passwordChangeState === 'error'} autoComplete="new-password" /></label>
            <label>Confirm new password<PasswordInput value={changedPasswordConfirmation} onChange={setChangedPasswordConfirmation} inputRef={confirmPasswordRef} disabled={passwordChangeState === 'loading'} invalid={passwordChangeState === 'error'} autoComplete="new-password" /></label>
            <span className="profile-password-actions">
              <button className="secondary compact-action" disabled={passwordChangeState === 'loading'}>{passwordChangeState === 'loading' ? 'Updating…' : 'Save'}</button>
              <button type="button" className="text-button compact-text-action" disabled={passwordChangeState === 'loading'} onClick={clearPasswordChange}>Cancel</button>
            </span>
            {passwordChangeMessage && <p role={passwordChangeState === 'error' ? 'alert' : 'status'} className={passwordChangeState}>{passwordChangeMessage}</p>}
          </form>}
        </dd></div>
      </dl>}
        </section>
      </div>
    </section></main>}
    </div>
  }

  const busy = loginState === 'loading' || registrationState === 'loading'
    || verificationState === 'loading' || resendState === 'loading'
    || resetRequestState === 'loading' || resetVerificationState === 'loading' || resetConfirmationState === 'loading' || resetResendState === 'loading'

  return <main className="welcome-page">
    <header className="welcome-header">
      <a className="welcome-brand" href="/">
        <span><img alt="" height="26" src={bagIcon} width="26" /></span>
        <strong>Friend on Campus</strong>
      </a>
      <nav aria-label="Welcome navigation">
        <a href="#how-it-works">How it works</a>
        <a href="/suppliers">Campus suppliers</a>
        <a className="welcome-sign-in" href="#account">Sign in</a>
      </nav>
    </header>

    <div className="welcome-main">
      <section className="welcome-hero" aria-labelledby="welcome-title">
        <p className="welcome-kicker"><Sparkles aria-hidden="true" />Made for NUS students</p>
        <h1 id="welcome-title">One campus.<br /><span>A thousand small favours.</span></h1>
        <p className="welcome-lede">Need lunch picked up before class? Heading past the library anyway? FoC matches everyday campus errands with students who can help.</p>
        <div className="welcome-actions">
          <button type="button" onClick={() => { requestedAuthFocus.current = 'register'; show('register'); document.querySelector('#account')?.scrollIntoView({ behavior: 'smooth' }) }}>Join with NUS email <ArrowRight aria-hidden="true" /></button>
          <a href="/suppliers"><Search aria-hidden="true" />Explore campus suppliers</a>
        </div>
        <div className="welcome-proof" aria-label="What makes Friend on Campus useful">
          <span><CheckCircle2 aria-hidden="true" /><strong>NUS email verified</strong></span>
          <span><Coins aria-hidden="true" /><strong>Simple credit rewards</strong></span>
          <span><MapPin aria-hidden="true" /><strong>Campus-only handoffs</strong></span>
        </div>

        <div className="errand-preview" aria-label="Example errands">
          <div className="preview-heading"><span><span className="preview-live-dot" />Open around campus</span><a href="/suppliers">View suppliers <ArrowRight aria-hidden="true" /></a></div>
          <article className="preview-card preview-card-featured">
            <span className="preview-icon"><PackageCheck aria-hidden="true" /></span>
            <div><small>UTown · before 2:30 PM</small><strong>Pick up lunch from Fine Food</strong><span>Drop off at College of Alice &amp; Peter</span></div>
            <b>3 credits</b>
          </article>
          <article className="preview-card">
            <span className="preview-icon"><Store aria-hidden="true" /></span>
            <div><small>Central Library · flexible</small><strong>Collect printed notes</strong><span>Drop off near COM3</span></div>
            <b>2 credits</b>
          </article>
        </div>
      </section>

      <section className="auth-card" id="account" aria-labelledby="account-title">
      <div className="auth-card-intro">
        <p className="eyebrow">Your FoC account</p>
        <p>Use your student identity to request help or run errands.</p>
      </div>
    {(view === 'login' || view === 'register') && <nav className="tabs" aria-label="Account actions">
      <button type="button" aria-pressed={view === 'login'} className={view === 'login' ? 'tab active' : 'tab'} onClick={() => { requestedAuthFocus.current = 'login'; show('login') }}>Sign in</button>
      <button type="button" aria-pressed={view === 'register'} className={view === 'register' ? 'tab active' : 'tab'} onClick={() => { requestedAuthFocus.current = 'register'; show('register') }}>Create account</button>
    </nav>}
    {(view === 'register' || view === 'email-verification') && <ol className="auth-progress" aria-label="Account creation progress">
      <li className={view === 'register' ? 'current' : 'complete'}><span>{view === 'register' ? '1' : <CheckCircle2 aria-hidden="true" />}</span>Account</li>
      <li className={view === 'email-verification' ? 'current' : ''}><span>2</span>Verify email</li>
    </ol>}

    {view === 'login' && <form onSubmit={login} noValidate aria-busy={busy} aria-label="Sign in form">
      <h1 id="account-title">Sign in</h1>
      <p className="intro">Use your NUS student email to continue.</p>
      <label>Email<input ref={loginEmailRef} type="email" autoComplete="email" value={loginEmail} onChange={event => setLoginEmail(event.target.value)} onKeyDown={event => focusOnEnter(event, loginPasswordRef)} disabled={busy} aria-invalid={loginState === 'error'} /></label>
      <label>Password<PasswordInput value={loginPassword} onChange={setLoginPassword} inputRef={loginPasswordRef} disabled={busy} invalid={loginState === 'error'} autoComplete="current-password" /></label>
      <button disabled={busy}>{loginState === 'loading' ? 'Signing in…' : 'Sign in'}</button>
      <button type="button" className="text-button" onClick={openPasswordReset}>Forgot password?</button>
      <a className="guest-link" href="/suppliers">Browse suppliers without signing in <ArrowRight aria-hidden="true" /></a>
      {loginMessage && <p role={loginState === 'error' ? 'alert' : 'status'} className={loginState === 'error' ? 'error' : 'success'}>{loginMessage}</p>}
    </form>}

    {view === 'register' && <form onSubmit={register} noValidate aria-busy={busy} aria-label="Create account form">
      <h1 id="account-title">Create your account</h1>
      <p className="intro">Use your NUS student email to join the campus community.</p>
      <label>Email<input ref={registrationEmailRef} type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} onKeyDown={event => focusOnEnter(event, registrationUsernameRef)} disabled={busy} aria-invalid={registrationState === 'error'} /></label>
      <label>Username<input ref={registrationUsernameRef} value={username} maxLength={20} onChange={event => setUsername(event.target.value)} onKeyDown={event => focusOnEnter(event, registrationPasswordRef)} disabled={busy} aria-invalid={registrationState === 'error'} /></label>
      <label>Password<PasswordInput value={password} onChange={setPassword} inputRef={registrationPasswordRef} disabled={busy} invalid={registrationState === 'error'} autoComplete="new-password" /></label>
      <button disabled={busy}>{registrationState === 'loading' ? 'Creating account…' : 'Create account'}</button>
      {registrationMessage && <p role={registrationState === 'error' ? 'alert' : 'status'} className={registrationState}>{registrationMessage}</p>}
    </form>}

    {view === 'email-verification' && <form onSubmit={event => { event.preventDefault(); void verifyEmail() }} noValidate aria-busy={busy} aria-label="Verify email form">
      <h1 id="account-title">Verify your email</h1>
      <p className="intro">Enter the six-digit code we sent to your NUS email.</p>
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
      <p className="intro">Enter your email and we’ll send you a reset code.</p>
      <label>Email<input type="email" autoFocus autoComplete="email" value={resetEmail} onChange={event => setResetEmail(event.target.value)} disabled={busy} aria-invalid={resetRequestState === 'error'} /></label>
      <button disabled={busy}>{resetRequestState === 'loading' ? 'Sending…' : 'Send reset code'}</button>
      {resetRequestMessage && <p role={resetRequestState === 'error' ? 'alert' : 'status'} className={resetRequestState}>{resetRequestMessage}</p>}
      <button type="button" className="text-button" onClick={returnFromPasswordResetToSignIn}>Back to sign in</button>
    </form>}

    {view === 'reset-verification' && <form onSubmit={event => { event.preventDefault(); void verifyPasswordReset() }} noValidate aria-busy={busy} aria-label="Verify password reset code form">
      <h1 id="account-title">Verify reset code</h1>
      <p className="intro">Enter the six-digit code already sent to your email.</p>
      <p className="verification-email">Reset code for <strong>{resetEmail}</strong>.</p>
      <label>Reset code<OtpInput value={resetDigits} onChange={setResetDigits} onComplete={code => { void verifyPasswordReset(code) }} focusFirst={resetFocusVersion} disabled={busy} invalid={resetVerificationState === 'error'} /></label>
      {resetVerificationMessage && <p role={resetVerificationState === 'error' ? 'alert' : 'status'} className={resetVerificationState}>{resetVerificationMessage}</p>}
      <button type="button" className="secondary" disabled={busy || resetResendSecondsRemaining > 0} onClick={resendPasswordReset}>{resetResendState === 'loading' ? 'Sending…' : resetResendSecondsRemaining > 0 ? `Request another code in ${resetResendSecondsRemaining}s` : 'Request another code'}</button>
      {resetResendMessage && <p role={resetResendState === 'error' ? 'alert' : 'status'} className={resetResendState}>{resetResendMessage}</p>}
      <button type="button" className="text-button" onClick={returnFromPasswordResetToSignIn}>Back to sign in</button>
    </form>}

    {view === 'reset-confirmation' && <form onSubmit={confirmPasswordReset} noValidate aria-busy={busy} aria-label="Confirm password reset form">
      <h1 id="account-title">Choose a new password</h1>
      <p className="intro">Choose a new password for <strong>{resetEmail}</strong>.</p>
      <label>New password<PasswordInput value={newPassword} onChange={setNewPassword} inputRef={newPasswordRef} onKeyDown={event => focusOnEnter(event, confirmPasswordRef)} disabled={busy} invalid={resetConfirmationState === 'error'} autoComplete="new-password" /></label>
      <label>Confirm new password<PasswordInput value={confirmPassword} onChange={setConfirmPassword} inputRef={confirmPasswordRef} disabled={busy} invalid={resetConfirmationState === 'error'} autoComplete="new-password" /></label>
      <button disabled={busy}>{resetConfirmationState === 'loading' ? 'Updating…' : 'Update password'}</button>
      {resetConfirmationMessage && <p role={resetConfirmationState === 'error' ? 'alert' : 'status'} className={resetConfirmationState}>{resetConfirmationMessage}</p>}
      <button type="button" className="text-button" onClick={returnFromPasswordResetToSignIn}>Back to sign in</button>
    </form>}
    {view === 'reset-complete' && <div aria-labelledby="account-title">
      <h1 id="account-title">Password updated</h1>
      <p role="status" className="success">Your password has been updated. You can now sign in.</p>
      <button type="button" onClick={() => show('login')}>Sign in</button>
    </div>}
    <p className="auth-trust"><ShieldCheck aria-hidden="true" />Only NUS student emails can join.</p>
    </section>
    </div>

    <section className="how-it-works" id="how-it-works" aria-labelledby="how-title">
      <div className="how-heading"><p className="eyebrow">A clearer way to ask for help</p><h2 id="how-title">From request to handoff, without the guesswork.</h2></div>
      <ol>
        <li><span>01</span><div><HandHeart aria-hidden="true" /><h3>Post what you need</h3><p>Add the supplier, destination, deadline and credit reward.</p></div></li>
        <li><span>02</span><div><PackageCheck aria-hidden="true" /><h3>A student accepts</h3><p>A student nearby picks up your errand.</p></div></li>
        <li><span>03</span><div><CheckCircle2 aria-hidden="true" /><h3>Confirm the handoff</h3><p>Confirm you got it, and your courier gets paid.</p></div></li>
      </ol>
    </section>
  </main>
}
