/**
 * Password-based encryption for the Drive data file.
 * PBKDF2-SHA256 derives an AES-GCM key; a wrong password simply fails to
 * decrypt, so no password hash needs to be stored anywhere.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const KDF_ITERATIONS = 310_000

export interface Envelope {
  /** format marker so plain (legacy) files can still be recognised */
  pfd: 1
  username: string
  salt: string
  iterations: number
  iv: string
  data: string
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations = KDF_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function seal(
  key: CryptoKey,
  meta: { username: string; salt: string; iterations: number },
  payload: unknown,
): Promise<Envelope> {
  const iv = randomBytes(12)
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    encoder.encode(JSON.stringify(payload)),
  )
  return {
    pfd: 1,
    username: meta.username,
    salt: meta.salt,
    iterations: meta.iterations,
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(cipher)),
  }
}

export async function unseal<T>(key: CryptoKey, envelope: Envelope): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv) as BufferSource },
    key,
    fromBase64(envelope.data) as BufferSource,
  )
  return JSON.parse(decoder.decode(plain)) as T
}

export function isEnvelope(value: unknown): value is Envelope {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<Envelope>
  return v.pfd === 1 && typeof v.data === 'string' && typeof v.salt === 'string' && typeof v.iv === 'string'
}

export function newSalt(): string {
  return toBase64(randomBytes(16))
}

/** Basic strength gate for the login password. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.'
  if (!/[a-z]/i.test(password) || !/\d/.test(password)) return 'Include at least one letter and one number.'
  return null
}
