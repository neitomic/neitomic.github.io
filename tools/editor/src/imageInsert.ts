import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { uploadAsset } from './api'

const IMAGE_MIME = /^image\/(png|jpe?g|gif|webp)$/i

export function isImageFile(file: File): boolean {
  return IMAGE_MIME.test(file.type) || /\.(png|jpe?g|gif|webp)$/i.test(file.name)
}

export function markdownForAsset(path: string, originalName: string): string {
  const alt =
    originalName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'image'
  return `![${alt}](${path})`
}

async function ingestFiles(view: EditorView, files: File[], pos: number) {
  const images = files.filter(isImageFile)
  if (!images.length) return false

  const lines: string[] = []
  for (const file of images) {
    const uploaded = await uploadAsset(file)
    lines.push(markdownForAsset(uploaded.path, file.name))
  }
  const insert = `${lines.join('\n')}\n`
  // Re-read doc in case the user typed during upload; clamp insert pos.
  const safePos = Math.min(pos, view.state.doc.length)
  view.dispatch({
    changes: { from: safePos, to: safePos, insert },
    selection: EditorSelection.cursor(safePos + insert.length),
    scrollIntoView: true,
  })
  return true
}

/**
 * CodeMirror handlers: paste/drop images → assets/images/YYYY/ + Markdown insert.
 */
export function imageFileHandlers(opts?: { onError?: (message: string) => void }) {
  const fail = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[editor] image ingest failed', err)
    opts?.onError?.(message)
  }

  return EditorView.domEventHandlers({
    paste(event, view) {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (!files.some(isImageFile)) return false
      event.preventDefault()
      const pos = view.state.selection.main.head
      void ingestFiles(view, files, pos).catch(fail)
      return true
    },
    drop(event, view) {
      const files = Array.from(event.dataTransfer?.files ?? [])
      if (!files.some(isImageFile)) return false
      event.preventDefault()
      const coords =
        event.clientX || event.clientY
          ? view.posAtCoords({ x: event.clientX, y: event.clientY })
          : null
      const pos = coords ?? view.state.selection.main.head
      void ingestFiles(view, files, pos).catch(fail)
      return true
    },
    dragover(event) {
      if (event.dataTransfer?.types.includes('Files')) {
        event.preventDefault()
        return true
      }
      return false
    },
  })
}
