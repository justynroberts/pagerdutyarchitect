import { useMemo, useState, type DragEvent } from 'react'
import { useReactFlow } from '@xyflow/react'
import { PencilSimple, Plus } from '@phosphor-icons/react'
import clsx from 'clsx'
import { useDwell } from '../store'
import { DIMS } from '../lib/layout'
import { fmt } from '../lib/time'
import { NodeIcon, PdBadge } from '../lib/icons'
import { CATEGORIES, KIND_GROUP, KIND_ORDER, type CatalogItem, type Category, type DwellEdge, type DwellNode } from '../types'
import { DRAG_MIME, dragging as drag } from './Canvas'
import { ItemDialog } from './ItemDialog'
import { Tip } from './ui'

export function Catalogue({ open }: { open: boolean }) {
  const catalogue = useDwell((s) => s.catalogue)
  const addFromItem = useDwell((s) => s.addFromItem)
  const rf = useReactFlow<DwellNode, DwellEdge>()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<Category | 'All'>('All')
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const inCat = (c: CatalogItem) => cat === 'All' || (c.category ?? 'Incident') === cat
    const match = (c: CatalogItem) => inCat(c) && (!needle || c.label.toLowerCase().includes(needle) || c.tool.toLowerCase().includes(needle))
    return KIND_ORDER.map((kind) => ({ kind, items: catalogue.filter((c) => c.kind === kind && match(c)) })).filter((g) => g.items.length)
  }, [catalogue, q, cat])

  const addAtCentre = (item: CatalogItem) => {
    const stage = document.getElementById('stage')
    if (!stage) return
    const r = stage.getBoundingClientRect()
    const c = rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    const d = DIMS[item.kind]
    const id = addFromItem(item, { position: { x: c.x - d.w / 2, y: c.y - d.h / 2 }, chain: true })
    requestAnimationFrame(() => {
      const n = rf.getNode(id)
      if (!n) return
      const { x, y, zoom } = rf.getViewport()
      const sx = n.position.x * zoom + x
      const sy = n.position.y * zoom + y
      const margin = 48
      const off = sx < margin || sy < margin || sx + d.w * zoom > r.width - margin || sy + d.h * zoom > r.height - margin
      if (off) rf.setCenter(n.position.x + d.w / 2, n.position.y + d.h / 2, { zoom: Math.min(rf.getZoom(), 1), duration: 280 })
    })
  }

  const onDragStart = (e: DragEvent, item: CatalogItem) => {
    e.dataTransfer.setData(DRAG_MIME, item.id)
    e.dataTransfer.effectAllowed = 'copy'
    setDragging(item.id)
    drag.kind = item.kind
  }

  return (
    <aside className="rail" data-open={open} aria-label="Catalogue">
      <div className="rail__head">
        <div className="rail__title">
          <h2 style={{ margin: 0, fontSize: 'inherit' }}>Catalogue</h2>
          <span className="rail__hint">Click to chain, drag to place</span>
        </div>
        <input
          id="catalogue-search"
          className="input"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search steps and tools"
          aria-label="Search the catalogue"
        />
        <div className="chips" role="group" aria-label="Catalogue section">
          {(['All', ...CATEGORIES] as const).map((c) => (
            <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="rail__list">
        {groups.length === 0 && (
          <p style={{ padding: '16px', color: 'var(--muted)' }}>Nothing matches &ldquo;{q}&rdquo;. Try a tool name, or add it as a new item.</p>
        )}
        {groups.map((g) => (
          <section key={g.kind} aria-label={KIND_GROUP[g.kind]}>
            <div className="group__head">
              <span>{KIND_GROUP[g.kind]}</span>
              <span className="group__cols" aria-hidden="true">
                <span>Now</span>
                <span>After</span>
              </span>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {g.items.map((c) => {
                const delta = c.future - c.current
                return (
                  <li key={c.id} className={clsx('item', dragging === c.id && 'is-dragging')}>
                    <button
                      className="item__main"
                      draggable
                      onDragStart={(e) => onDragStart(e, c)}
                      onDragEnd={() => {
                        setDragging(null)
                        drag.kind = null
                      }}
                      onClick={() => addAtCentre(c)}
                      aria-label={`Add ${c.label}. Now ${fmt(c.current)}, after ${fmt(c.future)}.`}
                    >
                      <span className={c.brand === 'pagerduty' ? 'item__tile item__tile--pd' : c.brand ? 'item__tile' : 'item__plain'}>
                        <NodeIcon name={c.icon} brand={c.brand} size={c.brand && c.brand !== 'pagerduty' ? 15 : 16} className="text-muted" />
                        {c.brand === 'pagerduty' && <PdBadge />}
                      </span>
                      <span className="min-w-0">
                        <span className="item__name">{c.label}</span>
                        {c.tool && <span className="item__tool">{c.tool}</span>}
                      </span>
                      <span className="item__times" aria-hidden="true">
                        <span className="t t--muted">{c.presence === 'future-only' ? 'none' : fmt(c.current)}</span>
                        <span className={clsx('t', c.presence === 'current-only' ? 't--muted' : delta < 0 ? 't--saved' : delta > 0 ? 't--added' : '')}>
                          {c.presence === 'current-only' ? 'gone' : fmt(c.future)}
                        </span>
                      </span>
                    </button>
                    <Tip label="Edit item">
                      <button className="btn btn--icon item__edit" aria-label={`Edit ${c.label}`} onClick={() => setEditing(c)}>
                        <PencilSimple size={16} weight="light" />
                      </button>
                    </Tip>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <div style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
        <button className="btn btn--outline btn--wide" onClick={() => setEditing('new')}>
          <Plus size={16} weight="light" />
          New catalogue item
        </button>
      </div>

      {editing && <ItemDialog item={editing} onClose={() => setEditing(null)} />}
    </aside>
  )
}
