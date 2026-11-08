import { describe, expect, it } from 'vitest'
import {
  buildCoachCliArgs,
  normalizeEffortForCli,
  parseCoachReview,
} from './reviewCli.ts'

describe('buildCoachCliArgs', () => {
  it('passes model and effort to claude -p', () => {
    const built = buildCoachCliArgs('claude', 'Review me', {
      model: 'sonnet',
      effort: 'high',
    })
    expect(built.args).toEqual([
      '-p',
      '--output-format',
      'text',
      '--model',
      'sonnet',
      '--effort',
      'high',
      'Review me',
    ])
    expect(built.stdin).toBeNull()
  })

  it('maps codex effort via -c model_reasoning_effort', () => {
    const built = buildCoachCliArgs('codex', 'Prompt', {
      model: 'gpt-5.4',
      effort: 'max',
    })
    expect(built.args).toContain('exec')
    expect(built.args).toContain('--model')
    expect(built.args).toContain('gpt-5.4')
    expect(built.args).toContain('-c')
    expect(built.args).toContain('model_reasoning_effort=xhigh')
    expect(built.stdin).toBe('Prompt')
  })

  it('uses grok --prompt-file with model and effort', () => {
    const built = buildCoachCliArgs('grok', 'unused when file set', {
      model: 'grok-4',
      effort: 'medium',
      promptFile: '/tmp/coach.md',
    })
    expect(built.args).toEqual([
      '-p',
      '--prompt-file',
      '/tmp/coach.md',
      '--output-format',
      'plain',
      '--model',
      'grok-4',
      '--effort',
      'medium',
    ])
  })
})

describe('normalizeEffortForCli', () => {
  it('maps minimal→low for claude and max→xhigh for codex', () => {
    expect(normalizeEffortForCli('claude', 'minimal')).toBe('low')
    expect(normalizeEffortForCli('codex', 'max')).toBe('xhigh')
    expect(normalizeEffortForCli('grok', 'default')).toBeNull()
  })
})


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
