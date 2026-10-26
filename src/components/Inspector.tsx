import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useReactFlow } from '@xyflow/react'
import { ArrowsLeftRight, Copy, PencilSimple, Trash } from '@phosphor-icons/react'
import { useDwell } from '../store'
import { MARK_COLORS } from '../lib/palette'
import { DIMS } from '../lib/layout'
import { checkDiagram } from '../lib/check'
import { fmt, fmtDelta, savedByLever, stepSaved, topSavings } from '../lib/time'
import {
  KIND_LABEL,
  KIND_ORDER,
  type DwellEdge,
  type Lever,
  type Zone,
  type LineStyle,
  type DwellNode,
  type Kind,
  type Presence,
} from '../types'
import { Field, IconPicker, NumberInput, Segmented } from './ui'

const PRESENCE_OPTIONS: { value: Presence; node: string }[] = [
  { value: 'both', node: 'Both' },
  { value: 'current-only', node: 'Current' },
  { value: 'future-only', node: 'Future' },
]

export function Swatches({ value, onPick, label }: { value: string; onPick: (c: string) => void; label: string }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {MARK_COLORS.map((c) => (
        <button key={c.value} role="radio" aria-checked={value === c.value} aria-label={c.name} className="swatch" style={{ background: c.value }} onClick={() => onPick(c.value)} />
      ))}
    </div>
  )
}


/**
 * Delete for whatever is selected. When the selection exists on both tabs, choose: remove it from the
 * tab showing (it stays on the other one) or delete it from both. Del and Shift Del do the same.
 */
function DeleteButtons({ what = '' }: { what?: string }) {
  const { deleteSelected, mode, nodes, edges } = useDwell()
  const shared = nodes.some((n) => n.selected && n.data.presence === 'both') || edges.some((e) => e.selected && (e.data?.presence ?? 'both') === 'both')
  const label = what ? ` ${what}` : ''
  if (!shared)
    return (
      <button className="btn btn--outline btn--wide btn--danger" onClick={() => deleteSelected('both')} title="Del">
        <Trash size={16} weight="light" />
        Delete{label}
      </button>
    )
  return (
    <div className="grid grid-cols-2 gap-2">
      <button className="btn btn--outline btn--wide btn--danger" onClick={() => deleteSelected('here')} title={`Del. It stays in ${mode === 'current' ? 'Future' : 'Current'}`}>
        <Trash size={16} weight="light" />
        Remove from {mode === 'current' ? 'Current' : 'Future'}
      </button>
      <button className="btn btn--outline btn--wide btn--danger" onClick={() => deleteSelected('both')} title="Shift Del">
        <Trash size={16} weight="bold" />
        Delete from both
      </button>
    </div>
  )
}

function ZonePanel({ zone }: { zone: Zone }) {
  const { updateZone, checkpoint, deleteSelected } = useDwell()
  return (
    <div className="insp">
      <h2 className="insp__title">{zone.kind === 'area' ? 'Highlighted area' : 'Label'}</h2>
      <Field label="Text" htmlFor="z-label">
        <input id="z-label" className="input" value={zone.label} onFocus={checkpoint} onChange={(e) => updateZone(zone.id, { label: e.target.value })} />
      </Field>
      <Field label="Colour">
        <Swatches
          label="Colour"
          value={zone.color}
          onPick={(color) => {
            checkpoint()
            updateZone(zone.id, { color })
          }}
        />
      </Field>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
        {zone.kind === 'area'
          ? 'Drag it by its label. Drag the edges or corners to resize. Steps inside stay where they are.'
          : 'Drag it to move it.'}
      </p>
      <button className="btn btn--outline btn--wide btn--danger" onClick={() => deleteSelected('both')}>
        <Trash size={16} weight="light" />
        Delete {zone.kind === 'area' ? 'area' : 'label'}
      </button>
    </div>
  )
}

