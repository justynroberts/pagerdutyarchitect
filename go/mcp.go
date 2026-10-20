package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

// A Model Context Protocol server over stdio, written against the standard library so the whole
// thing ships as one binary. Newline delimited JSON-RPC 2.0, tools only.

type M = map[string]any

type args map[string]any

func (a args) s(k string) string {
	if v, ok := a[k].(string); ok {
		return v
	}
	return ""
}
func (a args) has(k string) bool { _, ok := a[k]; return ok && a[k] != nil }
func (a args) num(k string) (*float64, error) {
	v, ok := a[k]
	if !ok || v == nil {
		return nil, nil
	}
	f, ok := v.(float64)
	if !ok {
		return nil, fmt.Errorf("%s must be a number", k)
	}
	return &f, nil
}
func (a args) strp(k string) *string {
	if v, ok := a[k].(string); ok {
		return &v
	}
	return nil
}
func (a args) strs(k string) ([]string, error) {
	v, ok := a[k]
	if !ok || v == nil {
		return nil, nil
	}
	l, ok := v.([]any)
	if !ok {
		return nil, fmt.Errorf("%s must be a list of strings", k)
	}
	out := make([]string, len(l))
	for i, x := range l {
		s, ok := x.(string)
		if !ok {
			return nil, fmt.Errorf("%s must be a list of strings", k)
		}
		out[i] = s
	}
	return out, nil
}
func (a args) list(k string) []args {
	l, _ := a[k].([]any)
	out := make([]args, 0, len(l))
	for _, x := range l {
		if m, ok := x.(map[string]any); ok {
			out = append(out, args(m))
		}
	}
	return out
}
func (a args) enum(k string, allowed []string) (string, error) {
	s := a.s(k)
	if s == "" {
		return "", nil
	}
	if !contains(allowed, s) {
		return "", fmt.Errorf("%s must be one of: %s", k, strings.Join(allowed, ", "))
	}
	return s, nil
}

var hexColour = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (a args) colour(k string) (string, error) {
	s := a.s(k)
	if s != "" && !hexColour.MatchString(s) {
		names := make([]string, len(palette))
		for i, c := range palette {
			names[i] = c.Name + " " + c.Value
		}
		return "", fmt.Errorf("%s must be a hex colour like #2fbf71. House colours: %s", k, strings.Join(names, ", "))
	}
	return s, nil
}

// ---------- schema helpers ----------

func sStr(desc string) M { return M{"type": "string", "description": desc} }
func sNum(desc string) M { return M{"type": "number", "description": desc} }
func sBool(desc string) M {
	return M{"type": "boolean", "description": desc}
}
func sEnum(vals []string, desc string) M {
	return M{"type": "string", "enum": vals, "description": desc}
}
func sArr(item M, desc string) M { return M{"type": "array", "items": item, "description": desc} }
func sObj(props M, req ...string) M {
	o := M{"type": "object", "properties": props}
	if len(req) > 0 {
		o["required"] = req
	}
	return o
}
func merge(ms ...M) M {
	out := M{}
	for _, m := range ms {
		for k, v := range m {
			out[k] = v
		}
	}
	return out
}

var (
	descKind     = "input = a signal that starts a flow, step = manual work, decision = a yes/no branch, automation = an automated step, output = where a flow ends"
	descLever    = "Where the time saving is made: ai (AI does it), automation (deterministic automation), or none"
	descPresence = "both = in the process today and after; current-only = removed by automation; future-only = added by automation"
)

func colourDesc() string {
	parts := make([]string, len(palette))
	for i, c := range palette {
		parts[i] = c.Name + " " + c.Value
	}
	return "Hex colour. House colours: " + strings.Join(parts, ", ")
}

