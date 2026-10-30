/**
 * PagerDuty Architect MCP server. Lets an AI build and edit process diagrams that carry time data,
 * tag steps as AI or Automation, group steps into coloured flows, and export slides.
 * Diagrams are files in ./diagrams (override with DWELL_DIR). The running app watches that folder.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import {
  DEFAULT_ICON, addStep, addZone, autoLayout, buildDoc, clone, connect, createFlow, deleteFlow, disconnect, overview, removeStep, removeZone, sampleDoc,
  updateConnector, updateFlow, updateStep, findStep, type DwellDoc,
} from '../src/lib/doc'
import { ICON_NAMES, BRAND_NAMES } from '../src/lib/iconKeys'
import { summaryMarkdown, summarise } from '../src/lib/time'
import { checkDiagram } from '../src/lib/check'
import { toMermaid } from '../src/lib/mermaid'
import { arrange } from '../src/lib/arrange'
import { MARK_COLORS } from '../src/lib/palette'
import type { CatalogItem } from '../src/types'
import { DIAGRAM_DIR, fullCatalogue, listDiagrams, loadCustom, newDiagram, nameOf, pathFor, readDiagram, saveCustom, writeDiagram } from './store'
import { renderSvg } from './render'

const kind = z
  .enum(['input', 'step', 'decision', 'automation', 'output', 'handoff', 'wait', 'document', 'system', 'subprocess'])
  .describe(
    'input = a signal that starts a flow, step = manual work, decision = a yes/no branch, automation = an automated step, output = where a flow ends, handoff = an escalation or handover to another team, wait = waiting on someone or something, document = writing or updating a record, system = a system of record or data store, subprocess = a whole process of its own',
  )
const lever = z.enum(['none', 'ai', 'automation']).describe('Where the time saving is made: ai (AI does it), automation (deterministic automation), or none')
const presence = z.enum(['both', 'current-only', 'future-only']).describe('both = in the process today and after; current-only = removed by automation; future-only = added by automation')
const icon = z.enum(ICON_NAMES).describe('Phosphor icon name')
const brand = z.enum(BRAND_NAMES).describe('Brand mark shown instead of the icon')
const line = z.enum(['step', 'curve', 'straight'])
const colour = z.string().regex(/^#[0-9a-fA-F]{6}$/).describe(`Hex colour. House colours: ${MARK_COLORS.map((c) => `${c.name} ${c.value}`).join(', ')}`)
const diagram = z.string().describe('Diagram name, as returned by list_diagrams')

const stepFields = {
  catalogue_id: z.string().optional().describe('Start from a catalogue entry (see list_catalogue). Fields below override it.'),
  kind: kind.optional(),
  label: z.string().optional(),
  tool: z.string().optional().describe('System or team that owns the step, shown under the label'),
  icon: icon.optional(),
  brand: brand.optional(),
  current: z.number().min(0).optional().describe('Minutes the step takes today'),
  future: z.number().min(0).optional().describe('Minutes it takes after automation'),
  share: z.number().min(0).max(100).optional().describe('Percent of runs that reach this step'),
  presence: presence.optional(),
  lever: lever.optional(),
  note: z.string().optional(),
}

const { catalogue_id: _cid, ...patchFields } = stepFields

const server = new McpServer(
  { name: 'pagerduty-architect', version: '0.1.0' },
  {
    instructions: [
      'PagerDuty Architect builds process diagrams where every step carries a time today and a time after automation.',
      'Fast path: call build_diagram once with all steps, connections, flows and areas. It lays the diagram out for you.',
      'To change an existing one use get_diagram, then add_step, update_step, connect, set_lever and the rest.',
      'Tag where the benefit comes from with lever: "ai" or "automation". Future-state only steps use presence "future-only" and current 0.',
      'Times are minutes. 0.5 is 30 seconds. Use list_catalogue for ready-made steps with sensible figures, including monitoring and CI/CD tools.',
      'The user sees changes live in the PagerDuty Architect app. Call export_diagram for a slide (png or svg), json, mermaid, or a markdown summary; check_diagram before exporting.',
    ].join(' '),
  },
)

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const fail = (e: unknown) => ({ content: [{ type: 'text' as const, text: e instanceof Error ? e.message : String(e) }], isError: true as const })

function brief(doc: DwellDoc) {
  const s = summarise(doc.nodes, doc.runsPerMonth, doc.ratePerHour, doc.overrides)
  return `${doc.nodes.length} steps, ${doc.edges.length} connectors, ${doc.flows.length} flows. Per run: ${s.current.toFixed(1)}m now, ${s.future.toFixed(1)}m after, ${s.saved.toFixed(1)}m saved (${Math.round(s.pct)}%).`
}

/** Read, change, save, report. Errors come back as readable text for the model to act on. */
function edit(name: string, fn: (doc: DwellDoc) => string | void) {
  try {
    const doc = clone(readDiagram(name))
    const msg = fn(doc)
    writeDiagram(name, doc)
    return text(`${msg ? msg + ' ' : ''}${brief(doc)}`)
  } catch (e) {
    return fail(e)
  }
}