function NodePanel({ node }: { node: DwellNode }) {
  const { updateNode, checkpoint, duplicateSelected, mode, setMode, traceFlow } = useDwell()
  const d = node.data
  const set = (p: Partial<typeof d>) => updateNode(node.id, p)
  const saved = stepSaved(d)
  const pct = d.current > 0 ? Math.round((saved / d.current) * 100) : 0

  const setPresence = (presence: Presence) => {
    checkpoint()
    set({ presence })
    if (presence === 'future-only' && mode === 'current') setMode('future')
    if (presence === 'current-only' && mode === 'future') setMode('current')
  }

  return (
    <div className="insp">
      <h2 className="insp__title">{KIND_LABEL[d.kind]}</h2>

      <Field label="Label" htmlFor="n-label">
        <input id="n-label" className="input" value={d.label} onFocus={checkpoint} onChange={(e) => set({ label: e.target.value })} />
      </Field>
      <Field label="Tool or system" htmlFor="n-tool">
        <input id="n-tool" className="input" value={d.tool} onFocus={checkpoint} onChange={(e) => set({ tool: e.target.value })} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind" htmlFor="n-kind">
          <select
            id="n-kind"
            className="select"
            value={d.kind}
            onChange={(e) => {
              checkpoint()
              set({ kind: e.target.value as Kind })
            }}
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Icon or logo">
          <IconPicker value={d.icon} brand={d.brand} onStart={checkpoint} onChange={(icon) => set({ icon })} onBrand={(brand) => set({ brand })} />
        </Field>
      </div>

      <hr className="insp__rule" />

      <div className="timepair">
        <Field label="Takes now (min)" htmlFor="n-now">
          <NumberInput id="n-now" value={d.current} onStart={checkpoint} onValue={(current) => set({ current })} />
        </Field>
        <Field label="Takes after (min)" htmlFor="n-after">
          <NumberInput id="n-after" value={d.future} onStart={checkpoint} onValue={(future) => set({ future })} />
        </Field>
      </div>

      <div className="change" aria-live="polite">
        <span>Change per run</span>
        <span className={`t ${saved > 0 ? 't--saved' : saved < 0 ? 't--added' : ''}`}>
          {saved === 0 ? 'none' : `${fmtDelta(-saved)}${d.current > 0 && d.presence === 'both' ? ` (${pct > 0 ? '−' : '+'}${Math.abs(pct)}%)` : ''}`}
        </span>
      </div>

      <Field
        label="Share of runs"
        htmlFor="n-share"
        aside={<span className="t">{d.share}%</span>}
      >
        <input
          id="n-share"
          type="range"
          min={0}
          max={100}
          step={1}
          value={d.share}
          onPointerDown={checkpoint}
          onKeyDown={(e) => e.key.startsWith('Arrow') && checkpoint()}
          onChange={(e) => set({ share: Number(e.target.value) })}
        />
      </Field>

      <Field label="Appears in">
        <Segmented<Presence> label="Appears in" fill value={d.presence} options={PRESENCE_OPTIONS} onChange={setPresence} />
      </Field>

      {d.kind !== 'input' && d.kind !== 'output' && (
        <Field label="Benefit comes from">
          <Segmented<Lever>
            label="Benefit comes from"
            fill
            value={d.lever ?? 'none'}
            options={[
              { value: 'none', node: 'Not set' },
              { value: 'ai', node: 'AI' },
              { value: 'automation', node: 'Automation' },
            ]}
            onChange={(lever) => {
              checkpoint()
              set({ lever })
            }}
          />
        </Field>
      )}

      <Field label="Highlight a flow">
        <div className="grid grid-cols-3 gap-2">
          <button className="btn btn--outline btn--wide" onClick={() => traceFlow(node.id, 'down')}>
            From here
          </button>
          <button className="btn btn--outline btn--wide" onClick={() => traceFlow(node.id, 'up')}>
            To here
          </button>
          <button className="btn btn--outline btn--wide" onClick={() => traceFlow(node.id, 'through')}>
            Through
          </button>
        </div>
      </Field>

      <Field label="Notes" htmlFor="n-note">
        <textarea id="n-note" className="textarea" value={d.note} onFocus={checkpoint} onChange={(e) => set({ note: e.target.value })} />
      </Field>

      <button className="btn btn--outline btn--wide" onClick={duplicateSelected}>
        <Copy size={16} weight="light" />
        Duplicate
      </button>
      <DeleteButtons />
    </div>
  )
}

