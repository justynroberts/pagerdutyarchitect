import { useMemo, useState, type ReactNode } from 'react'
import { Plus, Trash, X } from '@phosphor-icons/react'
import { useDwell } from '../store'
import { fmt, parseMinutes, summarise, type Overrides } from '../lib/time'
import { computeCommercial, money, type Commercial as Sheet, type CostLine, type IncidentType } from '../lib/commercial'
import { pct } from '../lib/valueStory'
import { NumberInput } from './ui'

function Num({ label, value, onValue, step = 1, max, unit }: { label: string; value: number; onValue: (n: number) => void; step?: number; max?: number; unit?: string }) {
  const checkpoint = useDwell((s) => s.checkpoint)
  return (
    <label className="sheet__field">
      <span>{label}</span>
      <span className="sheet__input">
        <NumberInput value={value} onValue={onValue} onStart={checkpoint} step={step} min={0} max={max} ariaLabel={label} className="input--sm" />
        {unit && <span className="sheet__unit">{unit}</span>}
      </span>
    </label>
  )
}

/** A group of assumptions, with a switch when it puts a part of the story on the Value sheet. */
function Group({ title, hint, on, onToggle, children }: { title: string; hint?: string; on?: boolean; onToggle?: (on: boolean) => void; children: ReactNode }) {
  return (
    <section className="setup__group" data-off={onToggle && !on ? 'true' : undefined}>
      <div className="sheet__section">
        <h2 className="sheet__h3">{title}</h2>
        {onToggle && (
          <label className="sheet__check">
            <input type="checkbox" checked={!!on} onChange={(e) => onToggle(e.target.checked)} />
            On Value sheet
          </label>
        )}
      </div>
      {hint && <p className="setup__hint">{hint}</p>}
      {children}
    </section>
  )
}

/** Effort per run as the diagram works it out, which you can type over: 87, 1h 27m, 1.5h. Empty goes back. */
function Effort({ label, which, calculated }: { label: string; which: keyof Overrides; calculated: number }) {
  const value = useDwell((s) => s.overrides[which])
  const setOverride = useDwell((s) => s.setOverride)
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value !== undefined ? fmt(value) : '')
  const commit = () => {
    if (draft === null) return
    if (draft.trim() === '') setOverride(which, undefined)
    else {
      const v = parseMinutes(draft)
      if (v !== null) setOverride(which, v)
    }
    setDraft(null)
  }
  return (
    <label className="sheet__field">
      <span>{label}</span>
      <span className="sheet__input">
        <input
          className="input input--sm"
          aria-label={`${label}. Empty to use the diagram's ${fmt(calculated)}`}
          placeholder={fmt(calculated)}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') setDraft(null)
          }}
        />
        {value !== undefined ? (
          <button className="btn btn--icon" aria-label={`Use the diagram's ${fmt(calculated)}`} title={`Back to ${fmt(calculated)}`} onClick={() => setOverride(which, undefined)}>
            <X size={12} weight="bold" />
          </button>
        ) : (
          <span className="sheet__unit">per run</span>
        )}
      </span>
    </label>
  )
}

