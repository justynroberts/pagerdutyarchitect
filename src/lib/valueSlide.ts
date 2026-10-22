import { SLIDE, SLIDE_FONT, drawLogo, paintBackground, savePng, slideCanvas, slug } from './export'
import { count, money, type Commercial, type CommercialResult } from './commercial'
import { pct, valueStory } from './valueStory'

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

/** One line on the investment case, the same words the sheet uses. */
function investmentLine(c: Commercial, r: CommercialResult): string {
  const head = `PagerDuty Reliability Platform removes ${pct(r.atDiagram.pct)} of effort: ${money(r.cost.total)} a year in cost savings`
  if (r.breakEvenPct === null) return head
  const parts = [`break-even at ${pct(r.breakEvenPct)} automated on ${money(c.investment)} a year`]
  if (r.atDiagram.roi !== null) parts.push(`${r.atDiagram.roi.toFixed(1)}× return`)
  if (r.atDiagram.paybackMonths !== null) parts.push(`${r.atDiagram.paybackMonths.toFixed(1)} month payback`)
  return `${head}  |  ${parts.join(', ')}`
}

/** The Value Assessment as a 16:9 slide: the cost, the three pillars, the investment, the logo bottom left. */
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
  const width = SLIDE.w - L * 2
  g.textBaseline = 'alphabetic'

  const who = c.customer.trim()
  font(700, 21)
  text(who ? `${who.toUpperCase()}  |  VALUE ASSESSMENT` : 'VALUE ASSESSMENT', L, 104, accent)
  font(700, 48)
  wrap(g, `Manual incident response costs ${money(r.annualCost)} a year in engineer time`, 1500)
    .slice(0, 2)
    .forEach((s, i) => text(s, L, 164 + i * 56, ink))

  // The cost of manual response, four across.
  rule(250)
  const base: [string, string, string, number][] = [
    ['Annual response cost', money(r.annualCost), `${count(c.incidentsPerYear)} incidents a year`, 64],
    ['Engineer time', `${count(r.hours)} hrs`, `${count(r.worked)} incidents worked`, 46],
    ['Blended hourly rate', money(r.blendedRate, true), `£${c.rateIn} in hours, £${c.rateOut} out`, 46],
    ['Per minute of response', money(r.perMinute, true), 'the unit of this model', 46],
  ]
  base.forEach(([label, value, note, size], i) => {
    const x = L + (width / 4) * i
    font(700, 18)
    text(label.toUpperCase(), x, 288, accent, width / 4 - 24)
    font(700, size)
    text(value, x, 354, ink, width / 4 - 24)
    font(400, 20)
    text(note, x, 388, muted, width / 4 - 24)
  })

  // The three pillars, side by side.
  const story = valueStory(c, r)
  if (story.length) {
    rule(418)
    const colW = width / story.length
    story.forEach((p, i) => {
      const x = L + colW * i + (i ? 28 : 0)
      const w = colW - (i ? 56 : 28)
      if (i) {
        g.fillStyle = line
        g.fillRect(L + colW * i, 434, 1, 400)
      }
      font(700, 18)
      text(p.tag.toUpperCase(), x, 458, accent, w)
      font(700, story.length > 2 ? 30 : 34)
      const head = wrap(g, p.head, w).slice(0, 3)
      head.forEach((s, j) => text(s, x, 502 + j * 38, ink))
      let y = 502 + head.length * 38 + 34
      if (p.prompt) {
        font(400, 20)
        wrap(g, p.prompt, w)
          .slice(0, 3)
          .forEach((s, j) => text(s, x, y + j * 28, muted))
        return
      }
      for (const [fig, what] of p.stats.slice(0, 4)) {
        font(700, 34)
        text(fig, x, y, saved)
        const fw = Math.max(150, g.measureText(fig).width + 18)
        font(400, 20)
        text(what, x + fw, y, muted, w - fw)
        y += 50
      }
    })
  }

  // The investment case on one line.
  rule(860)
  font(700, 24)
  text(investmentLine(c, r), L, 904, ink, width)

  // Assumptions, small, clear of the logo.
  font(400, 17)
  const foot = `Assumptions: ${count(c.incidentsPerYear)} incidents a year, ${c.discardedPct}% discarded, ${100 - c.outOfHoursPct}/${c.outOfHoursPct} in/out of hours at £${c.rateIn}/£${c.rateOut} an hour, ${c.types.map((t) => `${t.minutes} min per ${t.name.toLowerCase()}`).join(', ')}. Return and payback count cost savings only.`
  wrap(g, foot, SLIDE.w - L - 420)
    .slice(0, 2)
    .forEach((s, i) => text(s, 420, SLIDE.h - 86 + i * 24, muted))

  await drawLogo(g, ink)
  savePng(canvas, `${slug(who || title)}-value-assessment.png`)
  return true
}

/** The Value Assessment as Markdown, for a doc or an email. */
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
    [`PagerDuty Reliability Platform removes ${pct(r.atDiagram.pct)} of effort`, `${money(r.cost.total)} a year in cost savings`],
  ]
  if (r.breakEvenPct !== null) {
    rows.push(['Investment', `${money(c.investment)} a year`], ['Break-even', `${pct(r.breakEvenPct)} of response time automated`])
    if (r.atDiagram.roi !== null) rows.push(['Return, on cost savings', `${r.atDiagram.roi.toFixed(1)}×`])
    if (r.atDiagram.paybackMonths !== null) rows.push(['Payback, on cost savings', `${r.atDiagram.paybackMonths.toFixed(1)} months`])
  }
  const pillars = valueStory(c, r).flatMap((p) => [
    `### ${p.tag}: ${p.head}`,
    '',
    p.body,
    '',
    ...(p.prompt ? [p.prompt] : p.stats.map(([fig, what]) => `- **${fig}** ${what}`)),
    '',
  ])
  return [
    `## ${who ? `${who}: ` : ''}Value Assessment`,
    '',
    `Manual incident response costs ${money(r.annualCost)} a year in engineer time.`,
    '',
    ...pillars,
    '### The numbers',
    '',
    '| | |',
    '| --- | ---: |',
    ...rows.map(([k, val]) => `| ${k} | ${val} |`),
    '',
    `Assumptions: ${count(c.incidentsPerYear)} incidents a year, ${c.discardedPct}% discarded, ${100 - c.outOfHoursPct}/${c.outOfHoursPct} in/out of hours at £${c.rateIn}/£${c.rateOut} an hour. Return and payback count cost savings only.`,
  ].join('\n')
}
