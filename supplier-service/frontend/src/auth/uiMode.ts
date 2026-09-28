export type UiMode = 'user' | 'admin'

export const uiModeKey = 'foc.ui-mode'

export function readUiMode(role?: 'USER' | 'ADMIN'): UiMode {
  if (role !== 'ADMIN') {
    sessionStorage.removeItem(uiModeKey)
    return 'user'
  }
  return sessionStorage.getItem(uiModeKey) === 'admin' ? 'admin' : 'user'
}

export function saveUiMode(mode: UiMode, role?: 'USER' | 'ADMIN'): UiMode {
  const safeMode = role === 'ADMIN' && mode === 'admin' ? 'admin' : 'user'
  sessionStorage.setItem(uiModeKey, safeMode)
  return safeMode
}

export function clearUiMode() {
  sessionStorage.removeItem(uiModeKey)
}
