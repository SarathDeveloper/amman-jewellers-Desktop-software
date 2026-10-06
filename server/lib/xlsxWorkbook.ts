import { writeFileSync } from 'node:fs'

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let crc = i
  for (let j = 0; j < 8; j++) {
    crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
  }
  CRC_TABLE[i] = crc >>> 0
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i++) {
    crc = CRC_TABLE[(crc ^ buffer[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2)
  buffer.writeUInt16LE(value >>> 0, 0)
  return buffer
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32LE(value >>> 0, 0)
  return buffer
}

type ZipEntry = {
  name: string
  data: Buffer
}

function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const crc = crc32(entry.data)
    const size = entry.data.length
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      name,
      entry.data,
    ])
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ])
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }

  const localBytes = Buffer.concat(locals)
  const centralBytes = Buffer.concat(centrals)
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralBytes.length),
    u32(localBytes.length),
    u16(0),
  ])
  return Buffer.concat([localBytes, centralBytes, eocd])
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

export function colLetter(index: number): string {
  let n = index
  let out = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    out = String.fromCharCode(65 + rem) + out
    n = Math.floor((n - 1) / 26)
  }
  return out
}

export function uniqueSheetName(raw: string, used: Set<string>): string {
  const cleaned = raw.replace(/[\\/?*[\]:]/g, '_').trim() || 'sheet'
  let name = cleaned.slice(0, 31)
  let suffix = 1
  while (used.has(name.toLowerCase())) {
    const label = String(suffix)
    name = `${cleaned.slice(0, Math.max(1, 31 - label.length - 1))}_${label}`
    suffix += 1
  }
  used.add(name.toLowerCase())
  return name
}

export type ExcelSheet = {
  name: string
  columns: string[]
  rows: unknown[][]
}

const MAX_ROWS = 1_048_575
const MAX_CELL = 32_767

function cellXml(value: unknown, ref: string): string {
  if (value === null || value === undefined) {
    return `<c r="${ref}"/>`
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${ref}"><v>${value}</v></c>`
  }
  if (typeof value === 'bigint') {
    return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value.toString())}</t></is></c>`
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}"><v>${value ? 1 : 0}</v></c>`
  }
  if (Buffer.isBuffer(value)) {
    const hex = value.toString('hex').slice(0, MAX_CELL)
    return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(hex)}</t></is></c>`
  }
  const text = String(value).slice(0, MAX_CELL)
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`
}

function sheetXml(sheet: ExcelSheet): string {
  const columns = sheet.columns
  const rows = sheet.rows.slice(0, MAX_ROWS)
  const lastCol = Math.max(columns.length, 1)
  const lastRow = rows.length + 1
  const dim = `A1:${colLetter(lastCol)}${lastRow}`
  const header = columns
    .map((name, i) => cellXml(name, `${colLetter(i + 1)}1`))
    .join('')
  const body = rows
    .map((row, rowIndex) => {
      const r = rowIndex + 2
      const cells = columns
        .map((_, i) => cellXml(row[i], `${colLetter(i + 1)}${r}`))
        .join('')
      return `<row r="${r}">${cells}</row>`
    })
    .join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="${dim}"/>` +
    `<sheetData>` +
    `<row r="1">${header}</row>` +
    body +
    `</sheetData></worksheet>`
  )
}

function workbookXml(names: string[]): string {
  const sheets = names
    .map(
      (name, i) =>
        `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets>${sheets}</sheets></workbook>`
  )
}

function workbookRels(count: number): string {
  const rels = Array.from({ length: count }, (_, i) => {
    const id = i + 1
    return (
      `<Relationship Id="rId${id}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ` +
      `Target="worksheets/sheet${id}.xml"/>`
    )
  }).join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    rels +
    `</Relationships>`
  )
}

function contentTypes(count: number): string {
  const sheets = Array.from(
    { length: count },
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join('')
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    sheets +
    `</Types>`
  )
}

const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`

export function buildXlsxBuffer(sheets: ExcelSheet[]): Buffer {
  const used = new Set<string>()
  const named = sheets.map((sheet) => ({ ...sheet, name: uniqueSheetName(sheet.name, used) }))
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes(named.length), 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(ROOT_RELS, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml(named.map((sheet) => sheet.name)), 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels(named.length), 'utf8') },
  ]
  named.forEach((sheet, i) => {
    entries.push({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: Buffer.from(sheetXml(sheet), 'utf8'),
    })
  })
  return buildZip(entries)
}

export function writeXlsxFile(destinationPath: string, sheets: ExcelSheet[]): void {
  writeFileSync(destinationPath, buildXlsxBuffer(sheets))
}
