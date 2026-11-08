import { describe, expect, it } from 'vitest'
import { parseCoachReview } from './reviewCli.ts'

describe('parseCoachReview', () => {
  it('splits the four coach headings', () => {
    const md = `### Structure
Tighten the lede.

### Coverage gaps
Add one concrete example.

### Clarity
Replace "various things" with the list.

### Grammar appendix (optional)
None.
`
    const sections = parseCoachReview(md)
    expect(sections.map((s) => s.id)).toEqual([
      'structure',
      'coverage',
      'clarity',
      'grammar',
    ])
    expect(sections[0]?.body).toContain('Tighten the lede')
    expect(sections[1]?.body).toContain('concrete example')
  })

  it('drops empty grammar appendix', () => {
    const md = `### Structure
Ok.

### Coverage gaps
Ok.

### Clarity
Ok.

### Grammar appendix (optional)

`
    const sections = parseCoachReview(md)
    expect(sections.map((s) => s.id)).toEqual([
      'structure',
      'coverage',
      'clarity',
    ])
  })

  it('falls back to a single Review section without headings', () => {
    const sections = parseCoachReview('Just some freeform notes.')
    expect(sections).toHaveLength(1)
    expect(sections[0]?.id).toBe('other')
    expect(sections[0]?.body).toContain('freeform notes')
  })

  it('keeps preface under Notes when headings follow', () => {
    const md = `Overall strong draft.

### Structure
Reorder section two.
`
    const sections = parseCoachReview(md)
    expect(sections[0]).toMatchObject({ id: 'other', title: 'Notes' })
    expect(sections[0]?.body).toContain('Overall strong')
    expect(sections[1]?.id).toBe('structure')
  })
})
