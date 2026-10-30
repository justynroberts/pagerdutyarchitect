package main

import (
	"math"
	"sort"
)

// A layered layout, the same rules as the app's: each state laid out on its own, rank by longest path,
// a placeholder in every column a connector skips (so it gets a lane and takes part in cutting crossings),
// order each column by neighbour averages, then settle steps so connectors run as straight as the spacing
// allows. Connectors that skip columns keep their lane, which the renderer follows.

// Lane is where a connector runs between the steps it skips: where both steps sat, and the waypoints.
type Lane struct {
	At  [4]float64   `json:"at"`
	Pts [][2]float64 `json:"pts"`
}

type Lanes struct {
	Current *Lane `json:"current,omitempty"`
	Future  *Lane `json:"future,omitempty"`
}

type gEdge struct {
	from, to string
	edge     int // index into Doc.Edges; -1 for a bridge, which shapes the layout but is never drawn
}

// visibleIn is what a state shows: Current hides Future-only steps; Future shows everything, removed steps
// ghosted with the lines to them. Steps a state hides are bridged so the ones after them keep their place.
func visibleIn(d *Doc, mode string) (map[string]bool, []gEdge) {
	ids := map[string]bool{}
	pres := map[string]string{}
	for _, n := range d.Nodes {
		pres[n.ID] = n.Data.Presence
		if presenceState(n.Data.Presence, mode, d.HideRemoved) != "hidden" {
			ids[n.ID] = true
		}
	}
	var es, bridges []gEdge
	out := map[string][]string{}
	for i, e := range d.Edges {
		out[e.Source] = append(out[e.Source], e.Target)
		if !ids[e.Source] || !ids[e.Target] || e.Source == e.Target {
			continue
		}
		p := e.Data.Presence
		if p == "" {
			p = "both"
		}
		if mode == "current" && p == "future-only" {
			continue
		}
		if mode == "future" && p == "current-only" && pres[e.Source] != "current-only" && pres[e.Target] != "current-only" {
			continue
		}
		es = append(es, gEdge{e.Source, e.Target, i})
	}
	for _, n := range d.Nodes {
		u := n.ID
		if !ids[u] {
			continue
		}
		seen := map[string]bool{}
		var queue []string
		for _, w := range out[u] {
			if !ids[w] {
				queue = append(queue, w)
			}
		}
		for len(queue) > 0 {
			w := queue[0]
			queue = queue[1:]
			if seen[w] {
				continue
			}
			seen[w] = true
			for _, x := range out[w] {
				if !ids[x] {
					queue = append(queue, x)
				} else if x != u {
					bridges = append(bridges, gEdge{u, x, -1})
				}
			}
		}
	}
	// A step with a line of its own leading in keeps its place from that; a bridge alongside would be a phantom link
	// holding the layout to the other state's shape. Keep bridges only for steps that would otherwise have none.
	fed := map[string]bool{}
	for _, e := range es {
		fed[e.to] = true
	}
	for _, b := range bridges {
		if !fed[b.to] {
			es = append(es, b)
		}
	}
	return ids, es
}

