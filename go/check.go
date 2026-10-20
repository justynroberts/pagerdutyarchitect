package main

import (
	"fmt"
	"strings"
)

// Issue is something worth a second look before a diagram goes on a slide.
type Issue struct {
	Severity string `json:"severity"`
	Step     string `json:"step,omitempty"`
	Message  string `json:"message"`
}

// checkDiagram mirrors src/lib/check.ts, rule for rule and in the same order.
func (d *Doc) checkDiagram() []Issue {
	out := []Issue{}
	if len(d.Nodes) == 0 {
		return out
	}
	in := map[string]int{}
	outc := map[string]int{}
	for _, e := range d.Edges {
		outc[e.Source]++
		in[e.Target]++
	}
	for _, n := range d.Nodes {
		k := n.Data.Kind
		i, o := in[n.ID], outc[n.ID]
		name := fmt.Sprintf("%q", n.Data.Label)
		name = `"` + n.Data.Label + `"`
		if i == 0 && o == 0 {
			out = append(out, Issue{"warn", n.ID, name + " is not connected to anything."})
		} else {
			if k != "input" && i == 0 {
				out = append(out, Issue{"warn", n.ID, "Nothing leads into " + name + "."})
			}
			if k != "output" && o == 0 {
				out = append(out, Issue{"warn", n.ID, name + " leads nowhere. End it with an output, or connect it on."})
			}
		}
		if k == "decision" {
			if o == 1 {
				out = append(out, Issue{"warn", n.ID, "Decision " + name + " has one exit. A decision needs at least a Yes and a No."})
			}
			unl := 0
			for _, e := range d.Edges {
				if e.Source == n.ID && strings.TrimSpace(e.Data.Label) == "" {
					unl++
				}
			}
			if o > 1 && unl > 0 {
				s, v := "", "s"
				if unl > 1 {
					s, v = "s", "ve"
				} else {
					v = "s"
				}
				out = append(out, Issue{"info", n.ID, fmt.Sprintf("%d exit%s of %s ha%s no label.", unl, s, name, v)})
			}
		}
		if (k == "automation" || n.Data.Presence == "future-only") && k != "output" && (n.Data.Lever == "" || n.Data.Lever == "none") {
			out = append(out, Issue{"info", n.ID, name + " is added by automation but is not tagged AI or Automation."})
		}
		if k != "output" && k != "decision" && n.Data.Current == 0 && n.Data.Future == 0 {
			out = append(out, Issue{"info", n.ID, name + " has no time on it, so it adds nothing to the totals."})
		}
		if n.Data.Share <= 0 || n.Data.Share > 100 {
			out = append(out, Issue{"warn", n.ID, fmt.Sprintf("%s has a share of runs of %s%%. It should be between 1 and 100.", name, trimNum(n.Data.Share))})
		}
	}
	has := func(kind string) bool {
		for _, n := range d.Nodes {
			if n.Data.Kind == kind {
				return true
			}
		}
		return false
	}
	if !has("input") {
		out = append(out, Issue{"info", "", "No signal starts this process. Add one so it is clear what triggers it."})
	}
	if !has("output") {
		out = append(out, Issue{"info", "", "No output ends this process."})
	}
	for _, f := range d.Flows {
		used := false
		for _, e := range d.Edges {
			if contains(e.Data.Flows, f.ID) {
				used = true
				break
			}
		}
		if !used {
			out = append(out, Issue{"warn", "", `Flow "` + f.Name + `" has no connectors, so it shows nothing.`})
		}
	}
	order := []string{}
	seen := map[string]int{}
	for _, n := range d.Nodes {
		l := strings.ToLower(strings.TrimSpace(n.Data.Label))
		if seen[l] == 0 {
			order = append(order, l)
		}
		seen[l]++
	}
	for _, l := range order {
		if seen[l] > 1 {
			out = append(out, Issue{"info", "", fmt.Sprintf(`%d steps are called "%s". Naming steps uniquely makes them easier to refer to.`, seen[l], l)})
		}
	}
	return out
}

// trimNum prints a number the way JavaScript does: no trailing zeros.
func trimNum(v float64) string {
	return strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.6f", v), "0"), ".")
}

type flowTotal struct {
	Steps                  int
	Current, Future, Saved float64
}

// flowTotals is the time along a flow: each step its connectors touch, once, at full time.
func (d *Doc) flowTotals(flowID string) flowTotal {
	ids := map[string]bool{}
	for _, e := range d.Edges {
		if contains(e.Data.Flows, flowID) {
			ids[e.Source], ids[e.Target] = true, true
		}
	}
	t := flowTotal{Steps: len(ids)}
	for _, n := range d.Nodes {
		if ids[n.ID] {
			t.Current += stepMins(n.Data, "current")
			t.Future += stepMins(n.Data, "future")
		}
	}
	t.Saved = t.Current - t.Future
	return t
}
