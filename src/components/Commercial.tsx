import { useMemo } from 'react'
import { Plus, Trash } from '@phosphor-icons/react'
import { useDwell } from '../store'
import { summarise } from '../lib/time'
import { computeCommercial, count, money, type IncidentType } from '../lib/commercial'
import { NumberInput } from './ui'

const pct = (v: number) => `${Math.round(v * 10) / 10}%`

function Stat({ label, value, note, big }: { label: string; value: string; note?: string; big?: boolean }) {
  return (
    <div className={big ? 'stat stat--big' : 'stat'}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {note && <span className="stat__note">{note}</span>}
    </div>
  )
}

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

/** The commercial case for the diagram: cost of manual response, value of automating it, break-even. */
export function Commercial() {
  const c = useDwell((s) => s.commercial)
  const set = useDwell((s) => s.setCommercial)
  const checkpoint = useDwell((s) => s.checkpoint)
  const nodes = useDwell((s) => s.nodes)
  const runs = useDwell((s) => s.runsPerMonth)
  const rate = useDwell((s) => s.ratePerHour)
  const overrides = useDwell((s) => s.overrides)
  const diagramPct = useMemo(() => summarise(nodes, runs, rate, overrides).pct, [nodes, runs, rate, overrides])
  const r = useMemo(() => computeCommercial(c, diagramPct), [c, diagramPct])
  const who = c.customer.trim()

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

  return (
    <main className="stage sheet" aria-label="Commercial">
      <div className="sheet__body">
        <header className="sheet__head">
          <span className="sheet__eyebrow">{who ? `${who}  |  ROI` : 'ROI'}</span>
          <h1 className="sheet__title">
            Manual incident response costs {money(r.annualCost)} a year in engineer time
          </h1>
          <p className="sheet__lede">
            {count(c.incidentsPerYear)} incidents a year, {count(r.worked)} of them worked, at a blended {money(r.blendedRate, true)} an hour.
          </p>
        </header>

        <section className="sheet__row" aria-label="Cost of manual response">
          <Stat big label="Annual response cost" value={money(r.annualCost)} note={`${count(c.incidentsPerYear)} incidents a year`} />
          <Stat label="Engineer time" value={`${count(r.hours)} hrs`} note={`${count(r.worked)} incidents worked`} />
          <Stat label="Blended hourly rate" value={money(r.blendedRate, true)} note={`£${c.rateIn} in hours, £${c.rateOut} out`} />
          <Stat label="Per minute of response" value={money(r.perMinute, true)} note="the unit of this model" />
        </section>

        <section className="sheet__row" aria-label="By incident type">
          {r.types.map((t) => (
            <Stat key={t.id} label={`${t.name}  |  ${t.minutes} min per incident`} value={money(t.cost)} note={`${count(t.hours)} hours of engineer time a year, ${count(t.incidents)} incidents`} />
          ))}
        </section>

        <section className="sheet__band" aria-label={`Every ${c.stepPct}% automated`}>
          <Stat big label={`Every ${c.stepPct}% of response time automated`} value={money(r.stepValue)} note="saved a year" />
          <ul className="sheet__split">
            {r.types.map((t) => (
              <li key={t.id}>
                <b>{money(t.stepValue)}</b>
                <span>
                  {Math.round(t.minutesSaved * 10) / 10} min saved on each of {count(t.incidents)} {t.name.toLowerCase()} incidents
                </span>
              </li>
            ))}
            <li>
              <b>{count(r.stepHours)}</b>
              <span>engineer hours returned a year</span>
            </li>
          </ul>
        </section>

        <section className="sheet__row sheet__row--accent" aria-label="This diagram">
          <Stat big label={`This diagram removes ${pct(r.atDiagram.pct)} of effort`} value={money(r.atDiagram.value)} note={`saved a year, ${count(r.atDiagram.hours)} engineer hours`} />
          {r.breakEvenPct !== null ? (
            <>
              <Stat label="Break-even" value={pct(r.breakEvenPct)} note={`of response time automated covers ${money(c.investment)} a year`} />
              <Stat label="Return" value={r.atDiagram.roi !== null ? `${(Math.round(r.atDiagram.roi * 10) / 10).toFixed(1)}×` : '—'} note="the investment, at this diagram's saving" />
              <Stat label="Payback" value={r.atDiagram.paybackMonths !== null ? `${(Math.round(r.atDiagram.paybackMonths * 10) / 10).toFixed(1)} mo` : '—'} note="at this diagram's saving" />
            </>
          ) : (
            <p className="sheet__hint">Add the PagerDuty investment in the assumptions to see break-even, return and payback.</p>
          )}
        </section>

        <p className="sheet__foot">
          Assumptions: {count(c.incidentsPerYear)} incidents a year, {c.discardedPct}% discarded, {100 - c.outOfHoursPct}/{c.outOfHoursPct} in/out of hours at £{c.rateIn}/£{c.rateOut} an hour,{' '}
          {c.types.map((t) => `${t.minutes} min per ${t.name.toLowerCase()}`).join(', ')}. At £{c.rateIn} an hour alone the annual cost is {money(r.inHoursCost)}. The diagram's saving is effort per run from the Future state.
        </p>
      </div>

      <aside className="sheet__inputs" aria-label="Assumptions">
        <h2 className="sheet__h2">Assumptions</h2>
        <label className="sheet__field">
          <span>Customer</span>
          <input className="input input--sm" value={c.customer} placeholder="Name on the sheet" onFocus={checkpoint} onChange={(e) => set({ customer: e.target.value })} />
        </label>
        <Num label="Incidents a year" value={c.incidentsPerYear} step={1000} onValue={(v) => set({ incidentsPerYear: v })} />
        <Num label="Discarded" value={c.discardedPct} max={100} unit="%" onValue={(v) => set({ discardedPct: v })} />

        <h3 className="sheet__h3">Incident types</h3>
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
          Add type
        </button>

        <h3 className="sheet__h3">Rates</h3>
        <Num label="In hours" value={c.rateIn} unit="£/hr" onValue={(v) => set({ rateIn: v })} />
        <Num label="Out of hours" value={c.rateOut} unit="£/hr" onValue={(v) => set({ rateOut: v })} />
        <Num label="Share out of hours" value={c.outOfHoursPct} max={100} unit="%" onValue={(v) => set({ outOfHoursPct: v })} />

        <h3 className="sheet__h3">Investment</h3>
        <Num label="Quote savings per" value={c.stepPct} max={100} unit="%" onValue={(v) => set({ stepPct: v || 10 })} />
        <Num label="PagerDuty investment" value={c.investment} step={1000} unit="£/yr" onValue={(v) => set({ investment: v })} />
      </aside>
    </main>
  )
}
