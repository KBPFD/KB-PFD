import { getAccessToken, requestAccessToken } from './googleAuth'

export const FOLDER_NAME = 'PFD_KB'
export const FILE_NAME = 'finance-data.json'

const FILE_ID_KEY = 'pfd.fileId'
const FOLDER_ID_KEY = 'pfd.folderId'

async function authHeader(): Promise<Record<string, string>> {
  let tokenValue = getAccessToken()
  if (!tokenValue) tokenValue = await requestAccessToken({ silent: true })
  return { Authorization: `Bearer ${tokenValue}` }
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = { ...(init.headers as Record<string, string>), ...(await authHeader()) }
  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) {
    // Token expired mid-session: get a fresh one and retry once.
    const fresh = await requestAccessToken({ silent: true })
    return fetch(url, { ...init, headers: { ...headers, Authorization: `Bearer ${fresh}` } })
  }
  return res
}

async function driveJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await driveFetch(url, init)
  if (!res.ok) throw new Error(`Google Drive error ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

interface DriveFile {
  id: string
  name: string
  modifiedTime?: string
}

async function findFolder(): Promise<string | null> {
  const cached = localStorage.getItem(FOLDER_ID_KEY)
  if (cached) return cached
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )
  const data = await driveJson<{ files: DriveFile[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
  )
  const id = data.files[0]?.id ?? null
  if (id) localStorage.setItem(FOLDER_ID_KEY, id)
  return id
}

async function ensureFolder(): Promise<string> {
  const existing = await findFolder()
  if (existing) return existing
  const created = await driveJson<DriveFile>('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  localStorage.setItem(FOLDER_ID_KEY, created.id)
  return created.id
}

async function findFile(folderId: string): Promise<DriveFile | null> {
  const cachedId = localStorage.getItem(FILE_ID_KEY)
  if (cachedId) {
    const res = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${cachedId}?fields=id,name,modifiedTime`,
    )
    if (res.ok) return (await res.json()) as DriveFile
    localStorage.removeItem(FILE_ID_KEY)
  }
  const q = encodeURIComponent(`name='${FILE_NAME}' and '${folderId}' in parents and trashed=false`)
  const data = await driveJson<{ files: DriveFile[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)&spaces=drive`,
  )
  const file = data.files[0] ?? null
  if (file) localStorage.setItem(FILE_ID_KEY, file.id)
  return file
}

export interface DriveLoadResult {
  /** raw file contents: either an encrypted envelope or a legacy plain data file */
  raw: unknown | null
  fileId: string | null
  modifiedTime?: string
}

export async function loadFromDrive(): Promise<DriveLoadResult> {
  const folderId = await ensureFolder()
  const file = await findFile(folderId)
  if (!file) return { raw: null, fileId: null }
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`)
  if (!res.ok) throw new Error(`Could not download data file (${res.status})`)
  const text = await res.text()
  try {
    return { raw: JSON.parse(text), fileId: file.id, modifiedTime: file.modifiedTime }
  } catch {
    throw new Error('The data file in Google Drive is corrupted or not valid JSON.')
  }
}

export async function saveToDrive(payload: unknown): Promise<string> {
  const folderId = await ensureFolder()
  const existing = await findFile(folderId)
  const body = JSON.stringify(payload, null, 2)

  if (existing) {
    const res = await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media&fields=id`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body },
    )
    if (!res.ok) throw new Error(`Could not save to Drive (${res.status})`)
    return existing.id
  }

  const boundary = `pfd${Math.random().toString(36).slice(2)}`
  const metadata = { name: FILE_NAME, parents: [folderId], mimeType: 'application/json' }
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n` +
    `--${boundary}--`

  const created = await driveJson<DriveFile>(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body: multipart,
    },
  )
  localStorage.setItem(FILE_ID_KEY, created.id)
  return created.id
}

export function clearDriveCache() {
  localStorage.removeItem(FILE_ID_KEY)
  localStorage.removeItem(FOLDER_ID_KEY)
}
