# Dwell

Map a process, attach time to every step, and see what automation gives back.

Pick steps from the catalogue on the left (each one carries a time taken now and a time taken after automation), connect them on the canvas, and flip between **Current** and **Future**. In Future, time that automation removes shows as hatched green on each step's time bar, steps it replaces stay on the sheet as struck-through ghosts, and the ledger along the bottom totals the saving per run, per month and per year.

The bundled sample is an alert engagement process: monitors, DXP triage, quick-fix and severity decisions, change approval, stakeholder comms, and a Paige SRE Agent query in the future state. All figures are samples. Edit anything.

## Run it

```bash
npm install
npm run dev        # http://localhost:5817
npm test           # unit tests
npm run build      # typecheck + production build into dist/
```

Docker:

```bash
docker compose up --build   # http://localhost:5817
```

## How it works

- **Catalogue** (left). Signals, steps, decisions, automated steps and outputs, filtered by section: Incident, Monitoring (Datadog, Splunk, Dynatrace, New Relic, Grafana, Prometheus, Elastic, Sentry and more), CI/CD (GitHub Actions, GitLab CI, Jenkins, CircleCI, Argo CD, Terraform, Kubernetes, Helm and pipeline stages) and Other. Items can carry a brand mark; *New catalogue item* lets you add any tool, pick its section and mark. Click an item to chain it from the selected step, or drag it onto the canvas. Dropping or releasing a step near another one joins them automatically (signals always start a flow, outputs end one) and lines it up with its neighbour. Add your own with *New catalogue item*; edits apply to the catalogue, not to steps already on the canvas.
- **Canvas**. Drag from a step's edge handle to another step to connect. Decisions label their first two outgoing connections Yes and No. Hover a step to see its handles.
- **Inspector** (right). Label, tool, icon, minutes now and after, share of runs, which state it appears in, notes. With nothing selected it ranks where the time comes back.
- **Appears in**. *Both*, *Current only* (ghosted in Future) or *Future only* (hidden in Current). The same setting exists on connections so a route can be replaced rather than just removed.
- **Share of runs**. A step that only 40% of incidents reach counts for 40% of its time in the ledger. The ledger reports expected effort per run, not elapsed time, so parallel steps are summed.
- **Benefit comes from**. Mark a step as AI or Automation and Future shows an AI or Auto tag on it, with the overview splitting the saved time between the two. On each step, Current shows what it takes today; Future shows that same figure with what comes off it.
- **Connectors**. Drag either end onto another step to reconnect, pick which side a line leaves and arrives, switch between elbow, curve and straight, or reverse it.
- **Flows**. A flow is a named path of connectors. Select a step and choose From here, To here or Through to trace one, or shift click connectors and save them. Click a flow in the overview to highlight it; everything else dims and the path animates.
- **Time bar**. Length is minutes, scaled to the longest step on the sheet. Solid is time that remains, hatched green is time removed, amber is time added.

## Keys

| Key | Action |
| --- | --- |
| `1` / `2` | Current / Future |
| `T` | Tidy layout |
| `/` | Search the catalogue |
| `Ctrl/Cmd Z`, `Shift Z` | Undo, redo |
| `Ctrl/Cmd D` | Duplicate selection |
| `Del` | Delete selection |

## Files

- Autosaves to `localStorage`. File menu: export and import JSON, export a slide PNG (1920 x 1080: title, diagram, key and logo on the stage background), copy a Markdown summary table, and choose which corner the PagerDuty logo sits in. The logo is pinned to the canvas corner, so it follows when you collapse the catalogue or inspector to give the diagram more room.
- Three themes, designed separately and checked with axe: Dark (neutral graphite sheet, dark glass objects, lime accent), Green (the default: the template's slide 5 near-black to green gradient with waves, translucent white objects with soft shadows, electric lime accent) and Light (light gray sheet, white objects, PD green accent). Auto follows the OS.

## Stack

React, TypeScript, Vite, Tailwind, Radix UI, Framer Motion, `@xyflow/react` for the canvas, `@dagrejs/dagre` for layout, Zustand for state, Phosphor icons. Type is Helvetica Neue with Helvetica and Arial fallbacks, no web fonts to load.
