import { useMemo } from 'react'
import { useDwell } from '../store'
import { summarise } from '../lib/time'
import { computeCommercial, count, money } from '../lib/commercial'
import { pct, valueStory } from '../lib/valueStory'
import { Logo } from './Logo'

function Stat({ label, value, note, big }: { label: string; value: string; note?: string; big?: boolean }) {
  return (
    <div className={big ? 'stat stat--big' : 'stat'}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
      {note && <span className="stat__note">{note}</span>}
    </div>
  )
}

/** The value case for the diagram: cost of manual response, then productivity, revenue and cost, then the investment. */
export function Commercial() {
  const c = useDwell((s) => s.commercial)
  const nodes = useDwell((s) => s.nodes)
  const runs = useDwell((s) => s.runsPerMonth)
  const rate = useDwell((s) => s.ratePerHour)
  const overrides = useDwell((s) => s.overrides)
  const diagramPct = useMemo(() => summarise(nodes, runs, rate, overrides).pct, [nodes, runs, rate, overrides])
  const r = useMemo(() => computeCommercial(c, diagramPct), [c, diagramPct])
  const story = useMemo(() => valueStory(c, r), [c, r])
  const who = c.customer.trim()

  return (
    <main className="stage sheet" aria-label="Value">
      <div className="sheet__body">
        <header className="sheet__head">
          <span className="sheet__eyebrow">{who ? `${who}  |  Value Assessment` : 'Value Assessment'}</span>
          <h1 className="sheet__title">Manual incident response costs {money(r.annualCost)} a year in engineer time</h1>
          <p className="sheet__lede">
            {count(c.incidentsPerYear)} incidents a year, {count(r.worked)} of them worked, at a blended {money(r.blendedRate, true)} an hour. The PagerDuty
            Reliability Platform removes {pct(r.atDiagram.pct)} of the effort.
          </p>
        </header>

        <section className="sheet__row" aria-label="Cost of manual response">
          <Stat big label="Annual response cost" value={money(r.annualCost)} note={`${count(c.incidentsPerYear)} incidents a year`} />
          <Stat label="Engineer time" value={`${count(r.hours)} hrs`} note={`${count(r.worked)} incidents worked`} />
          <Stat label="Blended hourly rate" value={money(r.blendedRate, true)} note={`£${c.rateIn} in hours, £${c.rateOut} out`} />
          <Stat label="Per minute of response" value={money(r.perMinute, true)} note="the unit of this model" />
        </section>

        {story.length > 0 && (
          <section className="pillars" aria-label="Where the value comes from">
            {story.map((p) => (
              <article key={p.key} className="pillar" data-pillar={p.key}>
                <span className="stat__label">{p.tag}</span>
                <h2 className="pillar__head">{p.head}</h2>
                <p className="pillar__body">{p.body}</p>
                {p.prompt ? (
                  <p className="sheet__hint">{p.prompt}</p>
                ) : (
                  <dl className="pillar__stats">
                    {p.stats.map(([fig, what]) => (
                      <div key={what}>
                        <dt>{fig}</dt>
                        <dd>{what}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </article>
            ))}
          </section>
        )}

        <section className="sheet__row sheet__row--accent" aria-label="Investment">
          <Stat
            big
            label={`PagerDuty Reliability Platform removes ${pct(r.atDiagram.pct)} of effort`}
            value={money(r.cost.total)}
            note={c.directOn && r.cost.direct > 0 ? 'cost savings a year, labour and direct' : `saved a year, ${count(r.atDiagram.hours)} engineer hours`}
          />
          {r.breakEvenPct !== null ? (
            <>
              <Stat label="Break-even" value={pct(r.breakEvenPct)} note={`of response time automated covers ${money(c.investment)} a year`} />
              <Stat label="Return" value={r.atDiagram.roi !== null ? `${r.atDiagram.roi.toFixed(1)}×` : '—'} note="on cost savings alone" />
              <Stat label="Payback" value={r.atDiagram.paybackMonths !== null ? `${r.atDiagram.paybackMonths.toFixed(1)} mo` : '—'} note="on cost savings alone" />
            </>
          ) : (
            <p className="sheet__hint">Add the PagerDuty investment on the Assumptions stage to see break-even, return and payback.</p>
          )}
        </section>

        <details className="sheet__detail">
          <summary>Model detail</summary>
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
        </details>

        <p className="sheet__foot">
          Assumptions: {count(c.incidentsPerYear)} incidents a year, {c.discardedPct}% discarded, {100 - c.outOfHoursPct}/{c.outOfHoursPct} in/out of hours at £{c.rateIn}/£{c.rateOut} an hour,{' '}
          {c.types.map((t) => `${t.minutes} min per ${t.name.toLowerCase()}`).join(', ')}. The platform's saving is the effort per run the diagram's Future state removes.
          {c.showProductivity && ` ${count(c.engineers)} engineers at ${count(c.hoursPerFte)} hours a year.`}
          {c.showRevenue && r.revenue.known && ` ${c.impactPct}% of incidents disrupt trading for ${c.impactMinutes} min each.`}
        </p>
      </div>

      <Logo className="sheet__logo" />

    </main>
  )
}
