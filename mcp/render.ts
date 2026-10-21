/** Draws a diagram as a 1920x1080 slide in SVG, without a browser. Used for exports from the MCP server. */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { DwellDoc } from '../src/lib/doc'
import { DIMS } from '../src/lib/layout'
import { fmt, fmtDelta, longestStep, presenceState, stepMins, summarise } from '../src/lib/time'
import { LOGO_PATH, LOGO_RATIO, LOGO_VIEWBOX } from '../src/lib/logo'
import { inkOn } from '../src/lib/palette'
import type { Mode } from '../src/types'

export type Theme = 'green' | 'light' | 'dark'

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const W = 1920
const H = 1080

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

function palette(theme: Theme) {
  if (theme === 'light') return { bg: '#f3f6f4', ink: '#10231b', muted: '#5a6b63', node: '#ffffff', nodeOpacity: 1, line: '#5a6b63', chip: '#ffffff', stroke: '#c9d4cd', logo: '#10231b', saved: '#0a8a3a', added: '#b45f06', bar: '#10231b' }
  if (theme === 'dark') return { bg: '#14161a', ink: '#f2f4f3', muted: '#9aa4a0', node: '#ffffff', nodeOpacity: 0.09, line: '#a9b3af', chip: '#1d2025', stroke: '#2e333a', logo: '#f2f4f3', saved: '#7be3a0', added: '#f5a623', bar: '#ffffff' }
  return { bg: '', ink: '#ffffff', muted: 'rgba(255,255,255,0.72)', node: '#ffffff', nodeOpacity: 0.9, line: 'rgba(255,255,255,0.8)', chip: 'rgba(8,30,18,0.55)', stroke: 'rgba(255,255,255,0.25)', logo: '#ffffff', saved: '#0a8a3a', added: '#b45f06', bar: '#10231b' }
}

