import { useDeferredValue, useMemo } from 'react'
import { previewMarkdownSource, renderMarkdown } from './renderMarkdown'

type Props = {
  mode: 'write' | 'source'
  body: string
  raw: string
  title: string
}

export function PreviewPane({ mode, body, raw, title }: Props) {
  const source = previewMarkdownSource(mode, body, raw)
  const deferred = useDeferredValue(source)
  const html = useMemo(() => renderMarkdown(deferred), [deferred])

  return (
    <aside className="preview-pane" aria-label="Markdown preview">
      <p className="preview-label">Preview</p>
      {title.trim() && mode === 'write' && (
        <h1 className="preview-title">{title}</h1>
      )}
      <div
        className="preview-body"
        // markdown-it runs with html:false; output is generated tags only.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </aside>
  )
}
