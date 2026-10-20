package main

import (
	"math"
	"sort"
)

// A small layered layout: rank by longest path, order each rank by neighbour averages to cut crossings,
// then place steps so connectors run as straight as the spacing allows. Same spacing as the app's own layout.

func layoutNodes(d *Doc) {
	n := len(d.Nodes)
	if n == 0 {
		return
	}
	idx := map[string]int{}
	for i, nd := range d.Nodes {
		idx[nd.ID] = i
	}
	out := make([][]int, n)
	in := make([][]int, n)
	for _, e := range d.Edges {
		a, ok1 := idx[e.Source]
		b, ok2 := idx[e.Target]
		if ok1 && ok2 && a != b {
			out[a] = append(out[a], b)
			in[b] = append(in[b], a)
		}
	}

	// Break cycles: depth-first, ignore edges that point back up the current path.
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
		if state[v] == 0 && len(in[v]) == 0 {
			dfs(v)
		}
	}
	for v := 0; v < n; v++ {
		if state[v] == 0 {
			dfs(v)
		}
	}
	fwdOut := make([][]int, n)
	fwdIn := make([][]int, n)
	for v := 0; v < n; v++ {
		for _, w := range out[v] {
			if !back[[2]int{v, w}] {
				fwdOut[v] = append(fwdOut[v], w)
				fwdIn[w] = append(fwdIn[w], v)
			}
		}
	}

	// Longest-path ranks via a topological sweep.
	rank := make([]int, n)
	indeg := make([]int, n)
	for v := 0; v < n; v++ {
		indeg[v] = len(fwdIn[v])
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
		for _, w := range fwdOut[v] {
			if rank[v]+1 > rank[w] {
				rank[w] = rank[v] + 1
			}
			indeg[w]--
			if indeg[w] == 0 {
				queue = append(queue, w)
			}
		}
	}
	maxRank := 0
	for _, r := range rank {
		if r > maxRank {
			maxRank = r
		}
	}
	layers := make([][]int, maxRank+1)
	for v := 0; v < n; v++ {
		layers[rank[v]] = append(layers[rank[v]], v)
	}

	// Order within layers: sweep with neighbour averages, keeping input order as the tiebreak.
	pos := make([]float64, n)
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
	for pass := 0; pass < 6; pass++ {
		if pass%2 == 0 {
			for r := 1; r <= maxRank; r++ {
				orderLayer(layers[r], pos, func(v int) float64 { return bary(v, fwdIn[v]) })
			}
		} else {
			for r := maxRank - 1; r >= 0; r-- {
				orderLayer(layers[r], pos, func(v int) float64 { return bary(v, fwdOut[v]) })
			}
		}
	}

	horizontal := d.Direction == "LR"
	size := func(v int) (along, across float64) {
		dd := dims[d.Nodes[v].Data.Kind]
		if horizontal {
			return dd[0], dd[1]
		}
		return dd[1], dd[0]
	}
	nodesep, ranksep := 22.0, 44.0
	if !horizontal {
		nodesep = 36
	}

	// Position along the flow: each layer starts after the widest step of the one before.
	alongAt := make([]float64, maxRank+1)
	cursor := 0.0
	for r, l := range layers {
		alongAt[r] = cursor
		w := 0.0
		for _, v := range l {
			a, _ := size(v)
			w = math.Max(w, a)
		}
		cursor += w + ranksep
	}

	// Position across the flow: start stacked, then pull each step toward its neighbours and push apart overlaps.
	centre := make([]float64, n)
	for _, l := range layers {
		y := 0.0
		for _, v := range l {
			_, c := size(v)
			centre[v] = y + c/2
			y += c + nodesep
		}
	}
	settle := func(l []int, want func(v int) (float64, bool)) {
		// Desired centres, then a forward and backward pass so nothing overlaps and the order holds.
		des := make([]float64, len(l))
		for i, v := range l {
			if w, ok := want(v); ok {
				des[i] = w
			} else {
				des[i] = centre[v]
			}
		}
		cur := make([]float64, len(l))
		copy(cur, des)
		for i := 1; i < len(l); i++ {
			_, c0 := size(l[i-1])
			_, c1 := size(l[i])
			minGap := c0/2 + c1/2 + nodesep
			if cur[i] < cur[i-1]+minGap {
				cur[i] = cur[i-1] + minGap
			}
		}
		// Shift the whole run back so it stays centred on what the steps asked for.
		shift := 0.0
		for i := range l {
			shift += cur[i] - des[i]
		}
		shift /= float64(len(l))
		for i, v := range l {
			centre[v] = cur[i] - shift
		}
		for i := 1; i < len(l); i++ {
			_, c0 := size(l[i-1])
			_, c1 := size(l[i])
			minGap := c0/2 + c1/2 + nodesep
			if centre[l[i]] < centre[l[i-1]]+minGap {
				centre[l[i]] = centre[l[i-1]] + minGap
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
	for pass := 0; pass < 8; pass++ {
		if pass%2 == 0 {
			for r := 1; r <= maxRank; r++ {
				settle(layers[r], func(v int) (float64, bool) { return meanOf(fwdIn[v]) })
			}
		} else {
			for r := maxRank - 1; r >= 0; r-- {
				settle(layers[r], func(v int) (float64, bool) { return meanOf(fwdOut[v]) })
			}
		}
	}

	minAcross := math.Inf(1)
	for v := 0; v < n; v++ {
		_, c := size(v)
		minAcross = math.Min(minAcross, centre[v]-c/2)
	}
	for v := 0; v < n; v++ {
		_, c := size(v)
		a := alongAt[rank[v]]
		x := centre[v] - c/2 - minAcross
		if horizontal {
			d.Nodes[v].Position = Position{snap8(a), snap8(x)}
		} else {
			d.Nodes[v].Position = Position{snap8(x), snap8(a)}
		}
	}
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
