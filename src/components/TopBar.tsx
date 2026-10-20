import { useMemo, useRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  CaretDown,
  FileArrowDown,
  FileArrowUp,
  FileText,
  Image as ImageIcon,
  ListBullets,
  Sidebar,
  SidebarSimple,
  TreeStructure,
} from '@phosphor-icons/react'
import { useDwell, type LogoCorner } from '../store'
import { useToast } from '../toast'
import { fmt, summarise, summaryMarkdown } from '../lib/time'
import { downloadText, exportPng, slug } from '../lib/export'
import type { Direction, Mode, ThemePref } from '../types'
import { Segmented, Tip } from './ui'

type Props = {
  railOpen: boolean
  inspectorOpen: boolean
  onToggleRail: () => void
  onToggleInspector: () => void
}

export function TopBar({ railOpen, inspectorOpen, onToggleRail, onToggleInspector }: Props) {
  const title = useDwell((s) => s.title)
  const setTitle = useDwell((s) => s.setTitle)
  const checkpoint = useDwell((s) => s.checkpoint)
  const mode = useDwell((s) => s.mode)
  const setMode = useDwell((s) => s.setMode)
  const theme = useDwell((s) => s.theme)
  const setTheme = useDwell((s) => s.setTheme)
  const logoCorner = useDwell((s) => s.logoCorner)
  const setLogoCorner = useDwell((s) => s.setLogoCorner)
  const nodes = useDwell((s) => s.nodes)
  const runs = useDwell((s) => s.runsPerMonth)
  const rate = useDwell((s) => s.ratePerHour)
  const canUndo = useDwell((s) => s.past.length > 0)
  const canRedo = useDwell((s) => s.redoStack.length > 0)
  const { undo, redo, tidy, newBlank, loadSample, exportDoc, importDoc } = useDwell.getState()
  const toast = useToast((s) => s.show)
  const fileRef = useRef<HTMLInputElement>(null)
  const sum = useMemo(() => summarise(nodes, runs, rate), [nodes, runs, rate])

  const onImport = async (file: File | undefined) => {
    if (!file) return
    const err = importDoc(await file.text())
    toast(err ?? `Opened ${file.name}`)
    if (fileRef.current) fileRef.current.value = ''
  }

  const doPng = async () => {
    try {
      const ok = await exportPng(nodes, mode, title, sum)
      toast(ok ? 'PNG saved' : 'Nothing to export yet')
    } catch {
      toast('The image could not be rendered. Try again after the diagram has settled.')
    }
  }

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summaryMarkdown(title, nodes, sum))
      toast('Summary table copied as Markdown')
    } catch {
      toast('Copy was blocked by the browser')
    }
  }

  return (
    <header className="topbar">
      <div className="brand">
        <button className="btn btn--icon" aria-label="Show catalogue" aria-pressed={railOpen} onClick={onToggleRail}>
          <Sidebar size={18} weight="light" />
        </button>
        <span className="mark" aria-hidden="true">
          <i />
          <i className="hatch" />
        </span>
        <span className="brand__name hide-narrow">Dwell</span>
        <input
          className="title-input hide-narrow"
          value={title}
          aria-label="Diagram title"
          onFocus={checkpoint}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <Segmented<Mode>
        label="Process state"
        large
        value={mode}
        onChange={setMode}
        options={[
          {
            value: 'current',
            ariaLabel: `Current, ${fmt(sum.current)} per run`,
            node: (
              <>
                Current <span className="seg__num">{fmt(sum.current)}</span>
              </>
            ),
          },
          {
            value: 'future',
            ariaLabel: `Future, ${fmt(sum.future)} per run`,
            node: (
              <>
                Future <span className="seg__num">{fmt(sum.future)}</span>
              </>
            ),
          },
        ]}
      />

      <div className="topbar__right">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="btn hide-narrow">
              File
              <CaretDown size={12} weight="light" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="end" sideOffset={6}>
              <DropdownMenu.Item className="menu__item" onSelect={newBlank}>
                <FileText size={16} weight="light" />
                New blank diagram
              </DropdownMenu.Item>
              <DropdownMenu.Item className="menu__item" onSelect={loadSample}>
                <ListBullets size={16} weight="light" />
                Open the alert engagement sample
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="menu__sep" />
              <DropdownMenu.Item className="menu__item" onSelect={() => fileRef.current?.click()}>
                <FileArrowUp size={16} weight="light" />
                Import JSON
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="menu__item"
                onSelect={() => {
                  downloadText(exportDoc(), `${slug(title)}.dwell.json`)
                  toast('Diagram saved as JSON')
                }}
              >
                <FileArrowDown size={16} weight="light" />
                Export JSON
              </DropdownMenu.Item>
              <DropdownMenu.Item className="menu__item" onSelect={doPng}>
                <ImageIcon size={16} weight="light" />
                Export slide PNG (1920 x 1080)
              </DropdownMenu.Item>
              <DropdownMenu.Item className="menu__item" onSelect={copySummary}>
                <ListBullets size={16} weight="light" />
                Copy summary table
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="menu__sep" />
              <DropdownMenu.Label className="menu__label">PagerDuty logo</DropdownMenu.Label>
              <DropdownMenu.RadioGroup value={logoCorner} onValueChange={(v) => setLogoCorner(v as LogoCorner)}>
                {(
                  [
                    ['bl', 'Bottom left'],
                    ['br', 'Bottom right'],
                    ['off', 'Hidden'],
                  ] as [LogoCorner, string][]
                ).map(([v, label]) => (
                  <DropdownMenu.RadioItem key={v} value={v} className="menu__item">
                    <span className="menu__dot" aria-hidden="true">
                      <DropdownMenu.ItemIndicator>
                        <i />
                      </DropdownMenu.ItemIndicator>
                    </span>
                    {label}
                  </DropdownMenu.RadioItem>
                ))}
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="btn hide-narrow">
              <TreeStructure size={16} weight="light" />
              Arrange
              <CaretDown size={12} weight="light" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu" align="end" sideOffset={6}>
              {(
                [
                  ['LR', 'Tidy left to right'],
                  ['TB', 'Tidy top to bottom'],
                ] as [Direction, string][]
              ).map(([dir, label]) => (
                <DropdownMenu.Item key={dir} className="menu__item" onSelect={() => tidy(dir)}>
                  {label}
                  {dir === 'LR' && <kbd>T</kbd>}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <Tip label="Undo">
          <button className="btn btn--icon" aria-label="Undo" disabled={!canUndo} onClick={undo}>
            <ArrowBendUpLeft size={18} weight="light" />
          </button>
        </Tip>
        <Tip label="Redo">
          <button className="btn btn--icon" aria-label="Redo" disabled={!canRedo} onClick={redo}>
            <ArrowBendUpRight size={18} weight="light" />
          </button>
        </Tip>

        <span className="hide-narrow" style={{ marginLeft: 8 }}>
          <Segmented<ThemePref>
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', node: 'Light' },
              { value: 'dark', node: 'Green' },
              { value: 'auto', node: 'Auto' },
            ]}
          />
        </span>

        <button className="btn btn--icon" aria-label="Show inspector" aria-pressed={inspectorOpen} onClick={onToggleInspector}>
          <SidebarSimple size={18} weight="light" />
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
    </header>
  )
}