func stepProps(withCatalogue bool) M {
	p := M{
		"kind":     sEnum(kinds, descKind),
		"label":    sStr("Step name"),
		"tool":     sStr("System or team that owns the step, shown under the label"),
		"icon":     sEnum(meta.Icons, "Phosphor icon name"),
		"brand":    sEnum(meta.Brands, "Brand mark shown instead of the icon"),
		"current":  sNum("Minutes the step takes today"),
		"future":   sNum("Minutes it takes after automation"),
		"share":    sNum("Percent of runs that reach this step (0 to 100)"),
		"presence": sEnum(presences, descPresence),
		"lever":    sEnum(levers, descLever),
		"note":     sStr("Free text note"),
	}
	if withCatalogue {
		p["catalogue_id"] = sStr("Start from a catalogue entry (see list_catalogue). Fields below override it.")
	}
	return p
}

// ---------- argument parsing shared by tools ----------

func stepPatchFrom(a args) (StepPatch, error) {
	var p StepPatch
	var err error
	if p.Kind, err = a.enum("kind", kinds); err != nil {
		return p, err
	}
	if p.Presence, err = a.enum("presence", presences); err != nil {
		return p, err
	}
	if p.Lever, err = a.enum("lever", levers); err != nil {
		return p, err
	}
	if p.Icon, err = a.enum("icon", meta.Icons); err != nil {
		return p, err
	}
	if p.Brand, err = a.enum("brand", meta.Brands); err != nil {
		return p, err
	}
	p.Label, p.Tool, p.Note = a.s("label"), a.strp("tool"), a.strp("note")
	for k, dst := range map[string]**float64{"current": &p.Current, "future": &p.Future, "share": &p.Share} {
		v, err := a.num(k)
		if err != nil {
			return p, err
		}
		if v != nil && *v < 0 {
			return p, fmt.Errorf("%s cannot be negative", k)
		}
		if k == "share" && v != nil && *v > 100 {
			return p, errors.New("share is a percentage, 0 to 100")
		}
		*dst = v
	}
	return p, nil
}

func stepSpecFrom(a args) (StepSpec, error) {
	p, err := stepPatchFrom(a)
	if err != nil {
		return StepSpec{}, err
	}
	return StepSpec{
		ID: a.s("id"), CatalogueID: a.s("catalogue_id"), Kind: p.Kind, Label: p.Label, Tool: p.Tool, Icon: p.Icon, Brand: p.Brand,
		Current: p.Current, Future: p.Future, Share: p.Share, Presence: p.Presence, Lever: p.Lever, Note: p.Note,
		After: a.s("after"), Before: a.s("before"), EdgeLabel: a.s("edge_label"),
	}, nil
}

func brief(d *Doc) string {
	s := d.summary()
	return fmt.Sprintf("%d steps, %d connectors, %d flows. Per run: %.1fm now, %.1fm after, %.1fm saved (%d%%).",
		len(d.Nodes), len(d.Edges), len(d.Flows), s.Current, s.Future, s.Saved, int(math.Round(s.Pct)))
}

func edit(a args, fn func(d *Doc) (string, error)) (string, error) {
	name := a.s("diagram")
	if name == "" {
		return "", errors.New("diagram is required: the name from list_diagrams")
	}
	cur, err := readDiagram(name)
	if err != nil {
		return "", err
	}
	d := cur.clone()
	msg, err := fn(d)
	if err != nil {
		return "", err
	}
	if _, err := writeDiagram(name, d); err != nil {
		return "", err
	}
	if msg != "" {
		msg += " "
	}
	return msg + brief(d), nil
}

// ---------- tools ----------

type tool struct {
	name, desc string
	schema     M
	run        func(a args) (string, error)
}

var diagramArg = sStr("Diagram name, as returned by list_diagrams")

