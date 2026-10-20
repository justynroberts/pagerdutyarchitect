import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { CatalogItem, Category, Kind, Lever, Presence } from '../types'
import { CATEGORIES, KIND_LABEL, KIND_ORDER } from '../types'
import { BRANDS, BRAND_KEYS, type BrandKey } from '../lib/brands'
import { useDwell } from '../store'
import { Field, IconPicker, NumberInput, Segmented } from './ui'

const blank = (): CatalogItem => ({
  id: `c-${Math.random().toString(36).slice(2, 8)}`,
  kind: 'step',
  label: '',
  tool: '',
  icon: 'gear',
  category: 'Other',
  current: 10,
  future: 2,
  presence: 'both',
})

export function ItemDialog({ item, onClose }: { item: CatalogItem | 'new'; onClose: () => void }) {
  const isNew = item === 'new'
  const [draft, setDraft] = useState<CatalogItem>(() => (item === 'new' ? blank() : item))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [touched, setTouched] = useState(false)
  const saveItem = useDwell((s) => s.saveItem)
  const deleteItem = useDwell((s) => s.deleteItem)
  const patch = (p: Partial<CatalogItem>) => setDraft((d) => ({ ...d, ...p }))
  const labelMissing = touched && draft.label.trim() === ''

  const save = () => {
    setTouched(true)
    if (draft.label.trim() === '') return
    saveItem({ ...draft, label: draft.label.trim(), tool: draft.tool.trim() })
    onClose()
  }

  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content
          className="dialog"
          aria-describedby={undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
              e.preventDefault()
              save()
            }
          }}
        >
          <Dialog.Title className="dialog__title">{isNew ? 'New catalogue item' : 'Edit catalogue item'}</Dialog.Title>
          <div className="grid gap-4">
            <Field label="Name" htmlFor="ci-name">
              <input
                id="ci-name"
                className="input"
                value={draft.label}
                autoFocus
                aria-invalid={labelMissing}
                onChange={(e) => patch({ label: e.target.value })}
                placeholder="Raise change ticket"
              />
              {labelMissing && <span className="text-[12px] text-danger">Give it a name so you can find it later.</span>}
            </Field>
            <Field label="Tool or system" htmlFor="ci-tool">
              <input
                id="ci-tool"
                className="input"
                value={draft.tool}
                onChange={(e) => patch({ tool: e.target.value })}
                placeholder="ServiceNow"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kind" htmlFor="ci-kind">
                <select
                  id="ci-kind"
                  className="select"
                  value={draft.kind}
                  onChange={(e) => {
                    const kind = e.target.value as Kind
                    patch(kind === 'automation' && draft.presence === 'both' ? { kind, presence: 'future-only', current: 0 } : { kind })
                  }}
                >
                  {KIND_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Icon">
                <IconPicker value={draft.icon} onChange={(icon) => patch({ icon })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Section" htmlFor="ci-cat">
                <select
                  id="ci-cat"
                  className="select"
                  value={draft.category ?? 'Incident'}
                  onChange={(e) => patch({ category: e.target.value as Category })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Brand mark" htmlFor="ci-brand">
                <select
                  id="ci-brand"
                  className="select"
                  value={draft.brand ?? ''}
                  onChange={(e) => patch({ brand: (e.target.value || undefined) as BrandKey | undefined })}
                >
                  <option value="">Use the icon</option>
                  {BRAND_KEYS.map((b) => (
                    <option key={b} value={b}>
                      {BRANDS[b].name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Takes now (minutes)" htmlFor="ci-now">
                <NumberInput id="ci-now" value={draft.current} onValue={(current) => patch({ current })} />
              </Field>
              <Field label="Takes after (minutes)" htmlFor="ci-after">
                <NumberInput id="ci-after" value={draft.future} onValue={(future) => patch({ future })} />
              </Field>
            </div>
            {draft.kind !== 'input' && draft.kind !== 'output' && (
              <Field label="Benefit comes from">
                <Segmented<Lever>
                  label="Benefit comes from"
                  fill
                  value={draft.lever ?? 'none'}
                  onChange={(lever) => patch({ lever })}
                  options={[
                    { value: 'none', node: 'Not set' },
                    { value: 'ai', node: 'AI' },
                    { value: 'automation', node: 'Automation' },
                  ]}
                />
              </Field>
            )}
            <Field label="Appears in">
              <Segmented<Presence>
                label="Appears in"
                fill
                value={draft.presence}
                onChange={(presence) => patch({ presence })}
                options={[
                  { value: 'both', node: 'Both' },
                  { value: 'current-only', node: 'Current' },
                  { value: 'future-only', node: 'Future' },
                ]}
              />
            </Field>
          </div>
          <div className="mt-6 flex items-center justify-between gap-2">
            <div>
              {!isNew && (
                <button
                  className="btn btn--danger"
                  onClick={() => {
                    if (!confirmDelete) return setConfirmDelete(true)
                    deleteItem((item as CatalogItem).id)
                    onClose()
                  }}
                >
                  {confirmDelete ? 'Confirm delete' : 'Delete item'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn btn--outline" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn--primary" onClick={() => (setTouched(true), save())}>
                {isNew ? 'Add to catalogue' : 'Save item'}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
