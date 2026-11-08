import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorView, highlightActiveLine, keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

type Props = {
  value: string
  onChange: (value: string) => void
  /** Writing mode = body only; source = full raw file. */
  mode: 'write' | 'source'
  /** iA-quiet typewriter emphasis on the active line. */
  focusMode?: boolean
  placeholder?: string
}

const inkHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700', color: '#1c1915' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, color: '#3d5a45' },
  { tag: t.url, color: '#6b6458' },
  { tag: t.monospace, color: '#5a4632', fontFamily: 'var(--font-mono)' },
  { tag: t.heading1, fontSize: '1.25em' },
  { tag: t.heading2, fontSize: '1.12em' },
  { tag: t.meta, color: '#6b6458' },
  { tag: t.comment, color: '#8a8274', fontStyle: 'italic' },
])

const editorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    fontSize: '1.05rem',
  },
  '.cm-content': {
    fontFamily: 'var(--font-body)',
    lineHeight: '1.7',
    caretColor: '#1c1915',
    maxWidth: '68ch',
    paddingBottom: '3rem',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--font-body)',
  },
})

const sourceTheme = EditorView.theme({
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.92rem',
    lineHeight: '1.55',
    maxWidth: '78ch',
  },
})

/** Dim non-active lines while focused — typewriter / iA Writer quiet. */
const focusTheme = EditorView.theme({
  '.cm-content': {
    fontSize: '1.12rem',
    lineHeight: '1.75',
    maxWidth: '65ch',
  },
  '&.cm-focused .cm-line': {
    opacity: 0.38,
    transition: 'opacity 120ms ease',
  },
  '&.cm-focused .cm-activeLine': {
    opacity: 1,
    backgroundColor: 'transparent',
  },
  /* Keep marks on the active line readable */
  '&.cm-focused .cm-activeLine .cm-decoration': {
    opacity: 1,
  },
})

export function MarkdownField({
  value,
  onChange,
  mode,
  focusMode = false,
  placeholder,
}: Props) {
  const extensions = useMemo(
    () => [
      markdown({ base: markdownLanguage }),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.lineWrapping,
      highlightActiveLine(),
      syntaxHighlighting(inkHighlight),
      editorTheme,
      ...(mode === 'source' ? [sourceTheme] : []),
      ...(focusMode && mode === 'write' ? [focusTheme] : []),
      EditorView.contentAttributes.of({
        'aria-label': mode === 'source' ? 'Raw source' : 'Post body',
        spellcheck: mode === 'write' ? 'true' : 'false',
      }),
    ],
    [mode, focusMode],
  )

  return (
    <div className={`cm-shell mode-${mode} ${focusMode ? 'focus-on' : ''}`}>
      <CodeMirror
        value={value}
        height="auto"
        minHeight="min(60vh, 32rem)"
        theme="none"
        basicSetup={false}
        placeholder={placeholder}
        extensions={extensions}
        onChange={onChange}
      />
    </div>
  )
}