func tools() []tool {
	flowsArg := sArr(sObj(M{"name": sStr("Flow name"), "color": sStr(colourDesc()), "steps": sArr(sStr(""), "Step ids or labels. Connectors between them are used and skipped steps are bridged."), "path": sArr(sStr(""), "Ordered step ids. Each pair must already be connected.")}, "name"), "Named coloured paths that appear in the legend")
	return []tool{
		{"list_catalogue", "Ready-made steps with times attached: incident handling, monitoring tools (Datadog, Splunk...) and CI/CD pipeline stages. Pass the id as catalogue_id to add_step or build_diagram.",
			sObj(M{"query": sStr("Text to look for"), "category": sEnum([]string{"Incident", "Monitoring", "CI/CD", "Other"}, "Catalogue section"), "kind": sEnum(kinds, "")}),
			func(a args) (string, error) {
				q := strings.ToLower(a.s("query"))
				var rows []string
				for _, c := range allCatalogue() {
					if a.s("category") != "" && c.Category != a.s("category") {
						continue
					}
					if a.s("kind") != "" && c.Kind != a.s("kind") {
						continue
					}
					if q != "" && !strings.Contains(strings.ToLower(c.Label+" "+c.Tool+" "+c.ID), q) {
						continue
					}
					lever := ""
					if c.Lever != "" {
						lever = " | " + c.Lever
					}
					rows = append(rows, fmt.Sprintf("%s | %s | %s | %s | %vm -> %vm%s | %s", c.ID, c.Kind, c.Label, c.Tool, c.Current, c.Future, lever, c.Category))
				}
				if len(rows) == 0 {
					return "Nothing matches.", nil
				}
				return strings.Join(rows, "\n"), nil
			}},
		{"list_diagrams", "Diagrams saved in the diagrams folder.", sObj(M{}), func(a args) (string, error) {
			ds := listDiagrams()
			if len(ds) == 0 {
				abs, _ := filepath.Abs(diagramDir)
				return "No diagrams yet in " + abs + ".", nil
			}
			rows := make([]string, len(ds))
			for i, d := range ds {
				rows[i] = fmt.Sprintf("%s | %s | %d steps | updated %s", d.Name, d.Title, d.Steps, d.Updated.UTC().Format("2006-01-02T15:04:05Z"))
			}
			return strings.Join(rows, "\n"), nil
		}},
		{"create_diagram", "Start a new diagram. Use from \"sample\" to begin with the alert engagement example.",
			sObj(M{"name": sStr("File name, letters numbers and dashes"), "title": sStr("Title shown on the slide"), "from": sEnum([]string{"blank", "sample"}, "")}, "name"),
			func(a args) (string, error) {
				n, err := nameOf(a.s("name"))
				if err != nil {
					return "", err
				}
				if diagramExists(n) {
					return "", fmt.Errorf("\"%s\" already exists. Pick another name, or edit it.", n)
				}
				if a.s("from") == "sample" {
					d := sampleDoc()
					if a.s("title") != "" {
						d.Title = a.s("title")
					}
					if _, err := writeDiagram(n, d); err != nil {
						return "", err
					}
					return fmt.Sprintf("Created %s from the sample. %s", n, brief(d)), nil
				}
				title := firstNonEmpty(a.s("title"), n)
				if _, err := writeDiagram(n, blankDoc(title)); err != nil {
					return "", err
				}
				return fmt.Sprintf("Created empty diagram %s (\"%s\").", n, title), nil
			}},
		{"build_diagram", "Create a whole diagram in one call and lay it out left to right. Steps need an id. Link them with connections, or with after/before on a step. Decisions get Yes/No labels automatically. Flows are coloured paths named for a scenario, defined by steps (gaps are bridged) or an ordered path. Areas highlight groups of steps.",
			sObj(M{
				"name": sStr("File name"), "overwrite": sBool("Replace an existing diagram of this name"),
				"title": sStr("Slide title"), "subtitle": sStr("Slide subtitle. Defaults to the totals."),
				"direction":      sEnum([]string{"LR", "TB"}, "Left to right (default) or top to bottom"),
				"runs_per_month": sNum("How many times the process runs a month"), "rate_per_hour": sNum("Cost of an hour of effort, in the user currency"),
				"steps":       sArr(sObj(merge(M{"id": sStr("Unique id for this step"), "after": sStr("Step this one follows"), "before": sStr("Step this one leads into"), "edge_label": sStr("Label on that connector")}, stepProps(true)), "id"), "The steps"),
				"connections": sArr(sObj(M{"from": sStr(""), "to": sStr(""), "label": sStr(""), "line": sEnum(lines, "")}, "from", "to"), "Extra connectors"),
				"flows":       flowsArg,
				"areas":       sArr(sObj(M{"label": sStr(""), "color": sStr(colourDesc()), "around": sArr(sStr(""), "Steps to wrap"), "kind": sEnum([]string{"area", "label"}, "")}, "label", "around"), "Highlighted areas"),
			}, "name", "steps"),
			func(a args) (string, error) {
				n, err := nameOf(a.s("name"))
				if err != nil {
					return "", err
				}
				if diagramExists(n) {
					if b, _ := a["overwrite"].(bool); !b {
						return "", fmt.Errorf("\"%s\" already exists. Set overwrite true to replace it, or use the edit tools.", n)
					}
				}
				spec := DiagramSpec{Title: a.s("title"), Subtitle: a.s("subtitle"), Direction: a.s("direction")}
				if spec.RunsPerMonth, err = a.num("runs_per_month"); err != nil {
					return "", err
				}
				if spec.RatePerHour, err = a.num("rate_per_hour"); err != nil {
					return "", err
				}
				for _, s := range a.list("steps") {
					st, err := stepSpecFrom(s)
					if err != nil {
						return "", fmt.Errorf("step \"%s\": %w", s.s("id"), err)
					}
					spec.Steps = append(spec.Steps, st)
				}
				if len(spec.Steps) == 0 {
					return "", errors.New("steps is required and needs at least one step")
				}
				for _, c := range a.list("connections") {
					line, err := c.enum("line", lines)
					if err != nil {
						return "", err
					}
					spec.Connections = append(spec.Connections, ConnSpec{c.s("from"), c.s("to"), c.s("label"), line})
				}
				for _, f := range a.list("flows") {
					col, err := f.colour("color")
					if err != nil {
						return "", err
					}
					steps, err := f.strs("steps")
					if err != nil {
						return "", err
					}
					path, err := f.strs("path")
					if err != nil {
						return "", err
					}
					spec.Flows = append(spec.Flows, FlowSpec{Name: f.s("name"), Color: col, Steps: steps, Path: path})
				}
				for _, z := range a.list("areas") {
					col, err := z.colour("color")
					if err != nil {
						return "", err
					}
					around, err := z.strs("around")
					if err != nil {
						return "", err
					}
					spec.Areas = append(spec.Areas, AreaSpec{Label: z.s("label"), Color: col, Around: around, Kind: z.s("kind")})
				}
				d, err := buildDoc(spec)
				if err != nil {
					return "", err
				}
				if _, err := writeDiagram(n, d); err != nil {
					return "", err
				}
				return fmt.Sprintf("Built %s. %s", n, brief(d)), nil
			}},
		{"get_diagram", "Read a diagram: steps with times and levers, connectors, flows, areas and totals. Use format json for the raw file.",
			sObj(M{"name": diagramArg, "format": sEnum([]string{"overview", "json"}, "")}, "name"),
			func(a args) (string, error) {
				d, err := readDiagram(a.s("name"))
				if err != nil {
					return "", err
				}
				var v any = d.overview()
				if a.s("format") == "json" {
					v = d
				}
				b, _ := json.MarshalIndent(v, "", " ")
				return string(b), nil
			}},
		{"add_step", "Add a step. With after (or before) it is placed next to that step and connected.",
			sObj(merge(M{"diagram": diagramArg, "id": sStr("Optional id, defaults to a slug of the label"), "after": sStr("Step id or label to connect from"), "before": sStr("Step id or label to connect to"), "edge_label": sStr("")}, stepProps(true)), "diagram"),
			func(a args) (string, error) {
				spec, err := stepSpecFrom(a)
				if err != nil {
					return "", err
				}
				return edit(a, func(d *Doc) (string, error) {
					n, err := d.addStep(spec)
					if err != nil {
						return "", err
					}
					return "Added " + n.ID + ".", nil
				})
			}},
		{"update_step", "Change any field of a step: times, label, tool, icon, brand, lever (ai or automation), presence, share, note.",
			sObj(merge(M{"diagram": diagramArg, "step": sStr("Step id or label")}, stepProps(false)), "diagram", "step"),
			func(a args) (string, error) {
				p, err := stepPatchFrom(a)
				if err != nil {
					return "", err
				}
				return edit(a, func(d *Doc) (string, error) {
					n, err := d.updateStep(a.s("step"), p)
					if err != nil {
						return "", err
					}
					return "Updated " + n.ID + ".", nil
				})
			}},
		{"set_lever", "Tag several steps at once as AI or Automation (or none) so the diagram shows where the benefit is made.",
			sObj(M{"diagram": diagramArg, "steps": sArr(sStr(""), "Step ids or labels"), "lever": sEnum(levers, descLever)}, "diagram", "steps", "lever"),
			func(a args) (string, error) {
				lever, err := a.enum("lever", levers)
				if err != nil || lever == "" {
					return "", errors.New("lever must be one of: " + strings.Join(levers, ", "))
				}
				steps, err := a.strs("steps")
				if err != nil || len(steps) == 0 {
					return "", errors.New("steps needs at least one step")
				}
				return edit(a, func(d *Doc) (string, error) {
					ids := []string{}
					for _, s := range steps {
						n, err := d.updateStep(s, StepPatch{Lever: lever})
						if err != nil {
							return "", err
						}
						ids = append(ids, n.ID)
					}
					return fmt.Sprintf("Tagged %s as %s.", strings.Join(ids, ", "), lever), nil
				})
			}},
		{"remove_step", "Delete a step and its connectors.", sObj(M{"diagram": diagramArg, "step": sStr("Step id or label")}, "diagram", "step"),
			func(a args) (string, error) {
				return edit(a, func(d *Doc) (string, error) {
					id, err := d.removeStep(a.s("step"))
					return "Removed " + id + ".", err
				})
			}},
		{"connect", "Draw a connector between two steps. Decisions label their first two exits Yes and No unless you set a label.",
			sObj(M{"diagram": diagramArg, "from": sStr("Step id or label"), "to": sStr("Step id or label"), "label": sStr(""), "line": sEnum(lines, "")}, "diagram", "from", "to"),
			func(a args) (string, error) {
				line, err := a.enum("line", lines)
				if err != nil {
					return "", err
				}
				return edit(a, func(d *Doc) (string, error) {
					e, err := d.connect(a.s("from"), a.s("to"), a.s("label"), line)
					if err != nil {
						return "", err
					}
					return fmt.Sprintf("Connected %s to %s (%s).", e.Source, e.Target, e.ID), nil
				})
			}},
		{"disconnect", "Remove the connector between two steps.", sObj(M{"diagram": diagramArg, "from": sStr(""), "to": sStr("")}, "diagram", "from", "to"),
			func(a args) (string, error) {
				return edit(a, func(d *Doc) (string, error) { return "Disconnected.", d.disconnect(a.s("from"), a.s("to")) })
			}},
		{"update_connector", "Change a connector label, line style or presence.",
			sObj(M{"diagram": diagramArg, "from": sStr(""), "to": sStr(""), "label": sStr(""), "line": sEnum(lines, ""), "presence": sEnum(presences, descPresence)}, "diagram", "from", "to"),
			func(a args) (string, error) {
				line, err := a.enum("line", lines)
				if err != nil {
					return "", err
				}
				pres, err := a.enum("presence", presences)
				if err != nil {
					return "", err
				}
				return edit(a, func(d *Doc) (string, error) {
					return "Updated connector.", d.updateConnector(a.s("from"), a.s("to"), a.s("label"), a.has("label"), line, pres)
				})
			}},
		{"create_flow", "Highlight a path as a named, coloured flow that appears in the legend. Give steps (connectors between them are used and skipped steps are bridged) or path (ordered step ids, each pair must be connected).",
			sObj(M{"diagram": diagramArg, "name": sStr("Flow name"), "steps": sArr(sStr(""), "Step ids or labels"), "path": sArr(sStr(""), "Ordered step ids"), "color": sStr(colourDesc())}, "diagram", "name"),
			func(a args) (string, error) {
				col, err := a.colour("color")
				if err != nil {
					return "", err
				}
				steps, err := a.strs("steps")
				if err != nil {
					return "", err
				}
				path, err := a.strs("path")
				if err != nil {
					return "", err
				}
				return edit(a, func(d *Doc) (string, error) {
					f, err := d.createFlow(a.s("name"), steps, path, col)
					if err != nil {
						return "", err
					}
					return fmt.Sprintf("Created flow \"%s\".", f.Name), nil
				})
			}},
		{"update_flow", "Rename a flow or change its colour.", sObj(M{"diagram": diagramArg, "flow": sStr("Flow id or name"), "name": sStr(""), "color": sStr(colourDesc())}, "diagram", "flow"),
			func(a args) (string, error) {
				col, err := a.colour("color")
				if err != nil {
					return "", err
				}
				return edit(a, func(d *Doc) (string, error) {
					f, err := d.updateFlow(a.s("flow"), a.s("name"), col)
					if err != nil {
						return "", err
					}
					return fmt.Sprintf("Updated flow \"%s\".", f.Name), nil
				})
			}},
		{"delete_flow", "Remove a flow and its highlight.", sObj(M{"diagram": diagramArg, "flow": sStr("Flow id or name")}, "diagram", "flow"),
			func(a args) (string, error) {
				return edit(a, func(d *Doc) (string, error) { return "Deleted flow.", d.deleteFlow(a.s("flow")) })
			}},
		{"add_area", "Add a highlighted area around steps, or a free text label, to call something out on the slide.",
			sObj(M{"diagram": diagramArg, "label": sStr("Text shown on the area"), "kind": sEnum([]string{"area", "label"}, ""), "around": sArr(sStr(""), "Steps to wrap"), "color": sStr(colourDesc()), "x": sNum(""), "y": sNum("")}, "diagram", "label"),
			func(a args) (string, error) {
				col, err := a.colour("color")
				if err != nil {
					return "", err
				}
				around, err := a.strs("around")
				if err != nil {
					return "", err
				}
				kind, err := a.enum("kind", []string{"area", "label"})
				if err != nil {
					return "", err
				}
				x, _ := a.num("x")
				y, _ := a.num("y")
				return edit(a, func(d *Doc) (string, error) {
					z, err := d.addZone(ZoneSpec{Kind: kind, Label: a.s("label"), Color: col, Around: around, X: x, Y: y})
					if err != nil {
						return "", err
					}
					return "Added " + z.ID + ".", nil
				})
			}},
		{"remove_area", "Delete an area or label by id or text.", sObj(M{"diagram": diagramArg, "area": sStr("Id or text")}, "diagram", "area"),
			func(a args) (string, error) {
				return edit(a, func(d *Doc) (string, error) { return "Removed.", d.removeZone(a.s("area")) })
			}},
		{"auto_layout", "Re-run the automatic layout. This moves every step, so only use it when the user asks or after big structural changes. Optionally flip direction.",
			sObj(M{"diagram": diagramArg, "direction": sEnum([]string{"LR", "TB"}, "")}, "diagram"),
			func(a args) (string, error) {
				dir, err := a.enum("direction", []string{"LR", "TB"})
				if err != nil {
					return "", err
				}
				return edit(a, func(d *Doc) (string, error) { d.autoLayout(dir); return "Laid out.", nil })
			}},
		{"set_details", "Set the title, subtitle (shown on the slide), volume of runs per month, hourly cost, or which state exports default to.",
			sObj(M{"diagram": diagramArg, "title": sStr(""), "subtitle": sStr(""), "runs_per_month": sNum(""), "rate_per_hour": sNum(""), "mode": sEnum([]string{"current", "future"}, "")}, "diagram"),
			func(a args) (string, error) {
				runs, err := a.num("runs_per_month")
				if err != nil {
					return "", err
				}
				rate, err := a.num("rate_per_hour")
				if err != nil {
					return "", err
				}
				mode, err := a.enum("mode", []string{"current", "future"})
				if err != nil {
					return "", err
				}
				return edit(a, func(d *Doc) (string, error) {
					if a.has("title") {
						d.Title = a.s("title")
					}
					if a.has("subtitle") {
						d.Subtitle = a.s("subtitle")
					}
					if runs != nil {
						d.RunsPerMonth = *runs
					}
					if rate != nil {
						d.RatePerHour = *rate
					}
					if mode != "" {
						d.Mode = mode
					}
					return "Updated details.", nil
				})
			}},
		{"add_catalogue_item", "Add or replace a reusable step in the catalogue, for example one of your own tools or a pipeline stage. It then appears in the app catalogue and works as a catalogue_id here. Saved in diagrams/catalogue.json.",
			sObj(M{"id": sStr("Lowercase id, e.g. mo-honeycomb"), "kind": sEnum(kinds, descKind), "label": sStr(""), "tool": sStr(""), "icon": sEnum(meta.Icons, "Phosphor icon name"), "brand": sEnum(meta.Brands, ""),
				"category": sEnum([]string{"Incident", "Monitoring", "CI/CD", "Other"}, ""), "current": sNum("Minutes today"), "future": sNum("Minutes after automation"), "presence": sEnum(presences, descPresence), "lever": sEnum(levers, descLever)},
				"id", "kind", "label", "current", "future"),
			func(a args) (string, error) {
				p, err := stepPatchFrom(a)
				if err != nil {
					return "", err
				}
				if p.Kind == "" || p.Current == nil || p.Future == nil {
					return "", errors.New("kind, current and future are required")
				}
				item := CatalogItem{ID: a.s("id"), Kind: p.Kind, Label: p.Label, Icon: p.Icon, Brand: p.Brand, Category: a.s("category"), Current: *p.Current, Future: *p.Future, Presence: p.Presence, Lever: p.Lever}
				if p.Tool != nil {
					item.Tool = *p.Tool
				}
				if err := addCatalogueItem(item); err != nil {
					return "", err
				}
				return "Saved catalogue item " + item.ID + ". Use it as catalogue_id.", nil
			}},
		{"remove_catalogue_item", "Remove a custom catalogue item. Built-in items cannot be removed.", sObj(M{"id": sStr("")}, "id"),
			func(a args) (string, error) {
				if err := removeCatalogueItem(a.s("id")); err != nil {
					return "", err
				}
				return "Removed " + a.s("id") + ".", nil
			}},
		{"delete_diagram", "Delete a diagram file. Only on the user request.", sObj(M{"name": diagramArg}, "name"),
			func(a args) (string, error) {
				if _, err := readDiagram(a.s("name")); err != nil {
					return "", err
				}
				p, _ := pathFor(a.s("name"))
				if err := os.Remove(p); err != nil {
					return "", err
				}
				n, _ := nameOf(a.s("name"))
				return "Deleted " + n + ".", nil
			}},
		{"export_diagram", "Export a diagram. svg is a 1920x1080 slide (PagerDuty green by default) saved to diagrams/exports; json is the editable file; markdown is a table of steps and savings. mode picks the Current or Future state. For a PNG use the Export slide PNG button in the app.",
			sObj(M{"name": diagramArg, "format": sEnum([]string{"svg", "json", "markdown", "png"}, ""), "mode": sEnum([]string{"current", "future"}, ""), "theme": sEnum([]string{"green", "light", "dark"}, ""), "output_path": sStr("Where to write the file. Defaults to diagrams/exports")}, "name", "format"),
			func(a args) (string, error) {
				d, err := readDiagram(a.s("name"))
				if err != nil {
					return "", err
				}
				mode, err := a.enum("mode", []string{"current", "future"})
				if err != nil {
					return "", err
				}
				theme, err := a.enum("theme", []string{"green", "light", "dark"})
				if err != nil {
					return "", err
				}
				switch a.s("format") {
				case "json":
					return string(d.tidyJSON()), nil
				case "markdown":
					return d.markdown(), nil
				case "svg":
					m := firstNonEmpty(mode, d.Mode, "current")
					n, _ := nameOf(a.s("name"))
					out := a.s("output_path")
					if out == "" {
						out = filepath.Join(diagramDir, "exports", fmt.Sprintf("%s-%s.svg", n, m))
					}
					if err := writeFileAtomic(out, []byte(renderSVG(d, m, theme))); err != nil {
						return "", err
					}
					abs, _ := filepath.Abs(out)
					return "Wrote " + abs, nil
				case "png":
					return "", errors.New("PNG export is not built into this binary. Export svg instead, or open the diagram in the app (run `dwell`) and use File > Export slide PNG.")
				}
				return "", errors.New("format must be one of: svg, json, markdown")
			}},
	}
}