// layOut places the given steps. It returns top-left positions and, per edge index, the lane points.
func layOut(d *Doc, ids map[string]bool, es []gEdge) (map[string]Position, map[int][][2]float64) {
	horizontal := d.Direction == "LR"
	var order []string // input order is the tiebreak, so diagrams are stable
	for _, n := range d.Nodes {
		if ids[n.ID] {
			order = append(order, n.ID)
		}
	}
	n := len(order)
	if n == 0 {
		return map[string]Position{}, map[int][][2]float64{}
	}
	idx := map[string]int{}
	kind := make([]string, 0, n)
	for i, id := range order {
		idx[id] = i
	}
	for _, nd := range d.Nodes {
		if ids[nd.ID] {
			kind = append(kind, nd.Data.Kind)
		}
	}

	// Break cycles: depth-first, ignore edges that point back up the current path.
	out := make([][]int, n)
	for _, e := range es {
		out[idx[e.from]] = append(out[idx[e.from]], idx[e.to])
	}
	in0 := make([]int, n)
	for _, e := range es {
		in0[idx[e.to]]++
	}
	state := make([]int, n)
	back := map[[2]int]bool{}
	var dfs func(v int)
	dfs = func(v int) {
		state[v] = 1
		for _, w := range out[v] {
			if state[w] == 1 {
				back[[2]int{v, w}] = true
			} else if state[w] == 0 {
				dfs(w)
			}
		}
		state[v] = 2
	}
	for v := 0; v < n; v++ {
		if state[v] == 0 && in0[v] == 0 {
			dfs(v)
		}
	}
	for v := 0; v < n; v++ {
		if state[v] == 0 {
			dfs(v)
		}
	}

	// Longest-path ranks over forward edges.
	type fe struct{ a, b, edge int }
	var fwd []fe
	seenPair := map[[2]int]bool{}
	for _, e := range es {
		a, b := idx[e.from], idx[e.to]
		if back[[2]int{a, b}] || seenPair[[2]int{a, b}] {
			continue
		}
		seenPair[[2]int{a, b}] = true
		fwd = append(fwd, fe{a, b, e.edge})
	}
	rank := make([]int, n)
	indeg := make([]int, n)
	succ := make([][]int, n)
	for _, e := range fwd {
		indeg[e.b]++
		succ[e.a] = append(succ[e.a], e.b)
	}
	var queue []int
	for v := 0; v < n; v++ {
		if indeg[v] == 0 {
			queue = append(queue, v)
		}
	}
	for len(queue) > 0 {
		v := queue[0]
		queue = queue[1:]
		for _, w := range succ[v] {
			if rank[v]+1 > rank[w] {
				rank[w] = rank[v] + 1
			}
			indeg[w]--
			if indeg[w] == 0 {
				queue = append(queue, w)
			}
		}
	}

	// Vertices: the steps, then a placeholder in each column a connector skips.
	total := n
	vRank := append([]int{}, rank...)
	var vIn, vOut [][]int
	vIn = make([][]int, n)
	vOut = make([][]int, n)
	chains := map[int][]int{} // edge index -> its placeholders, in order
	link := func(a, b int) {
		vOut[a] = append(vOut[a], b)
		vIn[b] = append(vIn[b], a)
	}
	for _, e := range fwd {
		prev := e.a
		for r := rank[e.a] + 1; r < rank[e.b]; r++ {
			v := total
			total++
			vRank = append(vRank, r)
			vIn = append(vIn, nil)
			vOut = append(vOut, nil)
			link(prev, v)
			if e.edge >= 0 {
				chains[e.edge] = append(chains[e.edge], v)
			}
			prev = v
		}
		link(prev, e.b)
	}
	maxRank := 0
	for _, r := range vRank {
		if r > maxRank {
			maxRank = r
		}
	}
	layers := make([][]int, maxRank+1)
	for v := 0; v < total; v++ {
		layers[vRank[v]] = append(layers[vRank[v]], v)
	}

	// Order within layers: sweep with neighbour averages, keeping input order as the tiebreak.
	pos := make([]float64, total)
	for _, l := range layers {
		for i, v := range l {
			pos[v] = float64(i)
		}
	}
	bary := func(v int, nbrs []int) float64 {
		if len(nbrs) == 0 {
			return pos[v]
		}
		s := 0.0
		for _, w := range nbrs {
			s += pos[w]
		}
		return s / float64(len(nbrs))
	}
	for pass := 0; pass < 8; pass++ {
		if pass%2 == 0 {
			for r := 1; r <= maxRank; r++ {
				orderLayer(layers[r], pos, func(v int) float64 { return bary(v, vIn[v]) })
			}
		} else {
			for r := maxRank - 1; r >= 0; r-- {
				orderLayer(layers[r], pos, func(v int) float64 { return bary(v, vOut[v]) })
			}
		}
	}

	// Sizes along and across the flow; a placeholder is a thin lane.
	size := func(v int) (along, across float64) {
		if v >= n {
			return 0, 8
		}
		dd := dims[kind[v]]
		if horizontal {
			return dd[0], dd[1]
		}
		return dd[1], dd[0]
	}
	nodesep, ranksep := 28.0, 64.0
	if !horizontal {
		nodesep = 40
	}
	gap := func(a, b int) float64 {
		if a >= n && b >= n {
			return 16 // lanes side by side need less room than steps
		}
		return nodesep
	}

	// Position along the flow: each layer starts after the widest step of the one before.
	alongAt := make([]float64, maxRank+1)
	layerW := make([]float64, maxRank+1)
	cursor := 0.0
	for r, l := range layers {
		alongAt[r] = cursor
		for _, v := range l {
			a, _ := size(v)
			layerW[r] = math.Max(layerW[r], a)
		}
		cursor += layerW[r] + ranksep
	}

	// Position across the flow: start stacked, then pull each vertex toward its neighbours and push apart overlaps.
	centre := make([]float64, total)
	for _, l := range layers {
		y := 0.0
		for i, v := range l {
			_, c := size(v)
			if i > 0 {
				y += gap(l[i-1], v)
			}
			centre[v] = y + c/2
			y += c
		}
	}
	settle := func(l []int, want func(v int) (float64, bool)) {
		des := make([]float64, len(l))
		for i, v := range l {
			if w, ok := want(v); ok {
				des[i] = w
			} else {
				des[i] = centre[v]
			}
		}
		cur := append([]float64{}, des...)
		minGap := func(i int) float64 {
			_, c0 := size(l[i-1])
			_, c1 := size(l[i])
			return c0/2 + c1/2 + gap(l[i-1], l[i])
		}
		for i := 1; i < len(l); i++ {
			if cur[i] < cur[i-1]+minGap(i) {
				cur[i] = cur[i-1] + minGap(i)
			}
		}
		// Shift the whole run back so it stays centred on what the vertices asked for.
		shift := 0.0
		for i := range l {
			shift += cur[i] - des[i]
		}
		shift /= float64(len(l))
		for i, v := range l {
			centre[v] = cur[i] - shift
		}
		for i := 1; i < len(l); i++ {
			if centre[l[i]] < centre[l[i-1]]+minGap(i) {
				centre[l[i]] = centre[l[i-1]] + minGap(i)
			}
		}
	}
	meanOf := func(nbrs []int) (float64, bool) {
		if len(nbrs) == 0 {
			return 0, false
		}
		s := 0.0
		for _, w := range nbrs {
			s += centre[w]
		}
		return s / float64(len(nbrs)), true
	}
	for pass := 0; pass < 10; pass++ {
		if pass%2 == 0 {
			for r := 1; r <= maxRank; r++ {
				settle(layers[r], func(v int) (float64, bool) { return meanOf(vIn[v]) })
			}
		} else {
			for r := maxRank - 1; r >= 0; r-- {
				settle(layers[r], func(v int) (float64, bool) { return meanOf(vOut[v]) })
			}
		}
	}

	// Straighten chains: a step moves level with the step feeding it from the nearest column, when that one leads
	// only here and nothing else in the column is in the way. Taken column by column, so a whole chain lines up.
	inR := make([][]int, n)
	outR := make([][]int, n)
	for _, e := range fwd {
		inR[e.b] = append(inR[e.b], e.a)
		outR[e.a] = append(outR[e.a], e.b)
	}
	// How much of the process leads to each step: the main line has the longest history behind it.
	history := make([]int, n)
	for r := 1; r <= maxRank; r++ {
		for _, v := range layers[r] {
			if v < n {
				for _, w := range inR[v] {
					if history[w]+1 > history[v] {
						history[v] = history[w] + 1
					}
				}
			}
		}
	}
	// fits reports whether step v can sit at this cross position without crowding another in its column.
	fits := func(v int, at float64, ignore map[int]bool) bool {
		_, cv := size(v)
		for _, o := range layers[rank[v]] {
			if o == v || ignore[o] {
				continue
			}
			_, co := size(o)
			if math.Abs(centre[o]-at) < cv/2+co/2+gap(o, v) {
				return false
			}
		}
		return true
	}
	for r := 0; r <= maxRank; r++ {
		for _, v := range layers[r] {
			if v >= n {
				continue
			}
			if len(inR[v]) > 0 {
				// Feeding steps nearest first; in the same column, the one with the longest history (the main line).
				u, ties := inR[v][0], 0
				for _, w := range inR[v][1:] {
					if rank[w] > rank[u] || rank[w] == rank[u] && history[w] > history[u] {
						u, ties = w, 0
					} else if rank[w] == rank[u] && history[w] == history[u] {
						ties++
					}
				}
				if ties == 0 && len(outR[u]) == 1 && centre[u] != centre[v] && fits(v, centre[u], nil) {
					centre[v] = centre[u]
				}
			}
			// A branch: the steps only this one leads to, in the next column, stack tightly around it instead of
			// spreading wherever the layout left them. Their own chains then follow them.
			var kids []int
			col := -1
			for _, k := range outR[v] {
				if len(inR[k]) == 1 && (col < 0 || rank[k] < col) {
					col = rank[k]
				}
			}
			for _, k := range outR[v] {
				if len(inR[k]) == 1 && rank[k] == col {
					kids = append(kids, k)
				}
			}
			if len(kids) < 2 {
				continue
			}
			sort.Slice(kids, func(i, j int) bool { return centre[kids[i]] < centre[kids[j]] })
			span := gap(kids[0], kids[1]) * float64(len(kids)-1)
			for _, k := range kids {
				_, c := size(k)
				span += c
			}
			at := centre[v] - span/2
			want := make([]float64, len(kids))
			mine := map[int]bool{}
			for i, k := range kids {
				_, c := size(k)
				want[i] = at + c/2
				at += c + gap(kids[0], kids[1])
				mine[k] = true
			}
			ok := true
			for i, k := range kids {
				if !fits(k, want[i], mine) {
					ok = false
				}
			}
			if ok {
				for i, k := range kids {
					centre[k] = want[i]
				}
			}
		}
	}

	minAcross := math.Inf(1)
	for v := 0; v < n; v++ {
		_, c := size(v)
		minAcross = math.Min(minAcross, centre[v]-c/2)
	}
	at := func(along, across float64) Position {
		if horizontal {
			return Position{along, across}
		}
		return Position{across, along}
	}
	placed := map[string]Position{}
	for v := 0; v < n; v++ {
		// The centre snaps to the grid, not the corner, so steps of different heights in a row stay level.
		_, c := size(v)
		p := at(snap8(alongAt[rank[v]]), snap8(centre[v]-minAcross)-c/2)
		placed[order[v]] = p
	}
	lanes := map[int][][2]float64{}
	for edge, chain := range chains {
		var pts [][2]float64
		for _, v := range chain {
			p := at(alongAt[vRank[v]]+layerW[vRank[v]]/2, centre[v]-minAcross)
			pts = append(pts, [2]float64{math.Round(p.X), math.Round(p.Y)})
		}
		lanes[edge] = pts
	}
	return placed, lanes
}

