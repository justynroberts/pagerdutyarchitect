# PagerDuty Architect

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

- **Catalogue** (left). Signals, steps, decisions, automated steps and outputs, filtered by section: Incident, Monitoring (Datadog, Splunk, Dynatrace, New Relic, Grafana, Prometheus, Elastic, Sentry and more), CI/CD (GitHub Actions, GitLab CI, Jenkins, CircleCI, Argo CD, Terraform, Kubernetes, Helm and pipeline stages) and Other. Items can carry a brand mark; *New catalogue item* lets you add any tool, pick its section and mark. Click an item to chain it from the selected step, or drag it onto the canvas. Dropping or releasing a step near another one joins them automatically (signals always start a flow, outputs end one, and two signals or two outputs are never joined) and lines it up with its neighbour. Add your own with *New catalogue item*; edits apply to the catalogue, not to steps already on the canvas.
- **Canvas**. Drag from a step's edge handle to another step to connect. Decisions label their first two outgoing connections Yes and No. Hover a step to see its handles.
- **Inspector** (right). Label, tool, icon, minutes now and after, share of runs, which state it appears in, notes. With nothing selected it ranks where the time comes back. Hidden in Current and open in Future; close or open it in Future and that choice sticks. Clicking a step brings it back in either.
- **Appears in**. *Both*, *Current only* (ghosted in Future) or *Future only* (hidden in Current). The same setting exists on connections so a route can be replaced rather than just removed.
- **Share of runs**. A step that only 40% of incidents reach counts for 40% of its time in the ledger. The ledger reports expected effort per run, not elapsed time, so parallel steps are summed.
- **Benefit comes from**. Mark a step as AI or Automation and Future shows an AI or Auto tag on it, with the overview splitting the saved time between the two. On each step, Current shows what it takes today; Future shows that same figure with what comes off it.
- **Connectors**. Drag either end onto another step to reconnect, pick which side a line leaves and arrives, switch between elbow, curve and straight, or reverse it.
- **Flows**. A flow is a named path of connectors. Select a step and choose From here, To here or Through to trace one, or shift click connectors and save them. Click a flow in the overview to highlight it; everything else dims and the path animates.
- **Coloured flows**. Select several steps (Shift or Ctrl/Cmd click, or Shift drag) and choose Create flow. It takes the connectors running between those steps, draws them as a wide coloured line and adds the flow to the key on the canvas, which also goes on the slide PNG. Pick the colour when creating it or change it from the pencil in the overview. Click a flow in the key to highlight it, or hover it and press the cross to delete it (undo brings it back).
- **Areas and labels**. The two buttons beside the zoom controls add a highlighted area or a text label. Drag an area by its label and resize it from its edges. With steps selected, Highlight with an area draws one around them. Change the text and colour in the inspector.
- **Times on or off**. The timer button by the zoom controls (or `M`) hides step times, time bars and flow durations, so you can present the shape of a process without the figures. The slide PNG follows it. The totals along the top and bottom stay.
- **Ledger** (bottom). Runs a month and cost per hour drive the totals. Click any figure (Current, Future, Saved, Hours back, Value a year) to type over it: minutes as `87`, `1h 27m` or `1.5h`, money as `£500k`. The figures after it follow from yours, the top bar and slide use them too, and the cross puts the calculated value back. Typed-over figures are saved with the diagram.
- **Time bar**. Length is minutes, scaled to the longest step on the sheet. Solid is time that remains, hatched green is time removed, amber is time added.

## Current and Future are separate

Current is the baseline. In Future you can change it without touching Current: a step or connector you add
exists only in Future, one you delete is only removed from Future (it shows ghosted, and stays in Current),
and moving or tidying in Future gives Future its own layout. Times are already separate per step.

## Keys

| Key | Action |
| --- | --- |
| `1` / `2` | Current / Future |
| `T` | Tidy layout |
| `M` | Show or hide times on the diagram (also the timer button by the zoom controls, and Times in Present) |
| `P` | Present: hide the chrome, `Left`/`Right` step through flows, `Space` flips Current/Future, `Esc` exits |
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

PagerDuty Architect ships an MCP server, so Claude (or any MCP client) can create a diagram, tag steps as **AI** or
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
Live sync works with `npm run dev`, `npm run preview`, the Go binary and the Docker image.

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
| `add_catalogue_item`, `remove_catalogue_item` | Your own reusable steps. Saved in `diagrams/catalogue.json`, shared with the app's catalogue both ways |
| `check_diagram` | Loose ends: unconnected steps, one-exit decisions, unlabelled exits, automation steps with no AI/Automation tag, empty flows. The app shows the same list under Checks |
| `export_diagram` | `png` or `svg` slide (1920x1080), `json`, `mermaid` flowchart, or a `markdown` savings table |

