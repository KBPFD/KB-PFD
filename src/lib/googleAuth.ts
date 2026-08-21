/**
 * Google sign-in via Google Identity Services (OAuth 2.0 token client).
 * Only the `drive.file` scope is requested, so the app can only ever see
 * files and folders it created itself.
 */

/** Least-privilege scope: no verification review, and no access to existing Drive files. */
const SCOPES = 'https://www.googleapis.com/auth/drive.file'
const CLIENT_ID_KEY = 'pfd.googleClientId'
const TOKEN_KEY = 'pfd.token'

interface StoredToken {
  accessToken: string
  expiresAt: number
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string
            scope: string
            prompt?: string
            hint?: string
            callback: (resp: { access_token?: string; expires_in?: number; error?: string }) => void
            error_callback?: (err: { type?: string; message?: string }) => void
          }): { requestAccessToken(overrides?: { prompt?: string; hint?: string }): void }
          revoke(token: string, done?: () => void): void
        }
      }
    }
  }
}

export function getClientId(): string {
  return ((import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || localStorage.getItem(CLIENT_ID_KEY) || '').trim()
}

export function setClientId(id: string) {
  const value = id.trim()
  if (!value) {
    localStorage.removeItem(CLIENT_ID_KEY)
    return
  }
  localStorage.setItem(CLIENT_ID_KEY, value)
}

function formatAuthError(raw?: string): string {
  const code = (raw || '').toLowerCase()
  if (code.includes('disabled_client')) {
    return 'This Google OAuth client is disabled. Set an active client ID in Settings -> Account & sync, or set VITE_GOOGLE_CLIENT_ID in your deployment.'
  }
  if (code.includes('invalid_client')) {
    return 'Google OAuth client ID is invalid. Check the full ...apps.googleusercontent.com value in Settings.'
  }
  if (code.includes('popup_closed')) {
    return 'Sign-in popup was closed before authorisation completed.'
  }
  if (code.includes('popup_failed_to_open')) {
    return 'Sign-in popup was blocked by the browser. Allow popups for this site and try again.'
  }
  return raw || 'Authorisation failed'
}

function loadStoredToken(): StoredToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredToken
    if (!parsed.accessToken || parsed.expiresAt < Date.now() + 60_000) return null
    return parsed
  } catch {
    return null
  }
}

let token: StoredToken | null = loadStoredToken()

export function getAccessToken(): string | null {
  if (token && token.expiresAt > Date.now() + 60_000) return token.accessToken
  token = null
  sessionStorage.removeItem(TOKEN_KEY)
  return null
}

function waitForGsi(timeoutMs = 10_000): Promise<NonNullable<Window['google']>> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (window.google?.accounts?.oauth2) return resolve(window.google)
      if (Date.now() - started > timeoutMs) {
        return reject(new Error('Google sign-in library failed to load. Check your connection.'))
      }
      setTimeout(tick, 100)
    }
    tick()
  })
}

/**
 * Requests an access token. `silent` attempts to reuse an existing Google
 * session without showing the consent popup (used on app start).
 */
export async function requestAccessToken(opts: { silent?: boolean; hint?: string } = {}): Promise<string> {
  const clientId = getClientId()
  if (!clientId) {
    throw new Error(
      'Google OAuth client ID is not configured. Add one in Settings -> Account & sync or set VITE_GOOGLE_CLIENT_ID in your environment.',
    )
  }

  const google = await waitForGsi()
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      prompt: opts.silent ? 'none' : '',
      hint: opts.hint,
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(formatAuthError(resp.error)))
          return
        }
        token = {
          accessToken: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
        }
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token))
        resolve(resp.access_token)
      },
      error_callback: (err) => reject(new Error(formatAuthError(err.message || err.type))),
    })
    client.requestAccessToken({ prompt: opts.silent ? 'none' : '', hint: opts.hint })
  })
}

export function signOut() {
  const current = token?.accessToken
  token = null
  sessionStorage.removeItem(TOKEN_KEY)
  if (current) window.google?.accounts.oauth2.revoke(current)
}