// inferAround gives areas from before they remembered their steps the steps lying inside them, so they can
// follow. It runs before arranging, while the steps still sit where the area was drawn.
func (d *Doc) inferAround() {
	for i := range d.Zones {
		z := &d.Zones[i]
		if len(z.Around) > 0 || z.Kind != "area" || z.W == 0 || z.H == 0 {
			continue
		}
		for _, n := range d.Nodes {
			dd := dims[n.Data.Kind]
			if n.Position.X >= z.X && n.Position.Y >= z.Y && n.Position.X+dd[0] <= z.X+z.W && n.Position.Y+dd[1] <= z.Y+z.H {
				z.Around = append(z.Around, n.ID)
			}
		}
	}
}

// arrange lays out one state or both. Current sets positions, Future sets Future positions, and connectors that
// skip columns get lanes for that state. A step only Future shows sits where Future puts it.
func (d *Doc) arrange(which string) {
	d.inferAround()
	apply := func(mode string) {
		ids, es := visibleIn(d, mode)
		placed, lanes := layOut(d, ids, es)
		for i := range d.Nodes {
			p, ok := placed[d.Nodes[i].ID]
			if !ok {
				continue
			}
			if mode == "current" {
				d.Nodes[i].Position = p
			} else {
				pp := p
				d.Nodes[i].Data.FuturePos = &pp
			}
		}
		for i := range d.Edges {
			e := &d.Edges[i]
			var lane *Lane
			if pts, ok := lanes[i]; ok && len(pts) > 0 {
				s, t := placed[e.Source], placed[e.Target]
				forward := t.X > s.X
				if d.Direction != "LR" {
					forward = t.Y > s.Y
				}
				if forward {
					lane = &Lane{At: [4]float64{s.X, s.Y, t.X, t.Y}, Pts: pts}
				}
			}
			if lane == nil && e.Data.Lanes == nil {
				continue
			}
			if e.Data.Lanes == nil {
				e.Data.Lanes = &Lanes{}
			}
			if mode == "current" {
				e.Data.Lanes.Current = lane
			} else {
				e.Data.Lanes.Future = lane
			}
			if e.Data.Lanes.Current == nil && e.Data.Lanes.Future == nil {
				e.Data.Lanes = nil
			}
		}
	}
	if which != "future" {
		apply("current")
	}
	if which != "current" {
		apply("future")
	}
	if which == "both" {
		for i := range d.Nodes {
			if d.Nodes[i].Data.Presence == "future-only" && d.Nodes[i].Data.FuturePos != nil {
				d.Nodes[i].Position = *d.Nodes[i].Data.FuturePos
			}
		}
	}
	d.fitZones(which)
}

