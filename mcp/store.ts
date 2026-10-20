/** Diagram files on disk. The app watches the same folder, so what the AI writes shows up live. */
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { blankDoc, parseDoc, tidy, type DwellDoc } from '../src/lib/doc'
import { SEED_CATALOGUE } from '../src/lib/seed'
import type { CatalogItem } from '../src/types'

const here = dirname(fileURLToPath(import.meta.url))
export const DIAGRAM_DIR = resolve(process.env.DWELL_DIR ?? join(here, '..', 'diagrams'))

export const EXT = '.dwell.json'

export function nameOf(input: string) {
  const n = input.replace(/\.dwell\.json$|\.json$/i, '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  if (!n || n.startsWith('.')) throw new Error(`"${input}" is not a usable diagram name. Use letters, numbers and dashes.`)
  return n
}

export const pathFor = (name: string) => join(DIAGRAM_DIR, nameOf(name) + EXT)

export function listDiagrams() {
  if (!existsSync(DIAGRAM_DIR)) return []
  return readdirSync(DIAGRAM_DIR)
    .filter((f) => f.endsWith(EXT))
    .map((f) => {
      const full = join(DIAGRAM_DIR, f)
      const { doc } = parseDoc(readFileSync(full, 'utf8'))
      return { name: f.slice(0, -EXT.length), title: doc?.title ?? '(unreadable)', steps: doc?.nodes.length ?? 0, updated: statSync(full).mtime.toISOString() }
    })
    .sort((a, b) => b.updated.localeCompare(a.updated))
}

export function readDiagram(name: string): DwellDoc {
  const p = pathFor(name)
  if (!existsSync(p)) {
    const have = listDiagrams().map((d) => d.name)
    throw new Error(`No diagram called "${nameOf(name)}". ${have.length ? `Available: ${have.join(', ')}.` : 'None exist yet, use create_diagram first.'}`)
  }
  const { doc, error } = parseDoc(readFileSync(p, 'utf8'))
  if (!doc) throw new Error(`${nameOf(name)}: ${error}`)
  return doc
}

/** Write atomically so the app never reads half a file. */
export function writeDiagram(name: string, doc: DwellDoc) {
  mkdirSync(DIAGRAM_DIR, { recursive: true })
  const p = pathFor(name)
  const tmp = p + '.tmp'
  writeFileSync(tmp, JSON.stringify(tidy(doc), null, 2) + '\n')
  renameSync(tmp, p)
  return p
}

export function newDiagram(name: string, title?: string) {
  if (existsSync(pathFor(name))) throw new Error(`"${nameOf(name)}" already exists. Pick another name, or edit it.`)
  const doc = blankDoc(title ?? name)
  writeDiagram(name, doc)
  return doc
}

/** Custom catalogue items you add in the app (or through the MCP server). Shared through diagrams/catalogue.json. */
export const CATALOGUE_FILE = join(DIAGRAM_DIR, 'catalogue.json')

export function loadCustom(): CatalogItem[] {
  try {
    const v = JSON.parse(readFileSync(CATALOGUE_FILE, 'utf8'))
    return Array.isArray(v) ? (v as CatalogItem[]) : []
  } catch {
    return []
  }
}

export function saveCustom(items: CatalogItem[]) {
  mkdirSync(DIAGRAM_DIR, { recursive: true })
  const tmp = CATALOGUE_FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify(items, null, 2) + '\n')
  renameSync(tmp, CATALOGUE_FILE)
}

/** Built-in steps plus the custom ones. A custom item with a built-in id replaces it. */
export function fullCatalogue(): CatalogItem[] {
  const custom = loadCustom()
  const ids = new Set(custom.map((c) => c.id))
  return [...SEED_CATALOGUE.filter((c) => !ids.has(c.id)), ...custom]
}