// ---------- JSON-RPC ----------

const serverInstructions = "Dwell builds process diagrams where every step carries a time today and a time after automation. " +
	"Fast path: call build_diagram once with all steps, connections, flows and areas. It lays the diagram out for you. " +
	"To change an existing one use get_diagram, then add_step, update_step, connect, set_lever and the rest. " +
	"Tag where the benefit comes from with lever: \"ai\" or \"automation\". Future-state only steps use presence \"future-only\" and current 0. " +
	"Times are minutes. 0.5 is 30 seconds. Use list_catalogue for ready-made steps with sensible figures, including monitoring and CI/CD tools. " +
	"The user sees changes live in the Dwell app. Call export_diagram for a slide (svg), json, or a markdown summary."

type rpcReq struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcErr struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResp struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcErr         `json:"error,omitempty"`
}

var supportedProtocols = []string{"2025-06-18", "2025-03-26", "2024-11-05"}

func handleRPC(req rpcReq, registry []tool) *rpcResp {
	isNote := len(req.ID) == 0
	reply := func(res any) *rpcResp {
		if isNote {
			return nil
		}
		return &rpcResp{JSONRPC: "2.0", ID: req.ID, Result: res}
	}
	fail := func(code int, msg string) *rpcResp {
		if isNote {
			return nil
		}
		return &rpcResp{JSONRPC: "2.0", ID: req.ID, Error: &rpcErr{code, msg}}
	}
	switch req.Method {
	case "initialize":
		var p struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		_ = json.Unmarshal(req.Params, &p)
		pv := supportedProtocols[0]
		if contains(supportedProtocols, p.ProtocolVersion) {
			pv = p.ProtocolVersion
		}
		return reply(M{"protocolVersion": pv, "capabilities": M{"tools": M{"listChanged": false}}, "serverInfo": M{"name": "dwell", "version": version}, "instructions": serverInstructions})
	case "ping":
		return reply(M{})
	case "tools/list":
		list := make([]M, len(registry))
		for i, t := range registry {
			list[i] = M{"name": t.name, "description": t.desc, "inputSchema": t.schema}
		}
		return reply(M{"tools": list})
	case "tools/call":
		var p struct {
			Name      string         `json:"name"`
			Arguments map[string]any `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &p); err != nil {
			return fail(-32602, "Invalid params")
		}
		for _, t := range registry {
			if t.name == p.Name {
				text, err := safeRun(t, args(p.Arguments))
				if err != nil {
					return reply(M{"content": []M{{"type": "text", "text": err.Error()}}, "isError": true})
				}
				return reply(M{"content": []M{{"type": "text", "text": text}}})
			}
		}
		return fail(-32602, "Unknown tool: "+p.Name)
	}
	if isNote {
		return nil // notifications such as notifications/initialized need no answer
	}
	return fail(-32601, "Method not found: "+req.Method)
}

// safeRun keeps a bug in one tool from taking the whole server down.
func safeRun(t tool, a args) (text string, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("internal error in %s: %v", t.name, r)
		}
	}()
	if a == nil {
		a = args{}
	}
	return t.run(a)
}

func runMCP(in io.Reader, out io.Writer) error {
	registry := tools()
	var mu sync.Mutex
	enc := json.NewEncoder(out)
	enc.SetEscapeHTML(false)
	sc := bufio.NewScanner(in)
	sc.Buffer(make([]byte, 1<<20), 32<<20)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" {
			continue
		}
		var req rpcReq
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			mu.Lock()
			_ = enc.Encode(rpcResp{JSONRPC: "2.0", ID: json.RawMessage("null"), Error: &rpcErr{-32700, "Parse error"}})
			mu.Unlock()
			continue
		}
		if resp := handleRPC(req, registry); resp != nil {
			mu.Lock()
			err := enc.Encode(resp)
			mu.Unlock()
			if err != nil {
				return err
			}
		}
	}
	return sc.Err()
}
