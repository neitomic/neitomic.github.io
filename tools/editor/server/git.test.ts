import { describe, expect, it } from 'vitest'
import {
  assertPublishPath,
  defaultCommitMessage,
  suggestPublishPaths,
  type GitStatus,
} from './git.ts'

describe('assertPublishPath', () => {
  it('allows posts and assets only', () => {
    expect(assertPublishPath('_posts/2026-01-01-hi.md')).toBe(
      '_posts/2026-01-01-hi.md',
    )
    expect(assertPublishPath('assets/images/2026/a.png')).toBe(
      'assets/images/2026/a.png',
    )
  })

  it('rejects escapes and other trees', () => {
    expect(() => assertPublishPath('../etc/passwd')).toThrow()
    expect(() => assertPublishPath('tools/editor/package.json')).toThrow()
    expect(() => assertPublishPath('_posts/nested/x.md')).toThrow()
  })
})

describe('defaultCommitMessage', () => {
  const base: GitStatus = {
    branch: 'editor-v1',
    clean: false,
    files: [],
    publishable: [],
  }

  it('uses Add for untracked posts', () => {
    const status: GitStatus = {
      ...base,
      files: [{ path: '_posts/a.md', code: '??' }],
    }
    expect(defaultCommitMessage('Hello', '_posts/a.md', status)).toBe(
      'Add post: Hello',
    )
  })

  it('uses Update for modified posts', () => {
    const status: GitStatus = {
      ...base,
      files: [{ path: '_posts/a.md', code: 'M' }],
    }
    expect(defaultCommitMessage('Hello', '_posts/a.md', status)).toBe(
      'Update post: Hello',
    )
  })

  it('uses Update when the post is clean (already tracked)', () => {
    expect(defaultCommitMessage('Hello', '_posts/a.md', base)).toBe(
      'Update post: Hello',
    )
  })
})

describe('suggestPublishPaths', () => {
  it('includes dirty post and assets', () => {
    const status: GitStatus = {
      branch: 'x',
      clean: false,
      files: [
        { path: '_posts/a.md', code: '??' },
        { path: 'assets/images/2026/x.png', code: '??' },
        { path: 'README.md', code: ' M' },
      ],
      publishable: [
        { path: '_posts/a.md', code: '??' },
        { path: 'assets/images/2026/x.png', code: '??' },
      ],
    }
    expect(suggestPublishPaths('a.md', status).sort()).toEqual([
      '_posts/a.md',
      'assets/images/2026/x.png',
    ])
  })

  it('always includes the post even when clean', () => {
    const status: GitStatus = {
      branch: 'x',
      clean: false,
      files: [{ path: 'assets/images/2026/x.png', code: '??' }],
      publishable: [{ path: 'assets/images/2026/x.png', code: '??' }],
    }
    expect(suggestPublishPaths('a.md', status).sort()).toEqual([
      '_posts/a.md',
      'assets/images/2026/x.png',
    ])
  })
})
