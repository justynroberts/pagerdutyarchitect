import { useMemo, useRef } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  CaretDown,
  FileArrowDown,
  FileArrowUp,
  FileText,
  Plugs,
  FolderOpen,
  Image as ImageIcon,
  ListBullets,
  Graph,
  Presentation,
  Sidebar,
  SidebarSimple,
  TreeStructure,
} from '@phosphor-icons/react'
import { useDwell, type LogoCorner } from '../store'
import { useToast } from '../toast'
import { fmt, summarise, summaryMarkdown } from '../lib/time'
import { downloadText, exportPng, slug } from '../lib/export'
import { useSync } from '../lib/sync'
import { toMermaid } from '../lib/mermaid'
import { computeCommercial } from '../lib/commercial'
import { exportValuePng, valueMarkdown } from '../lib/valueSlide'
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
  const view = useDwell((s) => s.view)
  const setView = useDwell((s) => s.setView)
  const theme = useDwell((s) => s.theme)
  const setTheme = useDwell((s) => s.setTheme)
  const logoCorner = useDwell((s) => s.logoCorner)
  const setLogoCorner = useDwell((s) => s.setLogoCorner)
  const nodes = useDwell((s) => s.nodes)
  const runs = useDwell((s) => s.runsPerMonth)
  const rate = useDwell((s) => s.ratePerHour)
  const overrides = useDwell((s) => s.overrides)
  const canUndo = useDwell((s) => s.past.length > 0)
  const canRedo = useDwell((s) => s.redoStack.length > 0)
  const { undo, redo, tidy, newBlank, loadSample, exportDoc, importDoc } = useDwell.getState()
  const toast = useToast((s) => s.show)
  const fileRef = useRef<HTMLInputElement>(null)
  const file = useDwell((s) => s.file)
  const setFile = useDwell((s) => s.setFile)
  const syncState = useSync((s) => s.state)
  const files = useSync((s) => s.files)
  const refreshFiles = useSync((s) => s.refresh)

  const saveToFolder = () => {
    const taken = new Set(files.map((f) => f.name))
    let name = slug(title) || 'diagram'
    if (taken.has(name) && name !== file) {
      let i = 2
      while (taken.has(`${name}-${i}`)) i++
      name = `${name}-${i}`
    }
    setFile(name)
    toast(`Saved as diagrams/${name}.dwell.json. It now updates live from that file.`)
  }
  const sum = useMemo(() => summarise(nodes, runs, rate, overrides), [nodes, runs, rate, overrides])

  const onImport = async (file: File | undefined) => {
    if (!file) return
    const err = importDoc(await file.text())
    toast(err ?? `Opened ${file.name}`)
    if (fileRef.current) fileRef.current.value = ''
  }

  const doPng = async () => {
    try {
      const s = useDwell.getState()
      if (s.view === 'commercial') {
        await exportValuePng(s.commercial, computeCommercial(s.commercial, sum.pct), title)
        return toast('Value Assessment slide saved')
      }
      const { flows, edges } = useDwell.getState()
      const used = flows.filter((f) => edges.some((e) => e.data?.flows?.includes(f.id)))
      const ok = await exportPng(nodes, mode, title, useDwell.getState().showTimes ? sum : undefined, used)
      toast(ok ? 'PNG saved' : 'Nothing to export yet')
    } catch {
      toast('The image could not be rendered. Try again after the diagram has settled.')
    }
  }

  const copySummary = async () => {
    try {
      const s = useDwell.getState()
      if (s.view === 'commercial') {
        await navigator.clipboard.writeText(valueMarkdown(s.commercial, computeCommercial(s.commercial, sum.pct)))
        return toast('Value Assessment copied as Markdown')
      }
      await navigator.clipboard.writeText(summaryMarkdown(title, nodes, sum))
      toast('Summary table copied as Markdown')
    } catch {
      toast('Copy was blocked by the browser')
    }
  }

  const copyMermaid = async () => {
    try {
      const { nodes, edges, flows, direction } = useDwell.getState()
      await navigator.clipboard.writeText(toMermaid({ nodes, edges, flows, direction } as never, mode))
      toast('Mermaid copied. Paste it into GitHub, Notion or a wiki.')
    } catch {
      toast('Copy was blocked by the browser')
    }
  }
  const setPresenting = useDwell((s) => s.setPresenting)

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
        <span className="brand__name hide-narrow">PagerDuty Architect</span>
        <input
          className="title-input hide-narrow"
          value={title}
          aria-label="Diagram title"
          onFocus={checkpoint}
          onChange={(e) => setTitle(e.target.value)}
        />
        {file && (
          <span className={`sync hide-narrow ${syncState === 'live' ? 'is-live' : ''}`} title={syncState === 'live' ? `Following diagrams/${file}.dwell.json. Changes from an AI or an editor appear here, and yours are written back.` : 'The diagrams folder is not reachable from here (run npm run dev).'}>
            <i aria-hidden="true" />
            {syncState === 'live' ? `Live: ${file}` : `Not syncing: ${file}`}
          </span>
        )}
      </div>

      <Segmented<Mode | 'commercial'>
        label="View"
        large
        value={view === 'commercial' ? 'commercial' : mode}
        onChange={(v) => {
          if (v === 'commercial') return setView('commercial')
          setView('diagram')
          setMode(v)
        }}
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
          {
            value: 'commercial',
            node: 'Value Assessment',
          },
        ]}
      />

      <div className="topbar__right">
        <button className="btn hide-narrow" onClick={() => setPresenting(true)} title="Present (P)">
          <Presentation size={16} weight="light" />
          Present
        </button>
        <DropdownMenu.Root modal={false}>
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
              <DropdownMenu.Label className="menu__label">Diagrams folder (for AI and MCP)</DropdownMenu.Label>
              <DropdownMenu.Item className="menu__item" onSelect={saveToFolder}>
                <Plugs size={16} weight="light" />
                {file ? 'Save as a new file and follow it' : 'Save here and follow the file'}
              </DropdownMenu.Item>
              <DropdownMenu.Sub onOpenChange={(o) => o && void refreshFiles()}>
                <DropdownMenu.SubTrigger className="menu__item">
                  <FolderOpen size={16} weight="light" />
                  Open from the folder
                  <CaretDown size={12} weight="light" style={{ marginLeft: 'auto', transform: 'rotate(-90deg)' }} />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className="menu" sideOffset={4}>
                    {files.length === 0 && (
                      <DropdownMenu.Item className="menu__item" disabled>
                        No diagrams found
                      </DropdownMenu.Item>
                    )}
                    {files.map((f) => (
                      <DropdownMenu.Item key={f.name} className="menu__item" onSelect={() => setFile(f.name)}>
                        {f.name}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
              {file && (
                <DropdownMenu.Item className="menu__item" onSelect={() => setFile(null)}>
                  Stop following {file}
                </DropdownMenu.Item>
              )}
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
              <DropdownMenu.Item className="menu__item" onSelect={copyMermaid}>
                <Graph size={16} weight="light" />
                Copy as Mermaid
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

        <DropdownMenu.Root modal={false}>
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
              { value: 'night', node: 'Dark' },
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