Things worth asking for: "Build the release pipeline for our payments service, mark the rollback decision
as automation and the log triage as AI, highlight the happy path in green", or "Export the Future state as a slide".

The PNG export from the MCP server is drawn without a browser, so it is close to the in-app slide but not
pixel identical (no icons). Use File > Export slide PNG in the app when you need the exact one.

## Mac app

Open `PagerDuty-Architect-<version>.dmg` and drag **PagerDuty Architect** to Applications. It is signed and
notarised, so it opens with no warnings. Opening it starts the app and your browser at http://localhost:5817;
it sits in the Dock (click it to reopen the browser) and Quit stops it. Diagrams are kept in
`~/Documents/PagerDuty Architect`, the log is `~/Library/Logs/PagerDuty Architect.log`, and the app menu has
Open in Browser, Show Diagrams Folder and Show Log. For Claude, point the MCP config at the binary inside it:
`"/Applications/PagerDuty Architect.app/Contents/MacOS/dwell"` with args `["mcp"]`.

**Updates.** The app keeps itself up to date with [Sparkle](https://sparkle-project.org): it checks in the
background and offers to install a new version, and the app menu has Check for Updates. It reads
`releases/latest/download/appcast.xml` from this repo, so an update ships when a GitHub release carries both
the disk image and that `appcast.xml`. Updates are signed with an EdDSA key held in the login keychain under
the account `pagerduty-architect`; the app only accepts updates signed with it. Back it up
(`generate_keys --account pagerduty-architect -x <file>`, from Sparkle's `bin/`) and keep the file somewhere safe:
without it, installed copies can't be updated.

`scripts/build-mac.sh` builds it: tests, the universal `dwell`, a small Swift launcher (`mac/Launcher.swift`)
with Sparkle embedded, the icon (`mac/icon.svg`), Developer ID signing, notarisation and stapling of the app and
then the disk image, a Gatekeeper check on a quarantined copy, and a signed `release/appcast.xml`. Without the
certificate it makes an ad-hoc build that only opens on the Mac that built it. It never tags or publishes.
To ship a version: set it in `package.json`, run the script, then
`gh release create v<version> release/PagerDuty-Architect-<version>.dmg release/appcast.xml`.

## One binary (Go)

`scripts/build-go.sh all` builds a single executable per platform in `release/` (about 7 MB, no Node, npm or
Docker needed). It has the web app embedded, serves the diagrams folder with live sync, and includes the MCP
server, so one file does everything above.

```sh
./dwell-darwin-arm64                 # opens http://localhost:5817 in your browser, diagrams in ./diagrams
./dwell-darwin-arm64 mcp             # MCP server on stdio
```

Flags: `--dir` (diagrams folder, or `$DWELL_DIR`; without it `./diagrams`, or `~/Documents/PagerDuty Architect` when the current folder is read-only), `--port`, `--host` (defaults to 127.0.0.1, widen it only on a
network you trust), `--open=false` (skip opening the browser). On macOS, clear the download quarantine once:
`chmod +x dwell-darwin-arm64 && xattr -d com.apple.quarantine dwell-darwin-arm64`.

Connect an MCP client to the binary instead of the Node server:

```json
{ "mcpServers": { "dwell": { "command": "/full/path/to/dwell-darwin-arm64", "args": ["mcp", "--dir", "/full/path/to/diagrams"] } } }
```

Differences from the Node MCP server: `export_diagram` gives `svg`, `json`, `mermaid` and `markdown` (the app's own
Export slide PNG button gives the PNG), and the layout for diagrams built by the AI is a compact layered layout
that is close to, but not identical to, the app's Arrange.

The Go source is in `go/` and uses only the standard library. `go/data` is generated from the TypeScript source
(`scripts/export-go-data.ts`) so the catalogue and sample cannot drift. `cd go && go test ./...` runs its tests.

**Shared catalogue.** Custom steps you add in the app (New catalogue item) are written to
`diagrams/catalogue.json`, and the MCP server reads the same file, so an AI can use your own tools by
`catalogue_id` and anything it adds with `add_catalogue_item` shows up in the app. Built-in steps are not
affected. Open the app once with the folder reachable and any custom steps already in your browser are merged in.

## Docker

The image is the Go binary and nothing else. Diagrams live in a volume, so they survive the container and
the MCP server on the host can edit the same folder:

```sh
docker compose up --build        # http://localhost:5817, diagrams in ./diagrams
```

`nginx.conf` is no longer used by the image.
