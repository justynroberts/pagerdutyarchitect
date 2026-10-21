import { useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { useDwell } from './store'
import { useToast } from './toast'
import { applyTheme } from './lib/theme'
import { startSync } from './lib/sync'
import { TopBar } from './components/TopBar'
import { Catalogue } from './components/Catalogue'
import { Canvas } from './components/Canvas'
import { Inspector } from './components/Inspector'
import { Ledger } from './components/Ledger'
import { Commercial } from './components/Commercial'

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

// The inspector is for Future-state work, so it stays out of the way in Current. In Future it opens
// unless it was closed there by hand, and that choice is remembered.
const FUTURE_INSPECTOR = 'dwell:future-inspector'

function futureInspectorPref(): boolean {
  try {
    return localStorage.getItem(FUTURE_INSPECTOR) !== 'closed'
  } catch {
    return true
  }
}

function rememberFutureInspector(open: boolean) {
  try {
    localStorage.setItem(FUTURE_INSPECTOR, open ? 'open' : 'closed')
  } catch {
    // Private windows and blocked storage: the choice just lasts for this session.
  }
}

function Toast() {
  const message = useToast((s) => s.message)
  if (!message) return null
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 68,
        transform: 'translateX(-50%)',
        zIndex: 90,
        padding: '8px 14px',
        borderRadius: 3,
        background: 'var(--ink)',
        color: 'var(--bg)',
        fontSize: 13,
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      {message}
    </div>
  )
}

export default function App() {
  const theme = useDwell((s) => s.theme)
  // Wide screens collapse the panels in place; narrow ones slide them over the canvas.
  const presenting = useDwell((s) => s.presenting)
  const showTimes = useDwell((s) => s.showTimes)
  const view = useDwell((s) => s.view)
  const [rail, setRail] = useState(false)
  const [inspector, setInspector] = useState(false)
  const [railHidden, setRailHidden] = useState(false)
  const [inspHidden, setInspHidden] = useState(true)
  const mode = useDwell((s) => s.mode)
  const refit = useDwell((s) => s.refit)
  const wide = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches

  // Clicking something on the canvas is a request to edit it, so bring the inspector back.
  useEffect(() => startSync(), [])

  useEffect(() => {
    const open = () => setInspHidden(false)
    window.addEventListener('dwell:inspect', open)
    return () => window.removeEventListener('dwell:inspect', open)
  }, [])

  useEffect(() => {
    setInspHidden(mode === 'current' || !futureInspectorPref())
    if (mode === 'current') setInspector(false)
    setTimeout(useDwell.getState().refit, 60)
  }, [mode])

  // Follow the OS while the preference is Auto.
  useEffect(() => {
    applyTheme(theme, false)
    if (theme !== 'auto') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('auto', false)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const s = useDwell.getState()
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        e.shiftKey ? s.redo() : s.undo()
      } else if (mod && k === 'y') {
        e.preventDefault()
        s.redo()
      } else if (mod && k === 'd') {
        e.preventDefault()
        s.duplicateSelected()
      } else if (!mod && !e.altKey) {
        if (k === '1') (s.setView('diagram'), s.setMode('current'))
        else if (k === '2') (s.setView('diagram'), s.setMode('future'))
        else if (k === '3') s.setView('commercial')
        else if (k === 't') s.tidy()
        else if (k === 'p') s.setPresenting(!s.presenting)
        else if (k === 'm') s.setShowTimes(!s.showTimes)
        else if (k === '/') {
          e.preventDefault()
          document.getElementById('catalogue-search')?.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Tooltip.Provider>
      <ReactFlowProvider>
        <div className="app" data-rail-hidden={railHidden} data-insp-hidden={inspHidden} data-present={presenting} data-times={showTimes ? 'on' : 'off'} data-view={view}>
          <TopBar
            railOpen={wide('(min-width: 760px)') ? !railHidden : rail}
            inspectorOpen={wide('(min-width: 1100px)') ? !inspHidden : inspector}
            onToggleRail={() => {
              if (wide('(min-width: 760px)')) {
                setRailHidden((v) => !v)
                setTimeout(refit, 60)
              } else {
                setRail((v) => !v)
                setInspector(false)
              }
            }}
            onToggleInspector={() => {
              if (wide('(min-width: 1100px)')) {
                const hidden = !inspHidden
                setInspHidden(hidden)
                if (mode === 'future') rememberFutureInspector(!hidden)
                setTimeout(refit, 60)
              } else {
                setInspector((v) => !v)
                setRail(false)
              }
            }}
          />
          <Catalogue open={rail} />
          {view === 'commercial' ? <Commercial /> : <Canvas />}
          <Inspector open={inspector} />
          <Ledger />
        </div>
        <Toast />
      </ReactFlowProvider>
    </Tooltip.Provider>
  )
}
