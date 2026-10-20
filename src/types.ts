import type { Edge, Node } from '@xyflow/react'
import type { IconKey } from './lib/icons'

export type Kind = 'input' | 'step' | 'decision' | 'automation' | 'output'
/** Which state of the process a node or connection belongs to. */
export type Presence = 'both' | 'current-only' | 'future-only'
export type Mode = 'current' | 'future'
export type Direction = 'LR' | 'TB'
export type ThemePref = 'light' | 'dark' | 'auto'

export type NodeData = {
  kind: Kind
  label: string
  /** System or team that owns the step, shown under the label. */
  tool: string
  icon: IconKey
  /** Minutes this step takes today. */
  current: number
  /** Minutes it takes after automation. */
  future: number
  /** Percentage of runs that pass through this step. */
  share: number
  presence: Presence
  note: string
}

export type EdgeData = {
  presence: Presence
  label: string
  /** Derived at render time, never stored. */
  ghost?: boolean
}

export type DwellNode = Node<NodeData, 'flow'>
export type DwellEdge = Edge<EdgeData, 'flow'>

export type CatalogItem = {
  id: string
  kind: Kind
  label: string
  tool: string
  icon: IconKey
  current: number
  future: number
  presence: Presence
}

export const KIND_LABEL: Record<Kind, string> = {
  input: 'Input',
  step: 'Step',
  decision: 'Decision',
  automation: 'Automated step',
  output: 'Output',
}

export const KIND_GROUP: Record<Kind, string> = {
  input: 'Inputs',
  step: 'Steps',
  decision: 'Decisions',
  automation: 'Automated steps',
  output: 'Outputs',
}

export const KIND_ORDER: Kind[] = ['input', 'step', 'decision', 'automation', 'output']

export const PRESENCE_LABEL: Record<Presence, string> = {
  both: 'Both',
  'current-only': 'Current only',
  'future-only': 'Future only',
}
