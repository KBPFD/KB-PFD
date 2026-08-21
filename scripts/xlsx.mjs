// Minimal dependency-free .xlsx reader: unzips the package and parses sheet XML.
import fs from 'node:fs'
import zlib from 'node:zlib'

function readZip(file) {
  const buf = fs.readFileSync(file)
  let eocd = -1
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a zip/xlsx file')

  const count = buf.readUInt16LE(eocd + 10)
  let ptr = buf.readUInt32LE(eocd + 16)
  const files = new Map()

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) break
    const method = buf.readUInt16LE(ptr + 10)
    const compressedSize = buf.readUInt32LE(ptr + 20)
    const nameLen = buf.readUInt16LE(ptr + 28)
    const extraLen = buf.readUInt16LE(ptr + 30)
    const commentLen = buf.readUInt16LE(ptr + 32)
    const localOffset = buf.readUInt32LE(ptr + 42)
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen)

    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(start, start + compressedSize)
    files.set(name, method === 0 ? raw : zlib.inflateRawSync(raw))

    ptr += 46 + nameLen + extraLen + commentLen
  }
  return files
}

const decodeXml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')

const colOf = (ref) => ref.replace(/\d+/g, '')

/**
 * Reads a workbook into `{ [sheetName]: Array<{ r, cells: { A: value } }> }`.
 * Values are raw strings; numbers stay as text so callers decide how to coerce.
 */
export function readWorkbook(file) {
  const zip = readZip(file)
  const text = (name) => zip.get(name)?.toString('utf8') ?? ''

  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')),
  )

  const rels = Object.fromEntries(
    [...text('xl/_rels/workbook.xml.rels').matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [
      m[1],
      m[2].replace(/^\/?xl\//, ''),
    ]),
  )

  const sheets = {}
  for (const m of text('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const name = decodeXml(m[1])
    const xml = text('xl/' + rels[m[2]])
    const rows = []
    for (const rowMatch of xml.matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = {}
      for (const c of rowMatch[2].matchAll(/<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]
        const body = c[2] ?? ''
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
        if (!ref) continue
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1]
        const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body)?.[1]
        let value
        if (inline !== undefined) value = decodeXml(inline)
        else if (/t="s"/.test(attrs)) value = shared[Number(v)]
        else if (/t="(str|inlineStr)"/.test(attrs)) value = decodeXml(v ?? '')
        else value = v
        if (value !== undefined && value !== '') cells[colOf(ref)] = value
      }
      if (Object.keys(cells).length) rows.push({ r: Number(rowMatch[1]), cells })
    }
    sheets[name] = rows
  }
  return sheets
}

/** Excel serial date -> yyyy-mm-dd (1900 date system). */
export function serialToISO(serial) {
  const n = Number(serial)
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null
  const ms = Math.round((n - 25569) * 86400000)
  return new Date(ms).toISOString().slice(0, 10)
}

export const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
