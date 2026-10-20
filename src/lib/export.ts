import { getViewportForBounds } from '@xyflow/react'
import { toPng } from 'html-to-image'
import type { DwellNode, Mode } from '../types'
import { dimsOf } from './layout'
import { presenceState } from './time'

function download(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'diagram'

export function downloadText(text: string, name: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  download(url, name)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Renders whatever is visible in the current state to a PNG, framed to fit. */
export async function exportPng(nodes: DwellNode[], mode: Mode, title: string): Promise<boolean> {
  const visible = nodes.filter((n) => presenceState(n.data.presence, mode) !== 'hidden')
  const el = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!visible.length || !el) return false

  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const n of visible) {
    const { w, h } = dimsOf(n)
    x0 = Math.min(x0, n.position.x)
    y0 = Math.min(y0, n.position.y)
    x1 = Math.max(x1, n.position.x + w)
    y1 = Math.max(y1, n.position.y + h)
  }
  const width = Math.min(4000, Math.max(1200, Math.ceil(x1 - x0 + 160)))
  const height = Math.min(4000, Math.max(600, Math.ceil(y1 - y0 + 160)))
  const vp = getViewportForBounds({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, width, height, 0.2, 2, 0.06)
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || '#f3f4f6'

  const url = await toPng(el, {
    backgroundColor: bg,
    width,
    height,
    pixelRatio: 2,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    },
  })
  download(url, `${slug(title)}-${mode}.png`)
  return true
}