export function renderSvg(doc: DwellDoc, opts: { mode?: Mode; theme?: Theme } = {}): string {
  const mode: Mode = opts.mode ?? doc.mode ?? 'current'
  const theme = opts.theme ?? 'green'
  const P = palette(theme)
  const dark = theme !== 'light'
  const nodeInk = theme === 'dark' ? '#f2f4f3' : '#10231b'
  const nodeMuted = theme === 'dark' ? '#9aa4a0' : '#5a6b63'

  // Future can have its own layout
  const placed = doc.nodes.map((n) => (mode === 'future' && n.data.futurePos ? { ...n, position: n.data.futurePos } : n))
  const live = placed.filter((n) => presenceState(n.data.presence, mode) !== 'hidden')
  const liveIds = new Set(live.map((n) => n.id))
  const byId = new Map(placed.map((n) => [n.id, n]))
  const max = longestStep(doc.nodes)

  // Bounds of everything drawn, then fit it into the area under the title.
  const boxes = [
    ...live.map((n) => ({ x: n.position.x, y: n.position.y, w: DIMS[n.data.kind].w, h: DIMS[n.data.kind].h })),
    ...doc.zones.map((z) => ({ x: z.x, y: z.y, w: z.w || 160, h: z.h || 36 })),
  ]
  const pad = 24
  const minX = Math.min(...boxes.map((b) => b.x), 0) - pad
  const minY = Math.min(...boxes.map((b) => b.y), 0) - pad
  const maxX = Math.max(...boxes.map((b) => b.x + b.w), 1) + pad
  const maxY = Math.max(...boxes.map((b) => b.y + b.h), 1) + pad
  const area = { x: 80, y: 176, w: W - 160, h: H - 176 - 150 }
  const scale = Math.min(area.w / (maxX - minX), area.h / (maxY - minY), 1.6)
  const ox = area.x + (area.w - (maxX - minX) * scale) / 2 - minX * scale
  const oy = area.y + (area.h - (maxY - minY) * scale) / 2 - minY * scale

  const out: string[] = []
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`)
  out.push('<defs>')
  out.push('<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171817"/><stop offset="1" stop-color="#048a24"/></linearGradient>')
  out.push('<filter id="shadow" x="-20%" y="-30%" width="140%" height="190%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.28"/></filter>')
  out.push('</defs>')
  out.push(`<rect width="${W}" height="${H}" fill="${theme === 'green' ? 'url(#bg)' : P.bg}"/>`)
  if (theme === 'green') {
    const wp = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'waves.png')
    if (existsSync(wp)) out.push(`<image href="data:image/png;base64,${readFileSync(wp).toString('base64')}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="0.9"/>`)
  }

  // Title and totals
  const sum = summarise(doc.nodes, doc.runsPerMonth, doc.ratePerHour)
  out.push(`<text x="80" y="98" font-size="44" font-weight="700" fill="${P.ink}">${esc(clip(doc.title, 70))}</text>`)
  const sub = doc.subtitle ?? (mode === 'current' ? `Today: ${fmt(sum.current)} of effort per run` : `After automation: ${fmt(sum.future)} per run, ${fmt(sum.saved)} saved (${Math.round(sum.pct)}%)`)
  out.push(`<text x="80" y="136" font-size="22" fill="${P.muted}">${esc(sub)}</text>`)

  out.push(`<g transform="translate(${ox} ${oy}) scale(${scale})">`)

  // Areas first, behind everything
  for (const z of doc.zones.filter((q) => q.kind === 'area')) {
    out.push(`<rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="10" fill="${z.color}" fill-opacity="0.14" stroke="${z.color}" stroke-width="2" stroke-dasharray="8 6"/>`)
    out.push(chip(z.x + 12, z.y - 1, z.label, z.color))
  }

  // Connectors: flow ribbons, then the line
  // Connectors that loop back run under the whole diagram, so they never cut through a step.
  const floor = Math.max(0, ...live.map((n) => n.position.y + DIMS[n.data.kind].h))
  const edges = doc.edges.filter((e) => liveIds.has(e.source) && liveIds.has(e.target))
  for (const e of edges) {
    const s = byId.get(e.source)!
    const t = byId.get(e.target)!
    const p = route(s, t, doc.direction, floor)
    const flows = doc.flows.filter((f) => e.data?.flows?.includes(f.id))
    flows.forEach((f, i) => out.push(`<path d="${p.d}" fill="none" stroke="${f.color}" stroke-opacity="0.6" stroke-width="${7 + (flows.length - i) * 5}" stroke-linecap="round" stroke-linejoin="round"/>`))
    const ghost = mode === 'future' && (s.data.presence === 'current-only' || t.data.presence === 'current-only')
    out.push(`<path d="${p.d}" fill="none" stroke="${P.line}" stroke-width="1.8" stroke-linejoin="round" ${ghost ? 'stroke-dasharray="5 5" opacity="0.5"' : ''}/>`)
    out.push(`<path d="${arrow(p.end, doc.direction)}" fill="${P.line}"/>`)
    if (e.data?.label) out.push(chipCentre(p.mid.x, p.mid.y, e.data.label, P.chip, P.ink, P.stroke))
  }

  // Steps
  for (const n of live) {
    const d = n.data
    const { w, h } = DIMS[d.kind]
    const x = n.position.x
    const y = n.position.y
    const ghost = presenceState(d.presence, mode) === 'ghost'
    out.push(`<g opacity="${ghost ? 0.42 : 1}">`)
    const fill = `fill="${P.node}" fill-opacity="${P.nodeOpacity}" stroke="${dark && theme === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.9)'}" stroke-width="1"`
    if (d.kind === 'decision') out.push(`<polygon points="${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}" ${fill} filter="url(#shadow)"/>`)
    else if (d.kind === 'input') out.push(`<polygon points="${x + 12},${y} ${x + w},${y} ${x + w - 12},${y + h} ${x},${y + h}" ${fill} filter="url(#shadow)"/>`)
    else if (d.kind === 'automation') out.push(`<polygon points="${x},${y} ${x + w - 16},${y} ${x + w},${y + 16} ${x + w},${y + h} ${x},${y + h}" ${fill} filter="url(#shadow)"/>`)
    else out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" ${fill} filter="url(#shadow)"/>`)

    const mins = stepMins(d, mode)
    const times =
      mode === 'current'
        ? [{ t: fmt(d.current), c: nodeInk, strike: false }]
        : d.presence === 'future-only'
          ? [{ t: fmtDelta(d.future), c: P.added, strike: false }]
          : (() => {
              const delta = d.presence === 'current-only' ? -d.current : d.future - d.current
              const r = [{ t: fmt(d.current), c: nodeMuted, strike: true }]
              if (Math.abs(delta) > 0.004) r.push({ t: fmtDelta(delta), c: delta < 0 ? P.saved : P.added, strike: false })
              return r
            })()
    const showTimes = !(d.current === 0 && d.future === 0)
    if (d.kind === 'decision') {
      out.push(`<text x="${x + w / 2}" y="${y + h / 2 - 2}" font-size="12.5" font-weight="600" fill="${nodeInk}" text-anchor="middle">${esc(clip(d.label, 18))}</text>`)
      if (showTimes) out.push(`<text x="${x + w / 2}" y="${y + h / 2 + 14}" font-size="11" fill="${nodeMuted}" text-anchor="middle">${esc(times.map((q) => q.t).join(' '))}</text>`)
    } else {
      out.push(`<text x="${x + 14}" y="${y + 21}" font-size="13" font-weight="600" fill="${nodeInk}">${esc(clip(d.label, mode === 'future' && d.lever && d.lever !== 'none' ? 20 : 27))}</text>`)
      out.push(`<text x="${x + 14}" y="${y + 37}" font-size="10.5" fill="${nodeMuted}">${esc(clip(d.tool, 17))}</text>`)
      if (showTimes) {
        let tx = x + w - 12
        for (const q of [...times].reverse()) {
          out.push(`<text x="${tx}" y="${y + 37}" font-size="11.5" font-weight="600" fill="${q.c}" text-anchor="end"${q.strike ? ' text-decoration="line-through"' : ''}>${esc(q.t)}</text>`)
          tx -= q.t.length * 6.4 + 8
        }
      }
      if (mode === 'future' && d.lever && d.lever !== 'none') {
        const label = d.lever === 'ai' ? 'AI' : 'Auto'
        const bw = label.length * 7 + 12
        out.push(`<rect x="${x + w - 12 - bw}" y="${y + 8}" width="${bw}" height="15" rx="7.5" fill="${d.lever === 'ai' ? '#6d4bd6' : '#0a8a3a'}"/>`)
        out.push(`<text x="${x + w - 12 - bw / 2}" y="${y + 19}" font-size="9.5" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>`)
      }
      // time bar
      const bw = w - 28
      out.push(`<rect x="${x + 14}" y="${y + h - 9}" width="${bw}" height="3" rx="1.5" fill="${nodeInk}" fill-opacity="0.12"/>`)
      out.push(`<rect x="${x + 14}" y="${y + h - 9}" width="${Math.max(0, (mins / max) * bw)}" height="3" rx="1.5" fill="${P.bar}" fill-opacity="0.75"/>`)
    }
    out.push('</g>')
  }

  // Labels sit in front
  for (const z of doc.zones.filter((q) => q.kind === 'label')) out.push(chip(z.x, z.y, z.label, z.color, 14))
  out.push('</g>')

  // Footer: logo, totals, flow key
  const lw = 150
  out.push(`<svg x="80" y="${H - 86}" width="${lw}" height="${lw / LOGO_RATIO}" viewBox="${LOGO_VIEWBOX}"><path d="${LOGO_PATH}" fill="${P.logo}" fill-rule="evenodd"/></svg>`)
  out.push(`<text x="260" y="${H - 66}" font-size="17" fill="${P.muted}">${esc(`${fmt(sum.current)} now  ·  ${fmt(sum.future)} after  ·  ${fmt(sum.saved)} saved per run  ·  ${Math.round(sum.hoursPerMonth)} h back a month`)}</text>`)
  out.push(`<text x="260" y="${H - 42}" font-size="14" fill="${P.muted}">${mode === 'current' ? 'Showing the process as it runs today.' : 'Showing the process after automation. Struck figures are today.'}</text>`)
  const used = doc.flows.filter((f) => doc.edges.some((e) => e.data?.flows?.includes(f.id)))
  if (used.length) {
    const rowH = 26
    const kh = used.length * rowH + 14
    const kw = 300
    const kx = W - 80 - kw
    const ky = H - 40 - kh
    out.push(`<rect x="${kx}" y="${ky}" width="${kw}" height="${kh}" rx="8" fill="${P.chip}" stroke="${P.stroke}"/>`)
    used.forEach((f, i) => {
      out.push(`<rect x="${kx + 14}" y="${ky + 12 + i * rowH}" width="30" height="10" rx="5" fill="${f.color}"/>`)
      out.push(`<text x="${kx + 54}" y="${ky + 22 + i * rowH}" font-size="15" fill="${P.ink}">${esc(clip(f.name, 30))}</text>`)
    })
  }
  out.push('</svg>')
  return out.join('\n')
}

