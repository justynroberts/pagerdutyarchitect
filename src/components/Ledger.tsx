import { useMemo } from 'react'
import clsx from 'clsx'
import { useDwell } from '../store'
import { fmt, fmtHours, fmtMoney, summarise } from '../lib/time'
import { NumberInput } from './ui'

export function Ledger() {
  const nodes = useDwell((s) => s.nodes)
  const runs = useDwell((s) => s.runsPerMonth)
  const rate = useDwell((s) => s.ratePerHour)
  const mode = useDwell((s) => s.mode)
  const setRuns = useDwell((s) => s.setRuns)
  const setRate = useDwell((s) => s.setRate)
  const s = useMemo(() => summarise(nodes, runs, rate), [nodes, runs, rate])

  return (
    <footer className="ledger" aria-label="Time ledger">
      <div className="ledger__seg" title="Each step's time multiplied by the share of runs that reach it">
        <span className="ledger__label">Effort per run</span>
      </div>
      <div className="ledger__seg">
        <span className="ledger__label">Current</span>
        <span className={clsx('ledger__num', mode === 'current' && 'is-active')}>{fmt(s.current)}</span>
      </div>
      <div className="ledger__seg">
        <span className="ledger__label">Future</span>
        <span className={clsx('ledger__num', mode === 'future' && 'is-active')}>{fmt(s.future)}</span>
      </div>
      <div className="ledger__seg">
        <span className="ledger__label">Saved</span>
        <span className="ledger__num t--saved">{fmt(Math.max(0, s.saved))}</span>
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
        <span className="ledger__num">{fmtHours(Math.max(0, s.hoursPerMonth))}</span>
      </div>
      <div className="ledger__seg">
        <label className="ledger__label" htmlFor="rate">
          Cost per hour, £
        </label>
        <NumberInput id="rate" value={rate} step={5} min={0} onValue={setRate} className="input--sm" />
      </div>
      <div className="ledger__seg">
        <span className="ledger__label">Value a year</span>
        <span className="ledger__num">{fmtMoney(Math.max(0, s.valuePerYear))}</span>
      </div>
    </footer>
  )
}
