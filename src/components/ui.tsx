import { useEffect, useId, useState, type ReactNode } from 'react'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Popover from '@radix-ui/react-popover'
import clsx from 'clsx'
import { ICON_KEYS, NodeIcon, PdBadge, type IconKey } from '../lib/icons'
import { BRANDS, BRAND_KEYS, type BrandKey } from '../lib/brands'

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

/**
 * Icon or logo for a step. Icons are line drawings; logos are vendor marks (Datadog, Jira...). The PagerDuty
 * switch puts any icon on the PagerDuty tile with its mark, for a PagerDuty capability. Without `onBrand` it
 * offers icons only, as the catalogue dialog keeps its own brand list.
 */
export function IconPicker({
  value,
  onChange,
  onStart,
  brand,
  onBrand,
}: {
  value: IconKey
  onChange: (k: IconKey) => void
  onStart?: () => void
  brand?: BrandKey
  onBrand?: (b: BrandKey | undefined) => void
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'icons' | 'logos'>(brand && brand !== 'pagerduty' ? 'logos' : 'icons')
  const id = useId()
  const pd = brand === 'pagerduty'
  const pick = (fn: () => void) => {
    onStart?.()
    fn()
    setOpen(false)
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="btn btn--outline icon-trigger" aria-label={onBrand ? 'Change icon or logo' : 'Change icon'} id={id}>
          <span className={clsx('icon-trigger__tile', pd && 'is-pd')}>
            <NodeIcon name={value} brand={brand} size={18} />
            {pd && <PdBadge />}
          </span>
          <span className="font-medium">{onBrand ? (brand && !pd ? BRANDS[brand].name : pd ? 'PagerDuty' : 'Icon or logo') : 'Icon'}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="popover icon-pop" sideOffset={6} align="start" style={{ width: 268 }}>
          {onBrand && (
            <div className="icon-pop__tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'icons'} onClick={() => setTab('icons')}>
                Icons
              </button>
              <button type="button" role="tab" aria-selected={tab === 'logos'} onClick={() => setTab('logos')}>
                Logos
              </button>
            </div>
          )}
          {tab === 'icons' || !onBrand ? (
            <div className="icon-grid" role="group" aria-label="Icons">
              {ICON_KEYS.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-label={k}
                  aria-pressed={k === value && (!brand || pd)}
                  onClick={() =>
                    pick(() => {
                      onChange(k)
                      // Choosing an icon means showing it, so a vendor logo gives way; PagerDuty stays.
                      if (onBrand && brand && !pd) onBrand(undefined)
                    })
                  }
                >
                  <NodeIcon name={k} size={20} />
                </button>
              ))}
            </div>
          ) : (
            <div className="icon-grid" role="group" aria-label="Logos">
              <button type="button" aria-label="No logo" aria-pressed={!brand || pd} onClick={() => pick(() => onBrand(pd ? 'pagerduty' : undefined))}>
                <span className="icon-pop__none">None</span>
              </button>
              {BRAND_KEYS.filter((b) => b !== 'pagerduty').map((b) => (
                <button key={b} type="button" aria-label={BRANDS[b].name} title={BRANDS[b].name} aria-pressed={b === brand} onClick={() => pick(() => onBrand(b))}>
                  <NodeIcon name={value} brand={b} size={18} />
                </button>
              ))}
            </div>
          )}
          {onBrand && (
            <label className="icon-pop__pd">
              <input type="checkbox" checked={pd} onChange={(e) => pick(() => onBrand(e.target.checked ? 'pagerduty' : undefined))} />
              <span className="icon-trigger__tile is-pd" aria-hidden="true">
                <NodeIcon name={value} brand="pagerduty" size={14} />
                <PdBadge />
              </span>
              PagerDuty capability
            </label>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