// boundsAround is the box an area draws around steps: padding all round and room for its label on top.
func boundsAround(boxes [][4]float64, kind string) ZoneBox {
	const pad = 28.0
	minX, minY := math.Inf(1), math.Inf(1)
	maxX, maxY := math.Inf(-1), math.Inf(-1)
	for _, b := range boxes {
		minX, minY = math.Min(minX, b[0]), math.Min(minY, b[1])
		maxX, maxY = math.Max(maxX, b[0]+b[2]), math.Max(maxY, b[1]+b[3])
	}
	if kind == "label" {
		return ZoneBox{snap8(minX), snap8(minY - 48), 0, 0}
	}
	return ZoneBox{snap8(minX - pad), snap8(minY - pad - 24), snap8(maxX - minX + pad*2), snap8(maxY - minY + pad*2 + 24)}
}

// fitZones redraws areas around the steps they were drawn around, in each state laid out.
func (d *Doc) fitZones(which string) {
	byID := map[string]*Node{}
	for i := range d.Nodes {
		byID[d.Nodes[i].ID] = &d.Nodes[i]
	}
	for i := range d.Zones {
		z := &d.Zones[i]
		var cur, fut [][4]float64
		for _, id := range z.Around {
			nd := byID[id]
			if nd == nil {
				continue
			}
			dd := dims[nd.Data.Kind]
			if nd.Data.Presence != "future-only" {
				cur = append(cur, [4]float64{nd.Position.X, nd.Position.Y, dd[0], dd[1]})
			}
			p := nd.Position
			if nd.Data.FuturePos != nil {
				p = *nd.Data.FuturePos
			}
			if presenceState(nd.Data.Presence, "future", d.HideRemoved) != "hidden" {
				fut = append(fut, [4]float64{p.X, p.Y, dd[0], dd[1]})
			}
		}
		if which != "future" && len(cur) > 0 {
			b := boundsAround(cur, z.Kind)
			z.X, z.Y, z.W, z.H = b.X, b.Y, b.W, b.H
		}
		if which != "current" && len(fut) > 0 {
			b := boundsAround(fut, z.Kind)
			z.Future = &b
		}
	}
}

// liveLane is the lane a connector follows in a state, while both its steps are where the layout put them.
func liveLane(e Edge, mode string, s, t Position) [][2]float64 {
	if e.Data.Pinned || e.Data.Lanes == nil {
		return nil
	}
	l := e.Data.Lanes.Current
	if mode == "future" {
		l = e.Data.Lanes.Future
	}
	if l == nil {
		return nil
	}
	near := func(a, b float64) bool { return math.Abs(a-b) < 1 }
	if near(l.At[0], s.X) && near(l.At[1], s.Y) && near(l.At[2], t.X) && near(l.At[3], t.Y) {
		return l.Pts
	}
	return nil
}

func orderLayer(l []int, pos []float64, key func(v int) float64) {
	keys := map[int]float64{}
	for _, v := range l {
		keys[v] = key(v)
	}
	sort.SliceStable(l, func(i, j int) bool { return keys[l[i]] < keys[l[j]] })
	for i, v := range l {
		pos[v] = float64(i)
	}
}
