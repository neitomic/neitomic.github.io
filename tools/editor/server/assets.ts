import { promises as fs } from 'node:fs'
import path from 'node:path'
import { resolveRepoRoot } from './repo.ts'

const SAFE_SEGMENT = /^[A-Za-z0-9._\-]+$/

const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
])

function contentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    case '.svg':
      return 'image/svg+xml'
    case '.pdf':
      return 'application/pdf'
    default:
      return 'application/octet-stream'
  }
}

function extForMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return '.png'
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg'
    case 'image/gif':
      return '.gif'
    case 'image/webp':
      return '.webp'
    default:
      throw new Error(`Unsupported image type: ${mime}`)
  }
}

function yearInIct(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  }).format(d)
}

function slugifyImageBase(name: string): string {
  const stem = name.replace(/\.[^.]+$/, '')
  const slug = stem
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return slug || 'image'
}

/**
 * Resolve a request pathname like `/assets/foo.png` under repoRoot/assets.
 */
export async function readRepoAsset(pathname: string): Promise<{
  bytes: Buffer
  type: string
}> {
  if (!pathname.startsWith('/assets/')) {
    throw new Error('Only /assets paths are served')
  }
  if (pathname.includes('\0') || pathname.includes('..')) {
    throw new Error('Invalid asset path')
  }

  const parts = pathname.split('/').filter(Boolean) // ['assets', ...]
  if (parts[0] !== 'assets' || parts.length < 2) {
    throw new Error('Invalid asset path')
  }
  for (const part of parts) {
    if (!SAFE_SEGMENT.test(part)) {
      throw new Error('Invalid asset path')
    }
  }

  const root = await resolveRepoRoot()
  const assetsRoot = path.resolve(root, 'assets')
  const resolved = path.resolve(root, ...parts)
  const rel = path.relative(assetsRoot, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes assets/')
  }

  const st = await fs.stat(resolved)
  if (!st.isFile()) {
    throw new Error('Not a file')
  }

  const bytes = await fs.readFile(resolved)
  return { bytes, type: contentType(resolved) }
}

export type WrittenAsset = {
  /** Site-root path, e.g. `/assets/images/2026/photo.png` */
  path: string
  /** Absolute filesystem path under the repo */
  absolutePath: string
  mime: string
  bytes: number
}

/**
 * Copy an uploaded image into `assets/images/YYYY/` and return a site-root path.
 */
function inferMime(mime: string, originalName: string): string {
  const given = mime.toLowerCase()
  if (ALLOWED_IMAGE_MIME.has(given) && given !== 'application/octet-stream') {
    return given === 'image/jpg' ? 'image/jpeg' : given
  }
  const ext = path.extname(originalName).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      return given
  }
}

export async function writeImageAsset(input: {
  bytes: Buffer
  mime: string
  originalName: string
}): Promise<WrittenAsset> {
  const mime = inferMime(input.mime, input.originalName)
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    throw new Error('Only PNG/JPEG (and GIF/WebP) images are accepted')
  }
  if (!input.bytes.length) {
    throw new Error('Empty image upload')
  }
  // Soft cap ~12MB — keeps local FS / paste sane
  if (input.bytes.length > 12 * 1024 * 1024) {
    throw new Error('Image too large (max 12MB)')
  }

  const root = await resolveRepoRoot()
  const year = yearInIct()
  const dir = path.resolve(root, 'assets', 'images', year)
  await fs.mkdir(dir, { recursive: true })

  const ext = extForMime(mime)
  let base = slugifyImageBase(input.originalName || `image${ext}`)
  if (!SAFE_SEGMENT.test(base)) {
    base = 'image'
  }

  let filename = `${base}${ext}`
  let absolutePath = path.join(dir, filename)
  let n = 2
  while (true) {
    try {
      await fs.access(absolutePath)
      filename = `${base}-${n}${ext}`
      absolutePath = path.join(dir, filename)
      n += 1
    } catch {
      break
    }
  }

  const assetsRoot = path.resolve(root, 'assets')
  const rel = path.relative(assetsRoot, absolutePath)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes assets/')
  }

  await fs.writeFile(absolutePath, input.bytes)
  return {
    path: `/assets/images/${year}/${filename}`,
    absolutePath,
    mime,
    bytes: input.bytes.length,
  }
}