function chip(x: number, y: number, text: string, color: string, size = 13) {
  const w = text.length * (size * 0.6) + 20
  const h = size + 12
  return `<rect x="${x}" y="${y - h / 2}" width="${w}" height="${h}" rx="4" fill="${color}"/><text x="${x + 10}" y="${y + size * 0.36}" font-size="${size}" font-weight="700" fill="${inkOn(color)}">${esc(text)}</text>`
}

function chipCentre(cx: number, cy: number, text: string, bg: string, ink: string, stroke: string) {
  const w = text.length * 6.4 + 14
  return `<rect x="${cx - w / 2}" y="${cy - 9}" width="${w}" height="18" rx="9" fill="${bg}" stroke="${stroke}"/><text x="${cx}" y="${cy + 4}" font-size="11" font-weight="600" fill="${ink}" text-anchor="middle">${esc(text)}</text>`
}

type N = DwellDoc['nodes'][number]
function route(s: N, t: N, dir: 'LR' | 'TB', floor: number) {
  const sd = DIMS[s.data.kind]
  const td = DIMS[t.data.kind]
  const r = 10
  if (dir === 'LR') {
    const a = { x: s.position.x + sd.w, y: s.position.y + sd.h / 2 }
    const b = { x: t.position.x, y: t.position.y + td.h / 2 }
    if (b.x <= a.x + 4) {
      const midY = Math.max(floor, s.position.y + sd.h, t.position.y + td.h) + 26
      return { d: `M${a.x},${a.y} H${a.x + 20} V${midY} H${b.x - 20} V${b.y} H${b.x}`, end: b, mid: { x: (a.x + b.x) / 2, y: midY } }
    }
    const mx = a.x + (b.x - a.x) / 2
    if (Math.abs(a.y - b.y) < 1) return { d: `M${a.x},${a.y} H${b.x}`, end: b, mid: { x: mx, y: a.y } }
    const sy = Math.sign(b.y - a.y)
    const rr = Math.min(r, Math.abs(b.y - a.y) / 2, (b.x - a.x) / 4)
    return { d: `M${a.x},${a.y} H${mx - rr} Q${mx},${a.y} ${mx},${a.y + sy * rr} V${b.y - sy * rr} Q${mx},${b.y} ${mx + rr},${b.y} H${b.x}`, end: b, mid: { x: mx, y: (a.y + b.y) / 2 } }
  }
  const a = { x: s.position.x + sd.w / 2, y: s.position.y + sd.h }
  const b = { x: t.position.x + td.w / 2, y: t.position.y }
  const my = a.y + (b.y - a.y) / 2
  if (Math.abs(a.x - b.x) < 1) return { d: `M${a.x},${a.y} V${b.y}`, end: b, mid: { x: a.x, y: my } }
  return { d: `M${a.x},${a.y} V${my} H${b.x} V${b.y}`, end: b, mid: { x: (a.x + b.x) / 2, y: my } }
}

function arrow(p: { x: number; y: number }, dir: 'LR' | 'TB') {
  return dir === 'LR' ? `M${p.x},${p.y} l-8,-4.5 v9 z` : `M${p.x},${p.y} l-4.5,-8 h9 z`
}