const SIDES: { value: string; label: string }[] = [
  { value: 't', label: 'Top' },
  { value: 'r', label: 'Right' },
  { value: 'b', label: 'Bottom' },
  { value: 'l', label: 'Left' },
]

function EdgePanel({ edge }: { edge: DwellEdge }) {
  const { updateEdge, checkpoint, nodes, mode, setMode, reverseEdge, setEdgeSides, flows, setEdgesInFlow, createFlow } =
    useDwell()
  const from = nodes.find((n) => n.id === edge.source)
  const to = nodes.find((n) => n.id === edge.target)
  const presence = edge.data?.presence ?? 'both'
  const mine = edge.data?.flows ?? []
  return (
    <div className="insp">
      <h2 className="insp__title">Connector</h2>
      <p style={{ margin: 0, color: 'var(--muted)' }}>
        {from?.data.label ?? 'Unknown'} to {to?.data.label ?? 'unknown'}
      </p>
      <Field label="Label" htmlFor="e-label">
        <input
          id="e-label"
          className="input"
          value={edge.data?.label ?? ''}
          placeholder="Yes, No, High"
          onFocus={checkpoint}
          onChange={(e) => updateEdge(edge.id, { label: e.target.value })}
        />
      </Field>

      <Field label="Line">
        <Segmented<LineStyle>
          label="Line"
          fill
          value={edge.data?.line ?? 'step'}
          options={[
            { value: 'step', node: 'Elbow' },
            { value: 'curve', node: 'Curve' },
            { value: 'straight', node: 'Straight' },
          ]}
          onChange={(line) => {
            checkpoint()
            updateEdge(edge.id, { line })
          }}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Leaves from" htmlFor="e-from">
          <select
            id="e-from"
            className="select"
            value={edge.sourceHandle ?? 'r'}
            onChange={(e) => {
              checkpoint()
              setEdgeSides(edge.id, e.target.value, edge.targetHandle ?? 'l')
            }}
          >
            {SIDES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Arrives at" htmlFor="e-to">
          <select
            id="e-to"
            className="select"
            value={edge.targetHandle ?? 'l'}
            onChange={(e) => {
              checkpoint()
              setEdgeSides(edge.id, edge.sourceHandle ?? 'r', e.target.value)
            }}
          >
            {SIDES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <button className="btn btn--outline btn--wide" onClick={() => reverseEdge(edge.id)}>
        <ArrowsLeftRight size={16} weight="light" />
        Reverse direction
      </button>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>Drag either end of the line onto another step to reconnect it.</p>

      <hr className="insp__rule" />

      <Field label="Flows">
        {flows.length === 0 && <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>No flows yet.</p>}
        <ul className="flowlist">
          {flows.map((f) => (
            <li key={f.id}>
              <label className="check">
                <input type="checkbox" checked={mine.includes(f.id)} onChange={(e) => setEdgesInFlow(f.id, [edge.id], e.target.checked)} />
                {f.name}
              </label>
            </li>
          ))}
        </ul>
        <button className="btn btn--outline btn--wide" onClick={() => createFlow('', [edge.id])}>
          New flow from this connector
        </button>
      </Field>

      <hr className="insp__rule" />

      <Field label="Appears in">
        <Segmented<Presence>
          label="Appears in"
          fill
          value={presence}
          options={PRESENCE_OPTIONS}
          onChange={(p) => {
            checkpoint()
            updateEdge(edge.id, { presence: p })
            if (p === 'future-only' && mode === 'current') setMode('future')
          }}
        />
      </Field>
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
        A route that only exists after automation stays hidden in Current. A current route that automation replaces is hidden in Future.
      </p>
      <DeleteButtons what="connector" />
    </div>
  )
}

function ManyEdges({ edges }: { edges: DwellEdge[] }) {
  const { flows, createFlow, setEdgesInFlow } = useDwell()
  const ids = edges.map((e) => e.id)
  const [target, setTarget] = useState('')
  const [name, setName] = useState('')
  const flowId = target || flows[0]?.id || ''
  return (
    <div className="insp">
      <h2 className="insp__title">{edges.length} connectors selected</h2>
      <p style={{ margin: 0, color: 'var(--muted)' }}>Shift click connectors to build a path, then save it as a flow to highlight it later.</p>
      <Field label="New flow" htmlFor="m-name">
        <div className="flex gap-2">
          <input id="m-name" className="input" value={name} placeholder="Quick fix path" onChange={(e) => setName(e.target.value)} />
          <button
            className="btn btn--primary"
            onClick={() => {
              createFlow(name, ids)
              setName('')
            }}
          >
            Create
          </button>
        </div>
      </Field>
      {flows.length > 0 && (
        <Field label="Existing flow" htmlFor="m-flow">
          <select id="m-flow" className="select" value={flowId} onChange={(e) => setTarget(e.target.value)}>
            {flows.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn--outline btn--wide" onClick={() => setEdgesInFlow(flowId, ids, true)}>
              Add to flow
            </button>
            <button className="btn btn--outline btn--wide" onClick={() => setEdgesInFlow(flowId, ids, false)}>
              Remove from flow
            </button>
          </div>
        </Field>
      )}
      <DeleteButtons what="connectors" />
    </div>
  )
}

function Flows() {
  const { flows, edges, activeFlow, setActiveFlow, renameFlow, deleteFlow, checkpoint, setFlowColor } = useDwell()
  const [editing, setEditing] = useState<string | null>(null)
  if (flows.length === 0) {
    return (
      <section style={{ display: 'grid', gap: 6 }}>
        <h2 className="insp__title">Flows</h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
          A flow is a named path of connectors. Select a step and choose From here, To here or Through, or shift click several connectors and save them.
        </p>
      </section>
    )
  }
  return (
    <section style={{ display: 'grid', gap: 6 }}>
      <h2 className="insp__title">Flows</h2>
      <ul className="flowlist flowlist--rows">
        {flows.map((f) => {
          const count = edges.filter((e) => e.data?.flows?.includes(f.id)).length
          const on = activeFlow === f.id
          return (
            <li key={f.id} className={on ? 'is-on' : undefined}>
              {editing === f.id ? (
                <span className="flowrow__go">
                  <i className="flowdot" style={{ background: f.color }} />
                  <input
                    className="input input--sm"
                    aria-label={`Name of ${f.name}`}
                    value={f.name}
                    autoFocus
                    onFocus={checkpoint}
                    onBlur={() => setEditing(null)}
                    onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
                    onChange={(e) => renameFlow(f.id, e.target.value)}
                  />
                </span>
              ) : (
                <button className="flowrow__go" aria-pressed={on} onClick={() => setActiveFlow(on ? null : f.id)}>
                  <i className="flowdot" style={{ background: f.color }} />
                  <span>
                    <span className="flowrow__name">{f.name}</span>
                    <span className="flowrow__meta">{count} connectors</span>
                  </span>
                </button>
              )}
              <button className="btn btn--icon" aria-label={`Rename ${f.name}`} title="Rename" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(editing === f.id ? null : f.id)}>
                <PencilSimple size={16} weight="light" />
              </button>
              <button
                className="btn btn--icon"
                aria-label={`Select the connectors in ${f.name}`}
                title="Select its connectors"
                onClick={() =>
                  useDwell.setState((s) => ({
                    nodes: s.nodes.map((n) => ({ ...n, selected: false })),
                    edges: s.edges.map((e) => ({ ...e, selected: !!e.data?.flows?.includes(f.id) })),
                  }))
                }
              >
                <ArrowsLeftRight size={16} weight="light" />
              </button>
              <button className="btn btn--icon" aria-label={`Delete flow ${f.name}`} onClick={() => deleteFlow(f.id)}>
                <Trash size={16} weight="light" />
              </button>
              {editing === f.id && (
                <div className="flowrow__colors" onMouseDown={(e) => e.preventDefault()}>
                  <Swatches label={`Colour of ${f.name}`} value={f.color} onPick={(c) => setFlowColor(f.id, c)} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Overview() {
  const nodes = useDwell((s) => s.nodes)
  const select = useDwell((s) => s.select)
  const setMode = useDwell((s) => s.setMode)
  const rf = useReactFlow<DwellNode, DwellEdge>()
  const edges = useDwell((s) => s.edges)
  const flows = useDwell((s) => s.flows)
  const issues = useMemo(() => checkDiagram({ nodes, edges, flows } as never), [nodes, edges, flows])
  const savings = useMemo(() => topSavings(nodes), [nodes])
  const levers = useMemo(() => savedByLever(nodes), [nodes])
  const leverTotal = levers.reduce((a, b) => a + b.saved, 0) || 1
  const top = savings[0]?.saved ?? 1

  const go = (id: string) => {
    select(id)
    setMode('future')
    const n = rf.getNode(id)
    if (n) rf.setCenter(n.position.x + DIMS[n.data.kind].w / 2, n.position.y + DIMS[n.data.kind].h / 2, { zoom: Math.max(rf.getZoom(), 0.9), duration: 300 })
  }

  return (
    <div className="insp">
      <section style={{ display: 'grid', gap: 4 }}>
        <h2 className="insp__title">Where the time comes back</h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>Expected minutes saved per run, weighted by how often each step happens.</p>
        {savings.length === 0 ? (
          <p style={{ margin: '12px 0 0', color: 'var(--muted)' }}>
            No savings yet. Give a step a lower &ldquo;Takes after&rdquo; time and it will show up here.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, borderTop: '1px solid var(--line)' }}>
            {savings.map((s) => (
              <li key={s.id}>
                <button className="saving" onClick={() => go(s.id)}>
                  <span className="saving__name">{s.label}</span>
                  <span className="t t--saved">{fmtDelta(-s.saved)}</span>
                  <span className="saving__bar">
                    <i className="hatch" style={{ width: `${Math.max(3, (s.saved / top) * 100)}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {nodes.length > 0 && (
        <>
          <hr className="insp__rule" />
          <section style={{ display: 'grid', gap: 4 }}>
            <h2 className="insp__title">Checks</h2>
            {issues.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>Nothing to flag. Every step is connected and tagged.</p>
            ) : (
              <div className="checks">
                {issues.map((i, n) => (
                  <button key={n} className="checks__item" data-sev={i.severity} disabled={!i.step} onClick={() => i.step && select(i.step)}>
                    <i aria-hidden="true" />
                    <span>{i.message}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {levers.length > 0 && (
        <>
          <hr className="insp__rule" />
          <section style={{ display: 'grid', gap: 6 }}>
            <h2 className="insp__title">Where the benefit is made</h2>
            <ul className="levers">
              {levers.map((l) => (
                <li key={l.lever}>
                  <span>{l.lever === 'ai' ? 'AI' : l.lever === 'automation' ? 'Automation' : 'Not set'}</span>
                  <span className="t t--saved">{fmtDelta(-l.saved)}</span>
                  <span className="saving__bar">
                    <i className={`lever-bar lever-bar--${l.lever}`} style={{ width: `${Math.max(3, (l.saved / leverTotal) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <hr className="insp__rule" />
      <Flows />

      <hr className="insp__rule" />

      <section style={{ display: 'grid', gap: 10 }}>
        <h2 className="insp__title">Shortcuts</h2>
        <dl className="dl">
          <dt>Show current</dt>
          <dd><kbd>1</kbd></dd>
          <dt>Show future</dt>
          <dd><kbd>2</kbd></dd>
          <dt>Tidy layout</dt>
          <dd><kbd>T</kbd></dd>
          <dt>Search catalogue</dt>
          <dd><kbd>/</kbd></dd>
          <dt>Undo, redo</dt>
          <dd><kbd>Ctrl Z</kbd><kbd>Ctrl Shift Z</kbd></dd>
          <dt>Duplicate</dt>
          <dd><kbd>Ctrl D</kbd></dd>
          <dt>Remove from this tab</dt>
          <dd><kbd>Del</kbd></dd>
          <dt>Delete from both</dt>
          <dd><kbd>Shift Del</kbd></dd>
          <dt>Select several</dt>
          <dd><kbd>Shift</kbd> drag</dd>
        </dl>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
          Drag from the edge handle of one step to another to connect them. Handles appear when you hover a step.
        </p>
      </section>
    </div>
  )
}

function Many({ ids }: { ids: string[] }) {
  const { duplicateSelected, createFlowFromNodes, areaAround, flows } = useDwell()
  const [name, setName] = useState('')
  const [color, setColor] = useState('')
  const [note, setNote] = useState('')
  const make = () => {
    const f = createFlowFromNodes(ids, name, color || undefined)
    if (f) {
      setName('')
      setNote('')
    } else setNote('These steps are not connected to each other yet. Connect them first, or pick steps that already join up.')
  }
  return (
    <div className="insp">
      <h2 className="insp__title">{ids.length} steps selected</h2>
      <p style={{ margin: 0, color: 'var(--muted)' }}>Drag to move them together.</p>

      <Field label="Make a flow from these steps" htmlFor="m-flow-name">
        <input id="m-flow-name" className="input" value={name} placeholder={`Flow ${flows.length + 1}`} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Swatches label="Flow colour" value={color} onPick={setColor} />
      <button className="btn btn--primary btn--wide" onClick={make}>
        Create flow
      </button>
      {note && (
        <p role="status" style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
          {note}
        </p>
      )}
      <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12.5 }}>
        Uses the connectors that run between the selected steps. It is drawn as a wide coloured line and added to the key.
      </p>

      <hr className="insp__rule" />
      <button className="btn btn--outline btn--wide" onClick={() => areaAround(ids)}>
        Highlight with an area
      </button>
      <button className="btn btn--outline btn--wide" onClick={duplicateSelected}>
        <Copy size={16} weight="light" />
        Duplicate
      </button>
      <DeleteButtons />
    </div>
  )
}

export function Inspector({ open }: { open: boolean }) {
  const nodes = useDwell((s) => s.nodes)
  const edges = useDwell((s) => s.edges)
  const reduce = useReducedMotion()
  const selNodes = nodes.filter((n) => n.selected)
  const selEdges = edges.filter((e) => e.selected)
  const zones = useDwell((s) => s.zones)
  const selZones = zones.filter((z) => z.selected)

  let key = 'overview'
  let body = <Overview />
  if (selNodes.length === 1) {
    key = selNodes[0].id
    body = <NodePanel node={selNodes[0]} />
  } else if (selNodes.length > 1) {
    key = 'many'
    body = <Many ids={selNodes.map((n) => n.id)} />
  } else if (selZones.length === 1 && selEdges.length === 0) {
    key = selZones[0].id
    body = <ZonePanel zone={selZones[0]} />
  } else if (selEdges.length > 1) {
    key = 'many-edges'
    body = <ManyEdges edges={selEdges} />
  } else if (selEdges.length === 1) {
    key = selEdges[0].id
    body = <EdgePanel edge={selEdges[0]} />
  }

  return (
    <aside className="inspector" data-open={open} aria-label="Inspector">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          initial={reduce ? false : { opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduce ? undefined : { opacity: 0 }}
          transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </aside>
  )
}

export { fmt }
