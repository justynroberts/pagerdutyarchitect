import { useMemo } from 'react'
import { ArrowLeft, ArrowRight } from '@phosphor-icons/react'
import { useDwell, stageOf, type Stage } from '../store'
import { fmt, summarise } from '../lib/time'
import { computeCommercial, count, money } from '../lib/commercial'
import { pct } from '../lib/valueStory'

/**
 * The walk through, under the top bar: Assumptions, Current state, Future state, Value. Each stage
 * carries its headline figure, and Back and Next move one stage at a time.
 */
export function Stages() {
  const view = useDwell((s) => s.view)
  const mode = useDwell((s) => s.mode)
  const goTo = useDwell((s) => s.goTo)
  const nodes = useDwell((s) => s.nodes)
  const runs = useDwell((s) => s.runsPerMonth)
  const rate = useDwell((s) => s.ratePerHour)
  const overrides = useDwell((s) => s.overrides)
  const commercial = useDwell((s) => s.commercial)
  const showTimes = useDwell((s) => s.showTimes)
  const sum = useMemo(() => summarise(nodes, runs, rate, overrides), [nodes, runs, rate, overrides])
  const value = useMemo(() => computeCommercial(commercial, sum.pct), [commercial, sum.pct])
  const stage = stageOf(view, mode)

  const steps: { n: Stage; label: string; note: string }[] = [
    { n: 1, label: 'Assumptions', note: commercial.customer.trim() || `${count(commercial.incidentsPerYear)} incidents a year` },
    // With times hidden (the timer button), the states carry no timings either, so a walk-through can leave them out.
    { n: 2, label: 'Current state', note: showTimes ? `${fmt(sum.current)} per run` : '' },
    { n: 3, label: 'Future state', note: !showTimes ? '' : sum.current > 0 ? `${fmt(sum.future)} per run, ${pct(sum.pct)} less` : `${fmt(sum.future)} per run` },
    { n: 4, label: 'Value', note: `${money(value.cost.total)} a year` },
  ]
  const next = steps.find((s) => s.n === stage + 1)

  return (
    <nav className="stages" aria-label="Stages">
      <ol className="stages__list">
        {steps.map((s) => (
          <li key={s.n}>
            <button className="stages__step" aria-current={s.n === stage ? 'step' : undefined} data-done={s.n < stage ? 'true' : undefined} onClick={() => goTo(s.n)} title={`Stage ${s.n} (${s.n})`}>
              <span className="stages__n" aria-hidden="true">
                {s.n}
              </span>
              <span className="stages__text">
                <span className="stages__label">{s.label}</span>
                {s.note && <span className="stages__note">{s.note}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="stages__nav">
        <button className="btn" onClick={() => goTo((stage - 1) as Stage)} disabled={stage === 1} aria-label="Back a stage">
          <ArrowLeft size={14} weight="bold" />
          Back
        </button>
        {next && (
          <button className="btn btn--primary" onClick={() => goTo(next.n)}>
            Next: {next.label}
            <ArrowRight size={14} weight="bold" />
          </button>
        )}
      </div>
    </nav>
  )
}
