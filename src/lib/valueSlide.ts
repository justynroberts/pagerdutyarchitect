import { SLIDE, SLIDE_FONT, drawLogo, paintBackground, savePng, slideCanvas, slug } from './export'
import { count, money, type Commercial, type CommercialResult } from './commercial'

const pct = (v: number) => `${Math.round(v * 10) / 10}%`
const L = 72 // left and right margin, the same as the logo and the diagram slide

/** Splits text into lines no wider than `max` at the current font. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && g.measureText(next).width > max) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

/** The Value Assessment as a 16:9 slide: the same figures as the sheet, the logo bottom left. */
export async function exportValuePng(c: Commercial, r: CommercialResult, title: string): Promise<boolean> {
  const slide = slideCanvas()
  if (!slide) return false
  const { canvas, g } = slide
  const css = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
  const ink = v('--ink', '#0e231d')
  const muted = v('--muted', '#47605a')
  const accent = v('--accent', '#048a24')
  const saved = v('--saved', '#05701f')
  const line = v('--line', '#dde5e1')
  await paintBackground(g, css)

  const font = (weight: number, size: number) => (g.font = `${weight} ${size}px ${SLIDE_FONT}`)
  const text = (s: string, x: number, y: number, colour: string, max?: number) => {
    g.fillStyle = colour
    g.fillText(s, x, y, max)
  }
  const rule = (y: number) => {
    g.fillStyle = line
    g.fillRect(L, y, SLIDE.w - L * 2, 1)
  }
  // Label over a figure over a note, the sheet's stat.
  const stat = (x: number, y: number, w: number, label: string, value: string, note: string, size: number, colour = ink) => {
    font(700, 19)
    text(label.toUpperCase(), x, y, accent, w - 24)
    font(700, size)
    text(value, x, y + size + 8, colour, w - 24)
    font(400, 22)
    text(note, x, y + size + 46, muted, w - 24)
  }

  g.textBaseline = 'alphabetic'
  const who = c.customer.trim()
  font(700, 21)
  text(who ? `${who.toUpperCase()}  |  VALUE ASSESSMENT` : 'VALUE ASSESSMENT', L, 112, accent)
  font(700, 54)
  const head = wrap(g, `Manual incident response costs ${money(r.annualCost)} a year in engineer time`, 1400)
  head.slice(0, 2).forEach((s, i) => text(s, L, 178 + i * 62, ink))
  font(400, 24)
  text(`${count(c.incidentsPerYear)} incidents a year, ${count(r.worked)} of them worked, at a blended ${money(r.blendedRate, true)} an hour.`, L, 296, muted)

  // Cost of manual response, four across.
  rule(326)
  const col = (SLIDE.w - L * 2) / 4
  stat(L, 368, col, 'Annual response cost', money(r.annualCost), `${count(c.incidentsPerYear)} incidents a year`, 80)
  stat(L + col, 368, col, 'Engineer time', `${count(r.hours)} hrs`, `${count(r.worked)} incidents worked`, 56)
  stat(L + col * 2, 368, col, 'Blended hourly rate', money(r.blendedRate, true), `£${c.rateIn} in hours, £${c.rateOut} out`, 56)
  stat(L + col * 3, 368, col, 'Per minute of response', money(r.perMinute, true), 'the unit of this model', 56)

  // Every slice automated, with where it comes from.
  rule(526)
  stat(L, 568, col * 1.6, `Every ${c.stepPct}% of response time automated`, money(r.stepValue), 'saved a year', 80)
  const items: [string, string][] = [
    ...r.types.map((t): [string, string] => [money(t.stepValue), `${Math.round(t.minutesSaved * 10) / 10} min saved on each of ${count(t.incidents)} ${t.name.toLowerCase()} incidents`]),
    [count(r.stepHours), 'engineer hours returned a year'],
  ]
  items.slice(0, 4).forEach(([fig, words], i) => {
    const y = 600 + i * 42
    font(700, 32)
    text(fig, L + col * 1.6, y, saved)
    font(400, 24)
    text(words, L + col * 1.6 + 170, y, ink, SLIDE.w - L - (L + col * 1.6 + 170))
  })

  // What the platform's saving is worth, and the investment case.
  rule(726)
  stat(L, 768, col * 1.6, `PagerDuty Reliability Platform removes ${pct(r.atDiagram.pct)} of effort`, money(r.atDiagram.value), `saved a year, ${count(r.atDiagram.hours)} engineer hours`, 80, saved)
  if (r.breakEvenPct !== null) {
    const x = L + col * 1.6
    const w = (SLIDE.w - L - x) / 3
    stat(x, 768, w, 'Break-even', pct(r.breakEvenPct), `covers ${money(c.investment)} a year`, 56)
    stat(x + w, 768, w, 'Return', r.atDiagram.roi !== null ? `${r.atDiagram.roi.toFixed(1)}×` : '—', 'on the investment', 56)
    stat(x + w * 2, 768, w, 'Payback', r.atDiagram.paybackMonths !== null ? `${r.atDiagram.paybackMonths.toFixed(1)} mo` : '—', "at the platform's saving", 56)
  }

  // Assumptions, small, clear of the logo.
  font(400, 17)
  const foot = `Assumptions: ${count(c.incidentsPerYear)} incidents a year, ${c.discardedPct}% discarded, ${100 - c.outOfHoursPct}/${c.outOfHoursPct} in/out of hours at £${c.rateIn}/£${c.rateOut} an hour, ${c.types.map((t) => `${t.minutes} min per ${t.name.toLowerCase()}`).join(', ')}.`
  wrap(g, foot, SLIDE.w - L - 420).slice(0, 2).forEach((s, i) => text(s, 420, SLIDE.h - 86 + i * 24, muted))

  await drawLogo(g, ink)
  savePng(canvas, `${slug(who || title)}-value-assessment.png`)
  return true
}