/** Stage 1: everything the numbers rest on, in one place, before the diagram and the Value sheet. */
export function Assumptions() {
  const c = useDwell((s) => s.commercial)
  const set = useDwell((s) => s.setCommercial)
  const checkpoint = useDwell((s) => s.checkpoint)
  const title = useDwell((s) => s.title)
  const setTitle = useDwell((s) => s.setTitle)
  const nodes = useDwell((s) => s.nodes)
  const runs = useDwell((s) => s.runsPerMonth)
  const rate = useDwell((s) => s.ratePerHour)
  const overrides = useDwell((s) => s.overrides)
  const calc = useMemo(() => summarise(nodes, runs, rate), [nodes, runs, rate])
  const diagramPct = useMemo(() => summarise(nodes, runs, rate, overrides).pct, [nodes, runs, rate, overrides])
  const r = useMemo(() => computeCommercial(c, diagramPct), [c, diagramPct])

  const toggle = (patch: Partial<Sheet>) => {
    checkpoint()
    set(patch)
  }
  const setType = (id: string, patch: Partial<IncidentType>) => set({ types: c.types.map((t) => (t.id === id ? { ...t, ...patch } : t)) })
  const addType = () => {
    checkpoint()
    const left = Math.max(0, 100 - r.shareTotal)
    set({ types: [...c.types, { id: `t-${Date.now().toString(36)}`, name: `Type ${c.types.length + 1}`, share: left, minutes: 30 }] })
  }
  const removeType = (id: string) => {
    checkpoint()
    set({ types: c.types.filter((t) => t.id !== id) })
  }
  const setLine = (id: string, patch: Partial<CostLine>) => set({ direct: c.direct.map((d) => (d.id === id ? { ...d, ...patch } : d)) })
  const addLine = () => {
    checkpoint()
    set({ direct: [...c.direct, { id: `d-${Date.now().toString(36)}`, name: 'Other saving', amount: 0 }] })
  }
  const removeLine = (id: string) => {
    checkpoint()
    set({ direct: c.direct.filter((d) => d.id !== id) })
  }

  return (
    <main className="stage setup" aria-label="Assumptions">
      <header className="setup__head">
        <span className="sheet__eyebrow">Stage 1  |  Assumptions</span>
        <h1 className="setup__title">What the numbers rest on</h1>
        <p className="sheet__lede">
          Set these with the customer first. The Current and Future diagrams give the share of effort the platform removes; everything else on the Value sheet comes
          from here.
        </p>
      </header>

      <div className="setup__grid">
        <Group title="Customer and process">
          <label className="sheet__field">
            <span>Customer</span>
            <input className="input input--sm" value={c.customer} placeholder="Name on the sheet" onFocus={checkpoint} onChange={(e) => set({ customer: e.target.value })} />
          </label>
          <label className="sheet__field">
            <span>Process</span>
            <input className="input input--sm" value={title} aria-label="Diagram title" onFocus={checkpoint} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <Effort label="Current effort" which="current" calculated={calc.current} />
          <Effort label="Future effort" which="future" calculated={calc.future} />
          <p className="setup__hint">From the diagrams. Type over either to use your own figure; the platform removes {pct(diagramPct)} of effort.</p>
        </Group>

        <Group title="Incidents">
          <Num label="Incidents a year" value={c.incidentsPerYear} step={1000} onValue={(v) => set({ incidentsPerYear: v })} />
          <Num label="Discarded" value={c.discardedPct} max={100} unit="%" onValue={(v) => set({ discardedPct: v })} />
          {r.types.map((t) => (
            <div key={t.id} className="sheet__type">
              <input className="input input--sm" aria-label="Type name" value={t.name} onFocus={checkpoint} onChange={(e) => setType(t.id, { name: e.target.value })} />
              <NumberInput value={t.share} max={100} step={1} onStart={checkpoint} onValue={(v) => setType(t.id, { share: v })} ariaLabel={`${t.name} share of worked incidents, percent`} className="input--sm" />
              <span className="sheet__unit">%</span>
              <NumberInput value={t.minutes} step={5} onStart={checkpoint} onValue={(v) => setType(t.id, { minutes: v })} ariaLabel={`${t.name} minutes per incident`} className="input--sm" />
              <span className="sheet__unit">min</span>
              <button className="btn btn--icon" aria-label={`Remove ${t.name}`} onClick={() => removeType(t.id)} disabled={c.types.length < 2}>
                <Trash size={14} weight="light" />
              </button>
            </div>
          ))}
          {Math.abs(r.shareTotal - 100) > 0.05 && <p className="sheet__warn">Shares add up to {pct(r.shareTotal)}, not 100%.</p>}
          <button className="btn" onClick={addType}>
            <Plus size={14} weight="light" />
            Add incident type
          </button>
        </Group>

        <Group title="Rates">
          <Num label="In hours" value={c.rateIn} unit="£/hr" onValue={(v) => set({ rateIn: v })} />
          <Num label="Out of hours" value={c.rateOut} unit="£/hr" onValue={(v) => set({ rateOut: v })} />
          <Num label="Share out of hours" value={c.outOfHoursPct} max={100} unit="%" onValue={(v) => set({ outOfHoursPct: v })} />
          <p className="setup__hint">
            Blended {money(r.blendedRate, true)} an hour: manual response costs {money(r.annualCost)} a year.
          </p>
        </Group>

        <Group title="Productivity gain" on={c.showProductivity} onToggle={(v) => toggle({ showProductivity: v })}>
          <Num label="Engineers" value={c.engineers} step={10} onValue={(v) => set({ engineers: v })} />
          <Num label="Hours per FTE a year" value={c.hoursPerFte} step={10} unit="hrs" onValue={(v) => set({ hoursPerFte: v || 1720 })} />
        </Group>

        <Group title="Revenue protection" hint="Average trading revenue, and peak event revenue such as Black Friday or peak platform hours." on={c.showRevenue} onToggle={(v) => toggle({ showRevenue: v })}>
          <Num label="Average trading revenue" value={c.revenuePerHour} step={1000} unit="£/hr" onValue={(v) => set({ revenuePerHour: v })} />
          <Num label="Peak event revenue" value={c.peakRevenuePerHour} step={1000} unit="£/hr" onValue={(v) => set({ peakRevenuePerHour: v })} />
          <Num label="Incidents disrupting trading" value={c.impactPct} max={100} unit="%" onValue={(v) => set({ impactPct: v })} />
          <Num label="Disruption per incident" value={c.impactMinutes} step={5} unit="min" onValue={(v) => set({ impactMinutes: v })} />
        </Group>

        <Group title="Cost savings" on={c.showCost} onToggle={(v) => toggle({ showCost: v })}>
          <label className="sheet__check sheet__check--row">
            <input type="checkbox" checked={c.directOn} onChange={(e) => toggle({ directOn: e.target.checked })} />
            Include direct cost reductions
          </label>
          {c.directOn && (
            <>
              {c.direct.map((d) => (
                <div key={d.id} className="sheet__line">
                  <input className="input input--sm" aria-label="Saving" value={d.name} onFocus={checkpoint} onChange={(e) => setLine(d.id, { name: e.target.value })} />
                  <NumberInput value={d.amount} step={1000} onStart={checkpoint} onValue={(v) => setLine(d.id, { amount: v })} ariaLabel={`${d.name}, pounds a year`} className="input--sm" />
                  <span className="sheet__unit">£/yr</span>
                  <button className="btn btn--icon" aria-label={`Remove ${d.name}`} onClick={() => removeLine(d.id)}>
                    <Trash size={14} weight="light" />
                  </button>
                </div>
              ))}
              <button className="btn" onClick={addLine}>
                <Plus size={14} weight="light" />
                Add saving
              </button>
            </>
          )}
        </Group>

        <Group title="Investment">
          <Num label="PagerDuty investment" value={c.investment} step={1000} unit="£/yr" onValue={(v) => set({ investment: v })} />
          <Num label="Quote savings per" value={c.stepPct} max={100} unit="%" onValue={(v) => set({ stepPct: v || 10 })} />
        </Group>
      </div>
    </main>
  )
}
