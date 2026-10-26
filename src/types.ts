import type { Edge, Node } from '@xyflow/react'
import type { IconKey } from './lib/icons'
import type { BrandKey } from './lib/brands'

export type Kind = 'input' | 'step' | 'decision' | 'automation' | 'output' | 'handoff' | 'wait' | 'document' | 'system' | 'subprocess'
/** Which state of the process a node or connection belongs to. */
export type Presence = 'both' | 'current-only' | 'future-only'
export type Mode = 'current' | 'future'
export type Direction = 'LR' | 'TB'
export type ThemePref = 'light' | 'dark' | 'night' | 'auto'

export type NodeData = {
  kind: Kind
  label: string
  /** System or team that owns the step, shown under the label. */
  tool: string
  icon: IconKey
  /** Optional brand mark shown in place of the icon. */
  brand?: BrandKey
  /** Minutes this step takes today. */
  current: number
  /** Minutes it takes after automation. */
  future: number
  /** Percentage of runs that pass through this step. */
  share: number
  presence: Presence
  note: string
  /** Where the benefit of automating this step is made. */
  lever?: Lever
  /** Where this step sits in the Future state, when that differs from the Current layout. */
  futurePos?: { x: number; y: number }
  /** Derived at render time, never stored. */
  dim?: boolean
}

export type Lever = 'none' | 'ai' | 'automation'
export const LEVER_LABEL: Record<Lever, string> = { none: 'Not set', ai: 'AI', automation: 'Automation' }

export type LineStyle = 'step' | 'curve' | 'straight'

export type EdgeData = {
  presence: Presence
  label: string
  /** Ids of the named flows this connector belongs to. */
  flows?: string[]
  line?: LineStyle
  /** Sides chosen by hand in the inspector. Otherwise the connector takes the closest sides as it is drawn. */
  pinned?: boolean
  /** Derived at render time, never stored. */
  ghost?: boolean
  lit?: boolean
  dim?: boolean
  /** Colours of the flows this connector belongs to. Derived at render time. */
  ribbons?: string[]
}

/** A named path through the process, built from connectors. */
export type Flow = { id: string; name: string; color: string }

/** A free-standing area or label drawn on the sheet to call something out. */
export type Zone = {
  id: string
  kind: 'area' | 'label'
  x: number
  y: number
  w: number
  h: number
  label: string
  color: string
  selected?: boolean
}

export type DwellNode = Node<NodeData, 'flow'>
export type DwellEdge = Edge<EdgeData, 'flow'>

export type CatalogItem = {
  id: string
  kind: Kind
  label: string
  tool: string
  icon: IconKey
  brand?: BrandKey
  /** Catalogue section: Incident, PagerDuty, Monitoring, CI/CD or Other. */
  category?: Category
  current: number
  future: number
  presence: Presence
  lever?: Lever
}

export const CATEGORIES = ['Incident', 'PagerDuty', 'Monitoring', 'CI/CD', 'Other'] as const
export type Category = (typeof CATEGORIES)[number]

export const KIND_LABEL: Record<Kind, string> = {
  input: 'Signal',
  step: 'Step',
  decision: 'Decision',
  automation: 'Automated step',
  output: 'Output',
  handoff: 'Handoff',
  wait: 'Wait',
  document: 'Document',
  system: 'System',
  subprocess: 'Sub-process',
}

export const KIND_GROUP: Record<Kind, string> = {
  input: 'Signals',
  step: 'Steps',
  decision: 'Decisions',
  automation: 'Automated steps',
  output: 'Outputs',
  handoff: 'Handoffs and escalations',
  wait: 'Waits and delays',
  document: 'Documents and records',
  system: 'Systems and data',
  subprocess: 'Sub-processes',
}

export const KIND_ORDER: Kind[] = ['input', 'step', 'decision', 'handoff', 'wait', 'document', 'system', 'subprocess', 'automation', 'output']

export const PRESENCE_LABEL: Record<Presence, string> = {
  both: 'Both',
  'current-only': 'Current only',
  'future-only': 'Future only',
}
