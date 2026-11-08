import { promises as fs } from 'node:fs'
import path from 'node:path'
import { resolveRepoRoot } from './repo.ts'

const SAFE_SEGMENT = /^[A-Za-z0-9._\-]+$/

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
