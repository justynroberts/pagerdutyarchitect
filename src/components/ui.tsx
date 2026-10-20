import { useEffect, useId, useState, type ReactNode } from 'react'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Popover from '@radix-ui/react-popover'
import clsx from 'clsx'
import { ICON_KEYS, NodeIcon, type IconKey } from '../lib/icons'

export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root delayDuration={450}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={6}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  fill,
  large,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; node: ReactNode; ariaLabel?: string }[]
  label: string
  fill?: boolean
  large?: boolean
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      aria-label={label}
      className={clsx('seg', fill && 'seg--fill', large && 'seg--lg')}
    >
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value} className="seg__item" aria-label={o.ariaLabel}>
          {o.node}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

export function Field({ label, htmlFor, children, aside }: { label: string; htmlFor?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="field">
      <div className="flex items-baseline justify-between gap-2">
        <label className="field__label" htmlFor={htmlFor}>
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  )
}

const tidy = (n: number) => String(Math.round(n * 100) / 100)

export function NumberInput({
  value,
  onValue,
  onStart,
  min = 0,
  max,
  step = 0.5,
  id,
  className,
  ariaLabel,
}: {
  value: number
  onValue: (n: number) => void
  onStart?: () => void
  min?: number
  max?: number
  step?: number
  id?: string
  className?: string
  ariaLabel?: string
}) {
  const [draft, setDraft] = useState(tidy(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setDraft(tidy(value))
  }, [value, focused])

  const valid = (n: number, raw: string) =>
    raw.trim() !== '' && Number.isFinite(n) && n >= min && (max === undefined || n <= max)
  const invalid = !valid(Number(draft), draft)

  return (
    <input
      id={id}
      aria-label={ariaLabel}
      inputMode="decimal"
      className={clsx('input input--mono', className)}
      value={draft}
      aria-invalid={invalid}
      onFocus={() => {
        setFocused(true)
        onStart?.()
      }}
      onBlur={() => {
        setFocused(false)
        setDraft(tidy(value))
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = Number(e.target.value)
        if (valid(n, e.target.value)) onValue(n)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        e.preventDefault()
        const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
        let next = Math.round((Number(draft) + delta) * 100) / 100
        if (!Number.isFinite(next)) next = value
        next = Math.max(min, max === undefined ? next : Math.min(max, next))
        setDraft(tidy(next))
        onValue(next)
      }}
    />
  )
}

export function IconPicker({ value, onChange, onStart }: { value: IconKey; onChange: (k: IconKey) => void; onStart?: () => void }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="btn btn--outline" style={{ height: 32, justifyContent: 'flex-start' }} aria-label="Change icon" id={id}>
          <NodeIcon name={value} size={18} />
          <span className="font-medium">Icon</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="popover" sideOffset={6} align="start" style={{ width: 252 }}>
          <div className="icon-grid" role="group" aria-label="Icons">
            {ICON_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                aria-label={k}
                aria-pressed={k === value}
                onClick={() => {
                  onStart?.()
                  onChange(k)
                  setOpen(false)
                }}
              >
                <NodeIcon name={k} size={20} />
              </button>
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
