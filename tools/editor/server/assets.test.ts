import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { readRepoAsset, writeImageAsset } from './assets.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

describe('readRepoAsset', () => {
  afterEach(() => {
    delete process.env.EDITOR_REPO_ROOT
  })

  it('rejects path escape attempts', async () => {
    process.env.EDITOR_REPO_ROOT = repoRoot
    await expect(readRepoAsset('/assets/../_config.yml')).rejects.toThrow()
    await expect(readRepoAsset('/assets/foo/../../Gemfile')).rejects.toThrow()
  })

  it('rejects non-assets paths', async () => {
    process.env.EDITOR_REPO_ROOT = repoRoot
    await expect(readRepoAsset('/_posts/x.md')).rejects.toThrow(/Only \/assets/)
  })

  it('serves a real asset under assets/', async () => {
    process.env.EDITOR_REPO_ROOT = repoRoot
    const { bytes, type } = await readRepoAsset('/assets/favicon.png')
    expect(bytes.byteLength).toBeGreaterThan(0)
    expect(type).toBe('image/png')
  })
})

describe('writeImageAsset', () => {
  const written: string[] = []

  afterEach(async () => {
    delete process.env.EDITOR_REPO_ROOT
    for (const p of written.splice(0)) {
      await fs.unlink(p).catch(() => undefined)
    }
  })

  it('writes PNG under assets/images/YYYY/ with site-root path', async () => {
    process.env.EDITOR_REPO_ROOT = repoRoot
    // 1x1 PNG
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const result = await writeImageAsset({
      bytes: png,
      mime: 'image/png',
      originalName: 'M5 Smoke Dot.png',
    })
    written.push(result.absolutePath)
    expect(result.path).toMatch(/^\/assets\/images\/\d{4}\/m5-smoke-dot\.png$/)
    expect(result.mime).toBe('image/png')
    const disk = await fs.readFile(result.absolutePath)
    expect(disk.equals(png)).toBe(true)
    const served = await readRepoAsset(result.path)
    expect(served.bytes.equals(png)).toBe(true)
  })

  it('rejects non-image mime types', async () => {
    process.env.EDITOR_REPO_ROOT = repoRoot
    await expect(
      writeImageAsset({
        bytes: Buffer.from('hello'),
        mime: 'text/plain',
        originalName: 'x.txt',
      }),
    ).rejects.toThrow(/PNG\/JPEG/)
  })

  it('infers jpeg mime from filename when browser sends octet-stream', async () => {
    process.env.EDITOR_REPO_ROOT = repoRoot
    const jpeg = Buffer.from('/agent/repos/neitomic.github.io/assets/favicon.png')
    // reuse tiny png bytes but name as .jpg only for mime-inference path check —
    // write still succeeds based on extension mapping.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    void jpeg
    const result = await writeImageAsset({
      bytes: png,
      mime: 'application/octet-stream',
      originalName: 'shot.JPG',
    })
    written.push(result.absolutePath)
    expect(result.path).toMatch(/\/shot\.jpg$/)
    expect(result.mime).toBe('image/jpeg')
  })
})
