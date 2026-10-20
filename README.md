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
- **Coloured flows**. Select several steps (Shift or Ctrl/Cmd click, or Shift drag) and choose Create flow. It takes the connectors running between those steps, draws them as a wide coloured line and adds the flow to the key on the canvas, which also goes on the slide PNG. Pick the colour when creating it or change it from the pencil in the overview. Click a flow in the key to highlight it.
- **Areas and labels**. The two buttons beside the zoom controls add a highlighted area or a text label. Drag an area by its label and resize it from its edges. With steps selected, Highlight with an area draws one around them. Change the text and colour in the inspector.
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

## Let an AI build and edit diagrams (MCP)

Dwell ships an MCP server, so Claude (or any MCP client) can create a diagram, tag steps as **AI** or
**Automation**, group steps into coloured flows, add areas and export slides. Diagrams are plain files in
`diagrams/` (set `DWELL_DIR` to move them). The app follows the file live, in both directions.

**Connect it**

- Claude Code: the repo already has `.mcp.json`. Open the project and approve the `dwell` server.
- Claude Desktop: add this to `claude_desktop_config.json`, with your real path:

```json
{
  "mcpServers": {
    "dwell": {
      "command": "npx",
      "args": ["tsx", "mcp/server.ts"],
      "cwd": "/Users/you/work/dwell/dwell"
    }
  }
}
```

**See it live**: run `npm run dev`, then File > "Save here and follow the file" (or "Open from the folder",
for example `alert-engagement`). A green "Live" chip appears by the title. Anything the AI writes shows up
on the canvas within a moment, and what you change on the canvas is written back. Undo reverts an AI change.
Live sync needs the dev or preview server. The Docker image is static, so it only reads and writes JSON by hand.

**Tools**

| Tool | What it does |
| --- | --- |
| `list_catalogue` | Ready-made steps with times: incident handling, monitoring tools, CI/CD stages |
| `build_diagram` | Whole diagram in one call: steps, connections, flows, areas, laid out |
| `create_diagram`, `list_diagrams`, `get_diagram`, `delete_diagram` | Manage files, read back steps, times, flows and totals |
| `add_step`, `update_step`, `remove_step` | Edit steps. `lever` is `ai`, `automation` or `none` |
| `set_lever` | Tag several steps as AI or Automation in one go |
| `connect`, `disconnect`, `update_connector` | Connectors, labels (Yes/No on decisions), line style |
| `create_flow`, `update_flow`, `delete_flow` | Named coloured flows that go in the legend |
| `add_area`, `remove_area` | Highlighted areas and labels |
| `auto_layout`, `set_details` | Re-layout, title, subtitle, runs per month, hourly cost |
| `export_diagram` | `png` or `svg` slide (1920x1080), `json`, or a `markdown` savings table |

Things worth asking for: "Build the release pipeline for our payments service, mark the rollback decision
as automation and the log triage as AI, highlight the happy path in green", or "Export the Future state as a slide".

The PNG export from the MCP server is drawn without a browser, so it is close to the in-app slide but not
pixel identical (no icons). Use File > Export slide PNG in the app when you need the exact one.

## One binary (Go)

`scripts/build-go.sh all` builds a single executable per platform in `release/` (about 7 MB, no Node, npm or
Docker needed). It has the web app embedded, serves the diagrams folder with live sync, and includes the MCP
server, so one file does everything above.

```sh
./dwell-darwin-arm64 --open          # app at http://localhost:5817, diagrams in ./diagrams
./dwell-darwin-arm64 mcp             # MCP server on stdio
```

Flags: `--dir` (diagrams folder, or `$DWELL_DIR`), `--port`, `--host` (defaults to 127.0.0.1, widen it only on a
network you trust), `--open`. On macOS, clear the download quarantine once:
`chmod +x dwell-darwin-arm64 && xattr -d com.apple.quarantine dwell-darwin-arm64`.

Connect an MCP client to the binary instead of the Node server:

```json
{ "mcpServers": { "dwell": { "command": "/full/path/to/dwell-darwin-arm64", "args": ["mcp", "--dir", "/full/path/to/diagrams"] } } }
```

Differences from the Node MCP server: `export_diagram` gives `svg`, `json` and `markdown` (the app's own
Export slide PNG button gives the PNG), and the layout for diagrams built by the AI is a compact layered layout
that is close to, but not identical to, the app's Arrange.

The Go source is in `go/` and uses only the standard library. `go/data` is generated from the TypeScript source
(`scripts/export-go-data.ts`) so the catalogue and sample cannot drift. `cd go && go test ./...` runs its tests.
