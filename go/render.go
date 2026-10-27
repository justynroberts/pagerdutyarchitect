package main

import (
	"encoding/base64"
	"fmt"
	"math"
	"strings"
)

// Draws a diagram as a 1920x1080 slide in SVG. Mirrors mcp/render.ts.

const (
	slideW = 1920.0
	slideH = 1080.0
	font   = "'Helvetica Neue', Helvetica, Arial, sans-serif"
)

type pal struct {
	bg, ink, muted, node, line, chip, stroke, logo, saved, added, bar string
	nodeOpacity                                                       float64
}

// outlines for the kinds the app draws as flowchart shapes, in the node's own box; STYLE takes the paint.
var outlines = map[string]string{
	"handoff":    `<polygon points="0,0 184,0 204,28 184,56 0,56 16,28" STYLE/>`,
	"wait":       `<path d="M0 0 H176 A28 28 0 0 1 176 56 H0 Z" STYLE/>`,
	"document":   `<path d="M0 0 H204 V54 C160 66 130 42 92 54 C60 64 30 62 0 54 Z" STYLE/>`,
	"system":     `<path d="M0 9 A102 8.5 0 0 1 204 9 V59 A102 8.5 0 0 1 0 59 Z" STYLE/><path d="M0 9 A102 8.5 0 0 0 204 9" fill="none" stroke="rgba(14,35,29,0.35)"/>`,
	"subprocess": `<rect width="204" height="56" rx="2" STYLE/><path d="M10 0 V56 M194 0 V56" fill="none" stroke="rgba(14,35,29,0.35)"/>`,
}

func palette3(theme string) pal {
	switch theme {
	case "light":
		return pal{"#f3f6f4", "#10231b", "#5a6b63", "#ffffff", "#5a6b63", "#ffffff", "#c9d4cd", "#10231b", "#0a8a3a", "#b45f06", "#10231b", 1}
	case "dark":
		return pal{"#14161a", "#f2f4f3", "#9aa4a0", "#ffffff", "#a9b3af", "#1d2025", "#2e333a", "#f2f4f3", "#7be3a0", "#f5a623", "#ffffff", 0.09}
	}
	return pal{"", "#ffffff", "rgba(255,255,255,0.72)", "#ffffff", "rgba(255,255,255,0.8)", "rgba(8,30,18,0.55)", "rgba(255,255,255,0.25)", "#ffffff", "#0a8a3a", "#b45f06", "#10231b", 0.9}
}

func esc(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;")
	return r.Replace(s)
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return strings.TrimRight(string(r[:n-1]), " ") + "…"
	}
	return s
}

func f1(v float64) string { return fmt.Sprintf("%.1f", v) }

func presenceState(presence, mode string) string {
	if mode == "current" {
		if presence == "future-only" {
			return "hidden"
		}
		return "live"
	}
	if presence == "current-only" {
		return "ghost"
	}
	return "live"
}

