import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { X } from '@phosphor-icons/react'
import { useDwell } from '../store'
import { fmt, fmtHours, fmtMoney, parseAmount, parseMinutes, summarise } from '../lib/time'
import { NumberInput } from './ui'

/**
 * A ledger figure you can type over. Click to edit, Enter or leaving the field keeps it, Escape
 * cancels, and an empty field goes back to the calculated value.
 */
function Figure({
  label,
  shown,
  calculated,
  overridden,
  parse,
  onSet,
  className,
}: {
  label: string
  shown: string
  calculated: string
  overridden: boolean
  parse: (text: string) => number | null
  onSet: (value: number | undefined) => void
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft === null) return
    if (draft.trim() === '') onSet(undefined)
    else if (draft.trim() !== shown) {
      const v = parse(draft)
      if (v !== null) onSet(v)
    }
    setDraft(null)
  }

  if (draft !== null) {
    const bad = draft.trim() !== '' && parse(draft) === null
    return (
      <input
        className={clsx('input input--sm ledger__edit', bad && 'is-invalid')}
        aria-label={`${label}. Empty to use the calculated ${calculated}`}
        aria-invalid={bad}
        autoFocus
        value={draft}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') setDraft(null)
        }}
      />
    )
  }
  return (
    <span className="ledger__fig">
      <button
        className={clsx('ledger__num ledger__btn', overridden && 'is-overridden', className)}
        title={overridden ? `Typed over. Calculated: ${calculated}` : 'Click to type over'}
        aria-label={`${label}, ${shown}${overridden ? `, typed over, calculated ${calculated}` : ''}. Edit`}
        onClick={() => setDraft(shown)}
      >
        {shown}
      </button>
      {overridden && (
        <button className="ledger__reset" aria-label={`Use the calculated ${label.toLowerCase()}, ${calculated}`} title={`Back to ${calculated}`} onClick={() => onSet(undefined)}>
          <X size={10} weight="bold" />
        </button>
      )}
    </span>
  )
}

export function Ledger() {
  const nodes = useDwell((s) => s.nodes)
  const runs = useDwell((s) => s.runsPerMonth)
  const rate = useDwell((s) => s.ratePerHour)
  const mode = useDwell((s) => s.mode)
  const overrides = useDwell((s) => s.overrides)
  const setRuns = useDwell((s) => s.setRuns)
  const setRate = useDwell((s) => s.setRate)
  const setOverride = useDwell((s) => s.setOverride)
  const s = useMemo(() => summarise(nodes, runs, rate, overrides), [nodes, runs, rate, overrides])
  // What each figure would be with only its own override removed, for the tooltip and reset label.
  const calc = useMemo(() => {
    const without = (k: keyof typeof overrides) => {
      const rest = { ...overrides }
      delete rest[k]
      return summarise(nodes, runs, rate, rest)
    }
    return { current: without('current'), future: without('future'), hours: without('hoursPerMonth'), value: without('valuePerYear') }
  }, [nodes, runs, rate, overrides])

  return (
    <footer className="ledger" aria-label="Time ledger">
      <div className="ledger__seg" title="Each step's time multiplied by the share of runs that reach it. Click a figure to type over it">
        <span className="ledger__label">Effort per run</span>
      </div>
      <div className="ledger__seg">
        <span className="ledger__label">Current</span>
        <Figure
          label="Current effort per run"
          shown={fmt(s.current)}
          calculated={fmt(calc.current.current)}
          overridden={overrides.current !== undefined}
          parse={parseMinutes}
          onSet={(v) => setOverride('current', v)}
          className={clsx(mode === 'current' && 'is-active')}
        />
      </div>
      <div className="ledger__seg">
        <span className="ledger__label">Future</span>
        <Figure
          label="Future effort per run"
          shown={fmt(s.future)}
          calculated={fmt(calc.future.future)}
          overridden={overrides.future !== undefined}
          parse={parseMinutes}
          onSet={(v) => setOverride('future', v)}
          className={clsx(mode === 'future' && 'is-active')}
        />
      </div>
      <div className="ledger__seg">
        <span className="ledger__label">Saved</span>
        <Figure
          label="Saved per run"
          shown={fmt(Math.max(0, s.saved))}
          calculated={fmt(Math.max(0, calc.future.saved))}
          overridden={overrides.future !== undefined}
          parse={parseMinutes}
          onSet={(v) => setOverride('future', v === undefined ? undefined : Math.max(0, s.current - v))}
          className="t--saved"
        />
        <span className="t t--saved">{s.current > 0 ? `${Math.round(s.pct)}%` : ''}</span>
      </div>
      <div className="ledger__seg">
        <label className="ledger__label" htmlFor="runs">
          Runs a month
        </label>
        <NumberInput id="runs" value={runs} step={10} min={0} onValue={setRuns} className="input--sm" />
      </div>
      <div className="ledger__seg">
        <span className="ledger__label">Hours back a month</span>
        <Figure
          label="Hours back a month"
          shown={fmtHours(Math.max(0, s.hoursPerMonth))}
          calculated={fmtHours(Math.max(0, calc.hours.hoursPerMonth))}
          overridden={overrides.hoursPerMonth !== undefined}
          parse={parseAmount}
          onSet={(v) => setOverride('hoursPerMonth', v)}
        />
      </div>
      <div className="ledger__seg">
        <label className="ledger__label" htmlFor="rate">
          Cost per hour, £
        </label>
        <NumberInput id="rate" value={rate} step={5} min={0} onValue={setRate} className="input--sm" />
      </div>
      <div className="ledger__seg">
        <span className="ledger__label">Value a year</span>
        <Figure
          label="Value a year"
          shown={fmtMoney(Math.max(0, s.valuePerYear))}
          calculated={fmtMoney(Math.max(0, calc.value.valuePerYear))}
          overridden={overrides.valuePerYear !== undefined}
          parse={parseAmount}
          onSet={(v) => setOverride('valuePerYear', v)}
        />
      </div>
    </footer>
  )
}