/** The Value Assessment as a Markdown table, for a doc or an email. */
export function valueMarkdown(c: Commercial, r: CommercialResult): string {
  const who = c.customer.trim()
  const rows: [string, string][] = [
    ['Annual response cost', money(r.annualCost)],
    ['Engineer time a year', `${count(r.hours)} hrs`],
    ['Incidents worked a year', `${count(r.worked)} of ${count(c.incidentsPerYear)}`],
    ['Blended hourly rate', money(r.blendedRate, true)],
    ['Cost per minute of response', money(r.perMinute, true)],
    ...r.types.map((t): [string, string] => [`${t.name} (${t.minutes} min each)`, `${money(t.cost)}, ${count(t.hours)} hrs`]),
    [`Every ${c.stepPct}% automated saves`, `${money(r.stepValue)} a year, ${count(r.stepHours)} hrs`],
    [`PagerDuty Reliability Platform removes ${pct(r.atDiagram.pct)} of effort`, `${money(r.atDiagram.value)} a year`],
  ]
  if (r.breakEvenPct !== null) {
    rows.push(['Investment', `${money(c.investment)} a year`], ['Break-even', `${pct(r.breakEvenPct)} of response time automated`])
    if (r.atDiagram.roi !== null) rows.push(['Return', `${r.atDiagram.roi.toFixed(1)}×`])
    if (r.atDiagram.paybackMonths !== null) rows.push(['Payback', `${r.atDiagram.paybackMonths.toFixed(1)} months`])
  }
  return [
    `## ${who ? `${who}: ` : ''}Value Assessment`,
    '',
    '| | |',
    '| --- | ---: |',
    ...rows.map(([k, val]) => `| ${k} | ${val} |`),
    '',
    `Assumptions: ${count(c.incidentsPerYear)} incidents a year, ${c.discardedPct}% discarded, ${100 - c.outOfHoursPct}/${c.outOfHoursPct} in/out of hours at £${c.rateIn}/£${c.rateOut} an hour.`,
  ].join('\n')
}