func renderSVG(d *Doc, mode, theme string) string {
	if mode == "" {
		mode = firstNonEmpty(d.Mode, "current")
	}
	if theme == "" {
		theme = "green"
	}
	P := palette3(theme)
	nodeInk, nodeMuted := "#10231b", "#5a6b63"
	if theme == "dark" {
		nodeInk, nodeMuted = "#f2f4f3", "#9aa4a0"
	}

	var live []Node
	liveIDs := map[string]bool{}
	byID := map[string]*Node{}
	// Future can have its own layout. Work on a copy so the document is untouched.
	d = d.clone()
	if mode == "future" {
		for i := range d.Nodes {
			if fp := d.Nodes[i].Data.FuturePos; fp != nil {
				d.Nodes[i].Position = *fp
			}
		}
		// Areas have their own Future box once Future has its own layout.
		for i := range d.Zones {
			if f := d.Zones[i].Future; f != nil {
				d.Zones[i].X, d.Zones[i].Y, d.Zones[i].W, d.Zones[i].H = f.X, f.Y, f.W, f.H
			}
		}
	}
	for i := range d.Nodes {
		byID[d.Nodes[i].ID] = &d.Nodes[i]
		if presenceState(d.Nodes[i].Data.Presence, mode) != "hidden" {
			live = append(live, d.Nodes[i])
			liveIDs[d.Nodes[i].ID] = true
		}
	}
	max := longestStep(d.Nodes)

	type box struct{ x, y, w, h float64 }
	var boxes []box
	for _, n := range live {
		dd := dims[n.Data.Kind]
		boxes = append(boxes, box{n.Position.X, n.Position.Y, dd[0], dd[1]})
	}
	for _, z := range d.Zones {
		w, h := z.W, z.H
		if w == 0 {
			w = 160
		}
		if h == 0 {
			h = 36
		}
		boxes = append(boxes, box{z.X, z.Y, w, h})
	}
	const pad = 24.0
	minX, minY, maxX, maxY := 0.0, 0.0, 1.0, 1.0
	for _, b := range boxes {
		minX, minY = math.Min(minX, b.x), math.Min(minY, b.y)
		maxX, maxY = math.Max(maxX, b.x+b.w), math.Max(maxY, b.y+b.h)
	}
	minX, minY, maxX, maxY = minX-pad, minY-pad, maxX+pad, maxY+pad
	ax, ay, aw, ah := 80.0, 176.0, slideW-160, slideH-176-150
	scale := math.Min(math.Min(aw/(maxX-minX), ah/(maxY-minY)), 1.6)
	ox := ax + (aw-(maxX-minX)*scale)/2 - minX*scale
	oy := ay + (ah-(maxY-minY)*scale)/2 - minY*scale

	var o strings.Builder
	w := func(format string, a ...any) { fmt.Fprintf(&o, format+"\n", a...) }
	w(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d" font-family="%s">`, int(slideW), int(slideH), int(slideW), int(slideH), font)
	w(`<defs>`)
	w(`<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#171817"/><stop offset="1" stop-color="#048a24"/></linearGradient>`)
	w(`<filter id="shadow" x="-20%%" y="-30%%" width="140%%" height="190%%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity="0.28"/></filter>`)
	w(`</defs>`)
	fill := P.bg
	if theme == "green" {
		fill = "url(#bg)"
	}
	w(`<rect width="%d" height="%d" fill="%s"/>`, int(slideW), int(slideH), fill)
	if theme == "green" {
		if b, err := dataFS.ReadFile("data/waves.png"); err == nil {
			w(`<image href="data:image/png;base64,%s" x="0" y="0" width="%d" height="%d" preserveAspectRatio="xMidYMid slice" opacity="0.9"/>`, base64.StdEncoding.EncodeToString(b), int(slideW), int(slideH))
		}
	}

	sum := d.summary()
	w(`<text x="80" y="98" font-size="44" font-weight="700" fill="%s">%s</text>`, P.ink, esc(clip(d.Title, 70)))
	sub := d.Subtitle
	if sub == "" {
		if mode == "current" {
			sub = fmt.Sprintf("Today: %s of effort per run", fmtMins(sum.Current))
		} else {
			sub = fmt.Sprintf("After automation: %s per run, %s saved (%d%%)", fmtMins(sum.Future), fmtMins(sum.Saved), int(math.Round(sum.Pct)))
		}
	}
	w(`<text x="80" y="136" font-size="22" fill="%s">%s</text>`, P.muted, esc(sub))
	w(`<g transform="translate(%s %s) scale(%s)">`, f1(ox), f1(oy), strconv3(scale))

	for _, z := range d.Zones {
		if z.Kind == "area" {
			w(`<rect x="%v" y="%v" width="%v" height="%v" rx="10" fill="%s" fill-opacity="0.14" stroke="%s" stroke-width="2" stroke-dasharray="8 6"/>`, z.X, z.Y, z.W, z.H, z.Color, z.Color)
			w("%s", chip(z.X+12, z.Y-1, z.Label, z.Color, 13))
		}
	}

	for _, e := range d.Edges {
		if !liveIDs[e.Source] || !liveIDs[e.Target] {
			continue
		}
		s, t := byID[e.Source], byID[e.Target]
		path := route(s, t, e, mode, d.Direction)
		var fl []Flow
		for _, f := range d.Flows {
			if contains(e.Data.Flows, f.ID) {
				fl = append(fl, f)
			}
		}
		for i, f := range fl {
			w(`<path d="%s" fill="none" stroke="%s" stroke-opacity="0.6" stroke-width="%d" stroke-linecap="round" stroke-linejoin="round"/>`, path.d, f.Color, 7+(len(fl)-i)*5)
		}
		extra := ""
		if mode == "future" && (s.Data.Presence == "current-only" || t.Data.Presence == "current-only") {
			extra = ` stroke-dasharray="5 5" opacity="0.5"`
		}
		w(`<path d="%s" fill="none" stroke="%s" stroke-width="1.8" stroke-linejoin="round"%s/>`, path.d, P.line, extra)
		w(`<path d="%s" fill="%s"/>`, arrow(path.end, path.side), P.line)
		if e.Data.Label != "" {
			w("%s", chipCentre(path.mid.X, path.mid.Y, e.Data.Label, P.chip, P.ink, P.stroke))
		}
	}

	for _, n := range live {
		dt := n.Data
		dd := dims[dt.Kind]
		nw, nh := dd[0], dd[1]
		x, y := n.Position.X, n.Position.Y
		op := 1.0
		if presenceState(dt.Presence, mode) == "ghost" {
			op = 0.42
		}
		w(`<g opacity="%v">`, op)
		edge := "rgba(255,255,255,0.9)"
		if theme == "dark" {
			edge = "rgba(255,255,255,0.22)"
		}
		style := fmt.Sprintf(`fill="%s" fill-opacity="%v" stroke="%s" stroke-width="1" filter="url(#shadow)"`, P.node, P.nodeOpacity, edge)
		switch dt.Kind {
		case "decision":
			w(`<polygon points="%v,%v %v,%v %v,%v %v,%v" %s/>`, x+nw/2, y, x+nw, y+nh/2, x+nw/2, y+nh, x, y+nh/2, style)
		case "input":
			w(`<polygon points="%v,%v %v,%v %v,%v %v,%v %v,%v" %s/>`, x, y, x+nw-20, y, x+nw, y+nh/2, x+nw-20, y+nh, x, y+nh, style)
		case "automation":
			w(`<polygon points="%v,%v %v,%v %v,%v %v,%v %v,%v" %s/>`, x, y, x+nw-16, y, x+nw, y+16, x+nw, y+nh, x, y+nh, style)
		case "handoff", "wait", "document", "system", "subprocess":
			w(`<g transform="translate(%v,%v)">%s</g>`, x, y, strings.ReplaceAll(outlines[dt.Kind], "STYLE", style))
		default:
			w(`<rect x="%v" y="%v" width="%v" height="%v" rx="6" %s/>`, x, y, nw, nh, style)
		}

		type tm struct {
			t, c   string
			strike bool
		}
		var times []tm
		switch {
		case mode == "current":
			times = []tm{{fmtMins(dt.Current), nodeInk, false}}
		case dt.Presence == "future-only":
			times = []tm{{fmtDelta(dt.Future), P.added, false}}
		default:
			delta := dt.Future - dt.Current
			if dt.Presence == "current-only" {
				delta = -dt.Current
			}
			times = []tm{{fmtMins(dt.Current), nodeMuted, true}}
			if math.Abs(delta) > 0.004 {
				c := P.added
				if delta < 0 {
					c = P.saved
				}
				times = append(times, tm{fmtDelta(delta), c, false})
			}
		}
		show := !(dt.Current == 0 && dt.Future == 0)
		if dt.Kind == "decision" {
			w(`<text x="%v" y="%v" font-size="12.5" font-weight="600" fill="%s" text-anchor="middle">%s</text>`, x+nw/2, y+nh/2-2, nodeInk, esc(clip(dt.Label, 18)))
			if show {
				parts := make([]string, len(times))
				for i, q := range times {
					parts[i] = q.t
				}
				w(`<text x="%v" y="%v" font-size="11" fill="%s" text-anchor="middle">%s</text>`, x+nw/2, y+nh/2+14, nodeMuted, esc(strings.Join(parts, " ")))
			}
		} else {
			maxLabel := 27
			hasLever := mode == "future" && dt.Lever != "" && dt.Lever != "none"
			if hasLever {
				maxLabel = 20
			}
			w(`<text x="%v" y="%v" font-size="13" font-weight="600" fill="%s">%s</text>`, x+14, y+21, nodeInk, esc(clip(dt.Label, maxLabel)))
			w(`<text x="%v" y="%v" font-size="10.5" fill="%s">%s</text>`, x+14, y+37, nodeMuted, esc(clip(dt.Tool, 17)))
			if show {
				tx := x + nw - 12
				for i := len(times) - 1; i >= 0; i-- {
					q := times[i]
					dec := ""
					if q.strike {
						dec = ` text-decoration="line-through"`
					}
					w(`<text x="%v" y="%v" font-size="11.5" font-weight="600" fill="%s" text-anchor="end"%s>%s</text>`, tx, y+37, q.c, dec, esc(q.t))
					tx -= float64(len([]rune(q.t)))*6.4 + 8
				}
			}
			if hasLever {
				label, col := "Auto", "#0a8a3a"
				if dt.Lever == "ai" {
					label, col = "AI", "#6d4bd6"
				}
				bw := float64(len(label))*7 + 12
				w(`<rect x="%v" y="%v" width="%v" height="15" rx="7.5" fill="%s"/>`, x+nw-12-bw, y+8, bw, col)
				w(`<text x="%v" y="%v" font-size="9.5" font-weight="700" fill="#fff" text-anchor="middle">%s</text>`, x+nw-12-bw/2, y+19, label)
			}
			bw := nw - 28
			w(`<rect x="%v" y="%v" width="%v" height="3" rx="1.5" fill="%s" fill-opacity="0.12"/>`, x+14, y+nh-9, bw, nodeInk)
			w(`<rect x="%v" y="%v" width="%s" height="3" rx="1.5" fill="%s" fill-opacity="0.75"/>`, x+14, y+nh-9, f1(math.Max(0, stepMins(dt, mode)/max*bw)), P.bar)
		}
		w(`</g>`)
	}
	for _, z := range d.Zones {
		if z.Kind == "label" {
			w("%s", chip(z.X, z.Y, z.Label, z.Color, 14))
		}
	}
	w(`</g>`)

	lw := 150.0
	w(`<svg x="80" y="%v" width="%v" height="%s" viewBox="%s"><path d="%s" fill="%s" fill-rule="evenodd"/></svg>`, slideH-86, lw, f1(lw/meta.LogoRatio), meta.LogoViewBox, meta.LogoPath, P.logo)
	w(`<text x="260" y="%v" font-size="17" fill="%s">%s</text>`, slideH-66, P.muted, esc(fmt.Sprintf("%s now  ·  %s after  ·  %s saved per run  ·  %d h back a month", fmtMins(sum.Current), fmtMins(sum.Future), fmtMins(sum.Saved), int(math.Round(sum.HoursPerMonth)))))
	note := "Showing the process after automation. Struck figures are today."
	if mode == "current" {
		note = "Showing the process as it runs today."
	}
	w(`<text x="260" y="%v" font-size="14" fill="%s">%s</text>`, slideH-42, P.muted, note)

	var used []Flow
	for _, f := range d.Flows {
		for _, e := range d.Edges {
			if contains(e.Data.Flows, f.ID) {
				used = append(used, f)
				break
			}
		}
	}
	if len(used) > 0 {
		rowH, kw := 26.0, 300.0
		kh := float64(len(used))*rowH + 14
		kx, ky := slideW-80-kw, slideH-40-kh
		w(`<rect x="%v" y="%v" width="%v" height="%v" rx="8" fill="%s" stroke="%s"/>`, kx, ky, kw, kh, P.chip, P.stroke)
		for i, f := range used {
			w(`<rect x="%v" y="%v" width="30" height="10" rx="5" fill="%s"/>`, kx+14, ky+12+float64(i)*rowH, f.Color)
			w(`<text x="%v" y="%v" font-size="15" fill="%s">%s</text>`, kx+54, ky+22+float64(i)*rowH, P.ink, esc(clip(f.Name, 30)))
		}
	}
	w(`</svg>`)
	return o.String()
}

func strconv3(v float64) string { return fmt.Sprintf("%.4f", v) }

func chip(x, y float64, text, color string, size float64) string {
	w := float64(len([]rune(text)))*(size*0.6) + 20
	h := size + 12
	return fmt.Sprintf(`<rect x="%v" y="%v" width="%v" height="%v" rx="4" fill="%s"/><text x="%v" y="%v" font-size="%v" font-weight="700" fill="%s">%s</text>`,
		x, y-h/2, w, h, color, x+10, y+size*0.36, size, inkOn(color), esc(text))
}

func chipCentre(cx, cy float64, text, bg, ink, stroke string) string {
	w := float64(len([]rune(text)))*6.4 + 14
	return fmt.Sprintf(`<rect x="%v" y="%v" width="%v" height="18" rx="9" fill="%s" stroke="%s"/><text x="%v" y="%v" font-size="11" font-weight="600" fill="%s" text-anchor="middle">%s</text>`,
		cx-w/2, cy-9, w, bg, stroke, cx, cy+4, ink, esc(text))
}

type routed struct {
	d        string
	end, mid Position
	side     string // the target side it arrives at
}

// bestSides picks the sides a connector leaves and arrives by: across the widest gap between the two
// steps, so it takes the short way with the fewest bends. Same rule as the app.
func bestSides(a, b [4]float64) (string, string) {
	gapX := math.Max(b[0]-(a[0]+a[2]), a[0]-(b[0]+b[2]))
	gapY := math.Max(b[1]-(a[1]+a[3]), a[1]-(b[1]+b[3]))
	if gapX >= gapY {
		if b[0]+b[2]/2 >= a[0]+a[2]/2 {
			return "r", "l"
		}
		return "l", "r"
	}
	if b[1]+b[3]/2 >= a[1]+a[3]/2 {
		return "b", "t"
	}
	return "t", "b"
}

func boxOf(n *Node) [4]float64 {
	d := dims[n.Data.Kind]
	return [4]float64{n.Position.X, n.Position.Y, d[0], d[1]}
}

func anchor(n *Node, side string) Position {
	b := boxOf(n)
	switch side {
	case "l":
		return Position{b[0], b[1] + b[3]/2}
	case "r":
		return Position{b[0] + b[2], b[1] + b[3]/2}
	case "t":
		return Position{b[0] + b[2]/2, b[1]}
	}
	return Position{b[0] + b[2]/2, b[1] + b[3]}
}

func sign(v float64) float64 {
	if v > 0 {
		return 1
	}
	if v < 0 {
		return -1
	}
	return 0
}

// rounded draws a polyline with rounded corners.
func rounded(in []Position) string {
	p := []Position{in[0]}
	for _, q := range in[1:] {
		if math.Hypot(q.X-p[len(p)-1].X, q.Y-p[len(p)-1].Y) > 0.5 {
			p = append(p, q)
		}
	}
	d := fmt.Sprintf("M%v,%v", p[0].X, p[0].Y)
	for i := 1; i < len(p)-1; i++ {
		a, c, b := p[i-1], p[i], p[i+1]
		rr := math.Min(10, math.Min(math.Hypot(c.X-a.X, c.Y-a.Y)/2, math.Hypot(b.X-c.X, b.Y-c.Y)/2))
		d += fmt.Sprintf(" L%v,%v Q%v,%v %v,%v", c.X+sign(a.X-c.X)*rr, c.Y+sign(a.Y-c.Y)*rr, c.X, c.Y, c.X+sign(b.X-c.X)*rr, c.Y+sign(b.Y-c.Y)*rr)
	}
	z := p[len(p)-1]
	return d + fmt.Sprintf(" L%v,%v", z.X, z.Y)
}

// route follows the layout's lane while both steps stay put; otherwise the sides picked by hand when pinned,
// otherwise the closest ones. Same as the app.
func route(s, t *Node, e Edge, mode, dir string) routed {
	if lane := liveLane(e, mode, s.Position, t.Position); lane != nil {
		sh, th := handlesFor(dir)
		pts := laneRoute(anchor(s, sh), anchor(t, th), lane, dir)
		return routed{rounded(pts), pts[len(pts)-1], routeMiddle(pts), th}
	}
	from, to := bestSides(boxOf(s), boxOf(t))
	if e.Data.Pinned && e.SourceHandle != "" && e.TargetHandle != "" {
		from, to = e.SourceHandle, e.TargetHandle
	}
	a, b := anchor(s, from), anchor(t, to)
	across := func(x string) bool { return x == "l" || x == "r" }
	// A few pixels off level: start level with the target rather than draw a tiny kink, as the app does.
	if across(from) && across(to) && math.Abs(a.Y-b.Y) <= 12 {
		a.Y = b.Y
	} else if !across(from) && !across(to) && math.Abs(a.X-b.X) <= 12 {
		a.X = b.X
	}
	var pts []Position
	switch {
	case across(from) && across(to):
		mx := (a.X + b.X) / 2
		pts = []Position{a, {mx, a.Y}, {mx, b.Y}, b}
	case !across(from) && !across(to):
		my := (a.Y + b.Y) / 2
		pts = []Position{a, {a.X, my}, {b.X, my}, b}
	case across(from):
		pts = []Position{a, {b.X, a.Y}, b}
	default:
		pts = []Position{a, {a.X, b.Y}, b}
	}
	m := (len(pts) - 1) / 2
	return routed{rounded(pts), b, Position{(pts[m].X + pts[m+1].X) / 2, (pts[m].Y + pts[m+1].Y) / 2}, to}
}

// laneRoute runs out of the source, across to the lane, along it past the steps in between, and in.
func laneRoute(s, t Position, lane [][2]float64, dir string) []Position {
	avg := func(i int) float64 {
		sum := 0.0
		for _, p := range lane {
			sum += p[i]
		}
		return sum / float64(len(lane))
	}
	if dir == "LR" {
		y := avg(1)
		x1 := (s.X + lane[0][0]) / 2
		x2 := (lane[len(lane)-1][0] + t.X) / 2
		return []Position{s, {x1, s.Y}, {x1, y}, {x2, y}, {x2, t.Y}, t}
	}
	x := avg(0)
	y1 := (s.Y + lane[0][1]) / 2
	y2 := (lane[len(lane)-1][1] + t.Y) / 2
	return []Position{s, {s.X, y1}, {x, y1}, {x, y2}, {t.X, y2}, t}
}

// routeMiddle is the middle of a route's longest stretch, where its label sits.
func routeMiddle(p []Position) Position {
	best := 0.0
	at := Position{(p[0].X + p[len(p)-1].X) / 2, (p[0].Y + p[len(p)-1].Y) / 2}
	for i := 1; i < len(p); i++ {
		if l := math.Hypot(p[i].X-p[i-1].X, p[i].Y-p[i-1].Y); l > best {
			best = l
			at = Position{(p[i].X + p[i-1].X) / 2, (p[i].Y + p[i-1].Y) / 2}
		}
	}
	return at
}

// arrow points into the target, its tip on the side the connector arrives at.
func arrow(p Position, side string) string {
	switch side {
	case "l":
		return fmt.Sprintf("M%v,%v l-8,-4.5 v9 z", p.X, p.Y)
	case "r":
		return fmt.Sprintf("M%v,%v l8,-4.5 v9 z", p.X, p.Y)
	case "t":
		return fmt.Sprintf("M%v,%v l-4.5,-8 h9 z", p.X, p.Y)
	}
	return fmt.Sprintf("M%v,%v l-4.5,8 h9 z", p.X, p.Y)
}