server.registerTool(
  'list_catalogue',
  {
    description: 'Ready-made steps with times attached: incident handling, monitoring tools (Datadog, Splunk...) and CI/CD pipeline stages. Pass the id as catalogue_id to add_step or build_diagram.',
    inputSchema: { query: z.string().optional(), category: z.enum(['Incident', 'PagerDuty', 'Monitoring', 'CI/CD', 'Other']).optional(), kind: kind.optional() },
  },
  async ({ query, category, kind: k }) => {
    const q = query?.toLowerCase()
    const rows = fullCatalogue().filter((c) => (!category || c.category === category) && (!k || c.kind === k) && (!q || `${c.label} ${c.tool} ${c.id}`.toLowerCase().includes(q)))
    return text(rows.map((c) => `${c.id} | ${c.kind} | ${c.label} | ${c.tool} | ${c.current}m -> ${c.future}m${c.lever ? ` | ${c.lever}` : ''} | ${c.category}`).join('\n') || 'Nothing matches.')
  },
)

server.registerTool('list_diagrams', { description: 'Diagrams saved in the diagrams folder.', inputSchema: {} }, async () => {
  const rows = listDiagrams()
  return text(rows.length ? rows.map((d) => `${d.name} | ${d.title} | ${d.steps} steps | updated ${d.updated}`).join('\n') : `No diagrams yet in ${DIAGRAM_DIR}.`)
})

