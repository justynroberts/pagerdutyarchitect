package main

import (
	"fmt"
	"strings"
)

func mq(s string) string { return strings.ReplaceAll(s, `"`, "#quot;") }

// mermaid mirrors src/lib/mermaid.ts: a flowchart for GitHub, Notion or any Markdown that renders it.
func (d *Doc) mermaid(mode string) string {
	live := []Node{}
	for _, n := range d.Nodes {
		if presenceState(n.Data.Presence, mode, d.HideRemoved) != "hidden" {
			live = append(live, n)
		}
	}
	idOf := map[string]string{}
	for i, n := range live {
		idOf[n.ID] = fmt.Sprintf("s%d", i)
	}
	lines := []string{"flowchart " + d.Direction}
	for _, n := range live {
		t := n.Data
		text := mq(t.Label)
		if t.Current != 0 || t.Future != 0 {
			text += "<br/>" + fmtMins(stepMins(t, mode))
		}
		var shape string
		switch t.Kind {
		case "decision":
			shape = `{"` + text + `"}`
		case "input":
			shape = `[/"` + text + `"/]`
		case "automation":
			shape = `[["` + text + `"]]`
		case "output":
			shape = `(["` + text + `"])`
		case "handoff":
			shape = `>"` + text + `"]`
		case "wait":
			shape = `("` + text + `")`
		case "document":
			shape = `[\"` + text + `"/]`
		case "system":
			shape = `[("` + text + `")]`
		case "subprocess":
			shape = `[["` + text + `"]]`
		default:
			shape = `["` + text + `"]`
		}
		lines = append(lines, "  "+idOf[n.ID]+shape)
	}
	styled := []string{}
	idx := 0
	for _, e := range d.Edges {
		a, aok := idOf[e.Source]
		b, bok := idOf[e.Target]
		if !aok || !bok {
			continue
		}
		label := strings.TrimSpace(e.Data.Label)
		lab := ""
		if label != "" {
			lab = `|"` + mq(label) + `"|`
		}
		lines = append(lines, fmt.Sprintf("  %s -->%s %s", a, lab, b))
		for _, f := range d.Flows {
			if contains(e.Data.Flows, f.ID) {
				styled = append(styled, fmt.Sprintf("  linkStyle %d stroke:%s,stroke-width:4px", idx, f.Color))
				break
			}
		}
		idx++
	}
	lines = append(lines, styled...)
	lines = append(lines, "  classDef ai fill:#efe9ff,stroke:#6d4bd6,color:#241a4d", "  classDef auto fill:#e3f6ea,stroke:#0a8a3a,color:#0c3320")
	ai, auto := []string{}, []string{}
	for _, n := range live {
		switch n.Data.Lever {
		case "ai":
			ai = append(ai, idOf[n.ID])
		case "automation":
			auto = append(auto, idOf[n.ID])
		}
	}
	if len(ai) > 0 {
		lines = append(lines, "  class "+strings.Join(ai, ",")+" ai")
	}
	if len(auto) > 0 {
		lines = append(lines, "  class "+strings.Join(auto, ",")+" auto")
	}
	return strings.Join(lines, "\n")
}
