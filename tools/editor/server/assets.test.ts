import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { readRepoAsset } from './assets.ts'

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
