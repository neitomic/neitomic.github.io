import { describe, expect, it } from 'vitest'
import { isImageFile, markdownForAsset } from './imageInsert'

describe('markdownForAsset', () => {
  it('builds site-root image markdown', () => {
    expect(markdownForAsset('/assets/images/2026/photo.png', 'photo.png')).toBe(
      '![photo](/assets/images/2026/photo.png)',
    )
  })
})

describe('isImageFile', () => {
  it('accepts png/jpeg by mime or extension', () => {
    expect(
      isImageFile({ name: 'a.png', type: 'image/png' } as File),
    ).toBe(true)
    expect(
      isImageFile({ name: 'b.JPG', type: '' } as File),
    ).toBe(true)
    expect(
      isImageFile({ name: 'c.txt', type: 'text/plain' } as File),
    ).toBe(false)
  })
})