server.registerTool(
  'create_diagram',
  { description: 'Start a new diagram. Use from "sample" to begin with the alert engagement example.', inputSchema: { name: z.string(), title: z.string().optional(), from: z.enum(['blank', 'sample']).optional() } },
  async ({ name, title, from }) => {
    try {
      if (from === 'sample') {
        if (existsSync(pathFor(name))) throw new Error(`"${nameOf(name)}" already exists.`)
        const d = sampleDoc()
        if (title) d.title = title
        writeDiagram(name, d)
        return text(`Created ${nameOf(name)} from the sample. ${brief(d)}`)
      }
      const d = newDiagram(name, title)
      return text(`Created empty diagram ${nameOf(name)} ("${d.title}").`)
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  'build_diagram',
  {
    description:
      'Create a whole diagram in one call and lay it out left to right. Steps need an id. Link them with connections, or with after/before on a step. Decisions get Yes/No labels automatically. Flows are coloured paths named for a scenario, defined by steps (gaps are bridged) or an ordered path. Areas highlight groups of steps.',
    inputSchema: {
      name: z.string(),
      overwrite: z.boolean().optional(),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      direction: z.enum(['LR', 'TB']).optional(),
      runs_per_month: z.number().optional(),
      rate_per_hour: z.number().optional().describe('Cost of an hour of effort, in the user currency'),
      steps: z.array(z.object({ id: z.string(), ...stepFields, after: z.string().optional(), before: z.string().optional(), edge_label: z.string().optional() })).min(1),
      connections: z.array(z.object({ from: z.string(), to: z.string(), label: z.string().optional(), line: line.optional() })).optional(),
      flows: z.array(z.object({ name: z.string(), color: colour.optional(), steps: z.array(z.string()).optional(), path: z.array(z.string()).optional() })).optional(),
      areas: z.array(z.object({ label: z.string(), color: colour.optional(), around: z.array(z.string()), kind: z.enum(['area', 'label']).optional() })).optional(),
    },
  },
  async ({ name, overwrite, ...spec }) => {
    try {
      if (existsSync(pathFor(name)) && !overwrite) throw new Error(`"${nameOf(name)}" already exists. Set overwrite true to replace it, or use the edit tools.`)
      const doc = buildDoc(spec, fullCatalogue())
      writeDiagram(name, doc)
      return text(`Built ${nameOf(name)}. ${brief(doc)}`)
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  'get_diagram',
  { description: 'Read a diagram: steps with times and levers, connectors, flows, areas and totals. Use format json for the raw file.', inputSchema: { name: diagram, format: z.enum(['overview', 'json']).optional() } },
  async ({ name, format }) => {
    try {
      const doc = readDiagram(name)
      return text(JSON.stringify(format === 'json' ? doc : overview(doc), null, 1))
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  'add_step',
  { description: 'Add a step. With after (or before) it is placed next to that step and connected.', inputSchema: { diagram, id: z.string().optional(), ...stepFields, after: z.string().optional().describe('Step id or label to connect from'), before: z.string().optional(), edge_label: z.string().optional() } },
  async ({ diagram: d, ...spec }) => edit(d, (doc) => `Added ${addStep(doc, spec, fullCatalogue()).id}.`),
)

server.registerTool(
  'update_step',
  { description: 'Change any field of a step: times, label, tool, icon, brand, lever (ai or automation), presence, share, note.', inputSchema: { diagram, step: z.string().describe('Step id or label'), ...patchFields } },
  async ({ diagram: d, step, ...patch }) => {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    return edit(d, (doc) => `Updated ${updateStep(doc, step, clean).id}.`)
  },
)

server.registerTool(
  'set_lever',
  { description: 'Tag several steps at once as AI or Automation (or none) so the diagram shows where the benefit is made.', inputSchema: { diagram, steps: z.array(z.string()).min(1), lever } },
  async ({ diagram: d, steps, lever: l }) => edit(d, (doc) => `Tagged ${steps.map((s) => updateStep(doc, s, { lever: l }).id).join(', ')} as ${l}.`),
)

server.registerTool('remove_step', { description: 'Delete a step and its connectors.', inputSchema: { diagram, step: z.string() } }, async ({ diagram: d, step }) =>
  edit(d, (doc) => `Removed ${removeStep(doc, step).id}.`),
)

server.registerTool(
  'connect',
  { description: 'Draw a connector between two steps. Decisions label their first two exits Yes and No unless you set a label.', inputSchema: { diagram, from: z.string(), to: z.string(), label: z.string().optional(), line: line.optional() } },
  async ({ diagram: d, from, to, label, line: l }) => edit(d, (doc) => `Connected ${findStep(doc, from).id} to ${findStep(doc, to).id} (${connect(doc, from, to, label, l).id}).`),
)

server.registerTool('disconnect', { description: 'Remove the connector between two steps.', inputSchema: { diagram, from: z.string(), to: z.string() } }, async ({ diagram: d, from, to }) =>
  edit(d, (doc) => (disconnect(doc, from, to), 'Disconnected.')),
)

server.registerTool(
  'update_connector',
  { description: 'Change a connector label, line style or presence.', inputSchema: { diagram, from: z.string(), to: z.string(), label: z.string().optional(), line: line.optional(), presence: presence.optional() } },
  async ({ diagram: d, from, to, ...patch }) => edit(d, (doc) => (updateConnector(doc, from, to, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))), 'Updated connector.')),
)

server.registerTool(
  'create_flow',
  { description: 'Highlight a path as a named, coloured flow that appears in the legend. Give steps (connectors between them are used and skipped steps are bridged) or path (ordered step ids, each pair must be connected).', inputSchema: { diagram, name: z.string(), steps: z.array(z.string()).optional(), path: z.array(z.string()).optional(), color: colour.optional() } },
  async ({ diagram: d, name, steps, path, color }) => edit(d, (doc) => `Created flow "${createFlow(doc, name, { steps, path, color }).name}".`),
)

server.registerTool('update_flow', { description: 'Rename a flow or change its colour.', inputSchema: { diagram, flow: z.string(), name: z.string().optional(), color: colour.optional() } }, async ({ diagram: d, flow, ...patch }) =>
  edit(d, (doc) => `Updated flow "${updateFlow(doc, flow, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))).name}".`),
)

server.registerTool('delete_flow', { description: 'Remove a flow and its highlight.', inputSchema: { diagram, flow: z.string() } }, async ({ diagram: d, flow }) => edit(d, (doc) => (deleteFlow(doc, flow), 'Deleted flow.')))

server.registerTool(
  'add_area',
  { description: 'Add a highlighted area around steps, or a free text label, to call something out on the slide.', inputSchema: { diagram, label: z.string(), kind: z.enum(['area', 'label']).optional(), around: z.array(z.string()).optional(), color: colour.optional(), x: z.number().optional(), y: z.number().optional() } },
  async ({ diagram: d, label, kind: k, around, color, x, y }) => edit(d, (doc) => `Added ${addZone(doc, { kind: k ?? 'area', label, around, color, x, y }).id}.`),
)

server.registerTool('remove_area', { description: 'Delete an area or label by id or text.', inputSchema: { diagram, area: z.string() } }, async ({ diagram: d, area }) => edit(d, (doc) => (removeZone(doc, area), 'Removed.')))

server.registerTool(
  'auto_layout',
  { description: 'Re-run the automatic layout. This moves every step, so only use it when the user asks or after big structural changes. Optionally flip direction.', inputSchema: { diagram, direction: z.enum(['LR', 'TB']).optional() } },
  async ({ diagram: d, direction }) => edit(d, (doc) => (autoLayout(doc, direction), 'Laid out.')),
)

server.registerTool(
  'set_details',
  { description: 'Set the title, subtitle (shown on the slide), volume of runs per month, hourly cost, or which state the app opens in. hide_removed leaves the steps automation removes out of the Future state (and its layout) instead of showing them crossed out.', inputSchema: { diagram, title: z.string().optional(), subtitle: z.string().optional(), runs_per_month: z.number().optional(), rate_per_hour: z.number().optional(), mode: z.enum(['current', 'future']).optional(), hide_removed: z.boolean().optional() } },
  async ({ diagram: d, title, subtitle, runs_per_month, rate_per_hour, mode, hide_removed }) =>
    edit(d, (doc) => {
      if (title !== undefined) doc.title = title
      if (subtitle !== undefined) doc.subtitle = subtitle
      if (runs_per_month !== undefined) doc.runsPerMonth = runs_per_month
      if (rate_per_hour !== undefined) doc.ratePerHour = rate_per_hour
      if (mode) doc.mode = mode
      if (hide_removed !== undefined) {
        doc.hideRemoved = hide_removed || undefined
        // Future is laid out again so it has no gaps where removed steps were.
        doc.nodes = arrange(doc.nodes, doc.edges, doc.direction, 'future', hide_removed).nodes
      }
      return 'Updated details.'
    }),
)

server.registerTool(
  'add_catalogue_item',
  {
    description:
      'Add or replace a reusable step in the catalogue, for example one of your own tools or a pipeline stage. It then appears in the app catalogue and works as a catalogue_id here. Saved in diagrams/catalogue.json.',
    inputSchema: {
      id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).describe('Lowercase id, e.g. mo-honeycomb'),
      kind,
      label: z.string(),
      tool: z.string().optional(),
      icon: icon.optional(),
      brand: brand.optional(),
      category: z.enum(['Incident', 'PagerDuty', 'Monitoring', 'CI/CD', 'Other']).optional(),
      current: z.number().min(0),
      future: z.number().min(0),
      presence: presence.optional(),
      lever: lever.optional(),
    },
  },
  async (a) => {
    try {
      const item: CatalogItem = { id: a.id, kind: a.kind, label: a.label, tool: a.tool ?? '', icon: a.icon ?? DEFAULT_ICON[a.kind], brand: a.brand, category: a.category ?? 'Other', current: a.current, future: a.future, presence: a.presence ?? 'both', lever: a.lever }
      const custom = loadCustom().filter((c) => c.id !== a.id)
      saveCustom([...custom, JSON.parse(JSON.stringify(item))])
      return text(`Saved catalogue item ${a.id}. Use it as catalogue_id.`)
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool('remove_catalogue_item', { description: 'Remove a custom catalogue item. Built-in items cannot be removed.', inputSchema: { id: z.string() } }, async ({ id }) => {
  const custom = loadCustom()
  if (!custom.some((c) => c.id === id)) return fail(new Error(`No custom item "${id}". Built-in items stay.`))
  saveCustom(custom.filter((c) => c.id !== id))
  return text(`Removed ${id}.`)
})

server.registerTool('delete_diagram', { description: 'Delete a diagram file. Only on the user request.', inputSchema: { name: diagram } }, async ({ name }) => {
  try {
    readDiagram(name)
    unlinkSync(pathFor(name))
    return text(`Deleted ${nameOf(name)}.`)
  } catch (e) {
    return fail(e)
  }
})

server.registerTool(
  'check_diagram',
  {
    description: 'Review a diagram for loose ends before it goes on a slide: unconnected steps, decisions with one exit, unlabelled exits, automation steps not tagged AI or Automation, empty flows, missing signal or output. Returns a list of issues, each with the step id.',
    inputSchema: { name: diagram },
  },
  async ({ name }) => {
    try {
      const issues = checkDiagram(readDiagram(name))
      return text(issues.length ? JSON.stringify(issues, null, 1) : 'No issues found.')
    } catch (e) {
      return fail(e)
    }
  },
)

server.registerTool(
  'export_diagram',
  {
    description:
      'Export a diagram. png and svg are 1920x1080 slides (PagerDuty green by default) saved to diagrams/exports and returned; json is the editable file; markdown is a table of steps and savings; mermaid is a flowchart for GitHub, Notion or a wiki. mode picks the Current or Future state.',
    inputSchema: { name: diagram, format: z.enum(['png', 'svg', 'json', 'markdown', 'mermaid']), mode: z.enum(['current', 'future']).optional(), theme: z.enum(['green', 'light', 'dark']).optional(), output_path: z.string().optional().describe('Where to write the file. Defaults to diagrams/exports') },
  },
  async ({ name, format, mode, theme, output_path }) => {
    try {
      const doc = readDiagram(name)
      const m = mode ?? doc.mode ?? 'current'
      if (format === 'json') return text(JSON.stringify(doc, null, 2))
      if (format === 'mermaid') return text(toMermaid(doc, m))
      if (format === 'markdown') return text(summaryMarkdown(doc.title, doc.nodes, summarise(doc.nodes, doc.runsPerMonth, doc.ratePerHour, doc.overrides)) + `\n\nFlows: ${doc.flows.map((f) => f.name).join(', ') || 'none'}`)
      const svg = renderSvg(doc, { mode: m, theme })
      const base = `${nameOf(name)}-${m}`
      const file = resolve(output_path ?? join(DIAGRAM_DIR, 'exports', `${base}.${format}`))
      mkdirSync(dirname(file), { recursive: true })
      if (format === 'svg') {
        writeFileSync(file, svg)
        return text(`Wrote ${file}`)
      }
      const png = new Resvg(svg, { font: { loadSystemFonts: true, defaultFontFamily: 'Helvetica Neue' }, fitTo: { mode: 'width', value: 1920 } }).render().asPng()
      writeFileSync(file, png)
      return { content: [{ type: 'text' as const, text: `Wrote ${file}` }, { type: 'image' as const, data: Buffer.from(png).toString('base64'), mimeType: 'image/png' }] }
    } catch (e) {
      return fail(e)
    }
  },
)

await server.connect(new StdioServerTransport())
