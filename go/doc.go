package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// The diagram as data, and the edits you can make to it. This mirrors src/lib/doc.ts so a file written
// here opens in the app, and the other way round.

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type NodeData struct {
	Kind     string  `json:"kind"`
	Label    string  `json:"label"`
	Tool     string  `json:"tool"`
	Icon     string  `json:"icon"`
	Brand    string  `json:"brand,omitempty"`
	Current  float64 `json:"current"`
	Future   float64 `json:"future"`
	Share    float64 `json:"share"`
	Presence string  `json:"presence"`
	Note     string  `json:"note"`
	Lever    string  `json:"lever,omitempty"`
	// FuturePos is where the step sits in the Future state, when that differs from the Current layout.
	FuturePos *Position `json:"futurePos,omitempty"`
}

type Node struct {
	ID       string   `json:"id"`
	Type     string   `json:"type"`
	Position Position `json:"position"`
	Data     NodeData `json:"data"`
}

type EdgeData struct {
	Presence string   `json:"presence"`
	Label    string   `json:"label"`
	Flows    []string `json:"flows"`
	Line     string   `json:"line,omitempty"`
	// Pinned: sides chosen by hand; otherwise a connector takes the closest sides when drawn.
	Pinned bool `json:"pinned,omitempty"`
}

type Edge struct {
	ID           string   `json:"id"`
	Type         string   `json:"type"`
	Source       string   `json:"source"`
	Target       string   `json:"target"`
	SourceHandle string   `json:"sourceHandle,omitempty"`
	TargetHandle string   `json:"targetHandle,omitempty"`
	Data         EdgeData `json:"data"`
}

type Flow struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Color string `json:"color"`
}

type Zone struct {
	ID    string  `json:"id"`
	Kind  string  `json:"kind"`
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	W     float64 `json:"w"`
	H     float64 `json:"h"`
	Label string  `json:"label"`
	Color string  `json:"color"`
}

type Doc struct {
	App          string     `json:"app"`
	Version      int        `json:"version"`
	Title        string     `json:"title"`
	Subtitle     string     `json:"subtitle,omitempty"`
	Direction    string     `json:"direction"`
	Mode         string     `json:"mode,omitempty"`
	RunsPerMonth float64    `json:"runsPerMonth"`
	RatePerHour  float64    `json:"ratePerHour"`
	Overrides    *Overrides `json:"overrides,omitempty"`
	// Commercial is the app's ROI sheet. The binary doesn't use it, only keeps it intact.
	Commercial json.RawMessage `json:"commercial,omitempty"`
	Flows      []Flow          `json:"flows"`
	Zones      []Zone          `json:"zones"`
	Nodes      []Node          `json:"nodes"`
	Edges      []Edge          `json:"edges"`
}

type CatalogItem struct {
	ID       string  `json:"id"`
	Kind     string  `json:"kind"`
	Label    string  `json:"label"`
	Tool     string  `json:"tool"`
	Icon     string  `json:"icon"`
	Brand    string  `json:"brand,omitempty"`
	Category string  `json:"category,omitempty"`
	Current  float64 `json:"current"`
	Future   float64 `json:"future"`
	Presence string  `json:"presence"`
	Lever    string  `json:"lever,omitempty"`
}

var kinds = []string{"input", "step", "decision", "automation", "output", "handoff", "wait", "document", "system", "subprocess"}
var presences = []string{"both", "current-only", "future-only"}
var levers = []string{"none", "ai", "automation"}
var lines = []string{"step", "curve", "straight"}

var dims = map[string][2]float64{
	"input": {204, 56}, "step": {204, 56}, "automation": {204, 56}, "output": {204, 56}, "decision": {156, 108},
	"handoff": {204, 56}, "wait": {204, 56}, "document": {204, 64}, "system": {204, 68}, "subprocess": {204, 56},
}

var defaultIcon = map[string]string{"input": "bell", "step": "gear", "decision": "question", "automation": "lightning", "output": "check",
	"handoff": "escalate", "wait": "hourglass", "document": "file", "system": "database", "subprocess": "stack"}

func blankDoc(title string) *Doc {
	d := &Doc{App: "dwell", Version: 1, Title: title, Direction: "LR", Mode: "current", RunsPerMonth: 320, RatePerHour: 75}
	d.normalise()
	return d
}

// normalise makes sure empty lists are written as [] and never null.
func (d *Doc) normalise() {
	if d.Flows == nil {
		d.Flows = []Flow{}
	}
	if d.Zones == nil {
		d.Zones = []Zone{}
	}
	if d.Nodes == nil {
		d.Nodes = []Node{}
	}
	if d.Edges == nil {
		d.Edges = []Edge{}
	}
	for i := range d.Edges {
		if d.Edges[i].Data.Flows == nil {
			d.Edges[i].Data.Flows = []string{}
		}
		if d.Edges[i].Type == "" {
			d.Edges[i].Type = "flow"
		}
	}
	for i := range d.Nodes {
		if d.Nodes[i].Type == "" {
			d.Nodes[i].Type = "flow"
		}
	}
	if d.Direction != "TB" {
		d.Direction = "LR"
	}
	if d.App == "" {
		d.App = "dwell"
	}
	if d.Version == 0 {
		d.Version = 1
	}
}

func parseDoc(b []byte) (*Doc, error) {
	var d Doc
	if err := json.Unmarshal(b, &d); err != nil {
		return nil, errors.New("Could not read the file as JSON.")
	}
	if d.App != "dwell" {
		return nil, errors.New("Not a Dwell diagram.")
	}
	d.normalise()
	for i := range d.Flows {
		if d.Flows[i].Color == "" {
			d.Flows[i].Color = palette[i%len(palette)].Value
		}
	}
	return &d, nil
}

func (d *Doc) clone() *Doc {
	b, _ := json.Marshal(d)
	var c Doc
	_ = json.Unmarshal(b, &c)
	c.normalise()
	return &c
}

// ---------- small helpers ----------

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func slug(s string) string {
	s = strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(s), "-"), "-")
	if len(s) > 32 {
		s = strings.Trim(s[:32], "-")
	}
	if s == "" {
		return "step"
	}
	return s
}

func uniqueID(taken []string, base string) string {
	set := map[string]bool{}
	for _, t := range taken {
		set[t] = true
	}
	if !set[base] {
		return base
	}
	for i := 2; ; i++ {
		c := fmt.Sprintf("%s-%d", base, i)
		if !set[c] {
			return c
		}
	}
}

func snap8(n float64) float64 { return math.Round(n/8) * 8 }

func contains(list []string, s string) bool {
	for _, x := range list {
		if x == s {
			return true
		}
	}
	return false
}

func (d *Doc) nodeIDs() []string {
	r := make([]string, len(d.Nodes))
	for i, n := range d.Nodes {
		r[i] = n.ID
	}
	return r
}

func (d *Doc) edgeIDs() []string {
	r := make([]string, len(d.Edges))
	for i, e := range d.Edges {
		r[i] = e.ID
	}
	return r
}

func (d *Doc) node(id string) *Node {
	for i := range d.Nodes {
		if d.Nodes[i].ID == id {
			return &d.Nodes[i]
		}
	}
	return nil
}

// findStep looks a step up by id, then by label (case-insensitive, must be unique).
func (d *Doc) findStep(ref string) (*Node, error) {
	if n := d.node(ref); n != nil {
		return n, nil
	}
	var hits []*Node
	for i := range d.Nodes {
		if strings.EqualFold(d.Nodes[i].Data.Label, ref) {
			hits = append(hits, &d.Nodes[i])
		}
	}
	if len(hits) == 1 {
		return hits[0], nil
	}
	if len(hits) > 1 {
		ids := make([]string, len(hits))
		for i, h := range hits {
			ids[i] = h.ID
		}
		return nil, fmt.Errorf("\"%s\" matches %d steps. Use one of the ids: %s", ref, len(hits), strings.Join(ids, ", "))
	}
	list := make([]string, len(d.Nodes))
	for i, n := range d.Nodes {
		list[i] = fmt.Sprintf("%s (%s)", n.ID, n.Data.Label)
	}
	have := "none yet"
	if len(list) > 0 {
		have = strings.Join(list, ", ")
	}
	return nil, fmt.Errorf("No step \"%s\". Steps are: %s", ref, have)
}

func (d *Doc) findSteps(refs []string) ([]*Node, error) {
	out := make([]*Node, 0, len(refs))
	for _, r := range refs {
		n, err := d.findStep(r)
		if err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, nil
}

// ---------- palette ----------

type markColor struct{ Value, Name string }

var palette = []markColor{
	{"#2fbf71", "Green"}, {"#f5a623", "Amber"}, {"#2d9cdb", "Blue"}, {"#e5558d", "Pink"},
	{"#8b6cf0", "Violet"}, {"#14b8a6", "Teal"}, {"#ef6c3e", "Orange"}, {"#94a3b8", "Slate"},
}

func nextColor(used []string) string {
	for _, c := range palette {
		if !contains(used, c.Value) {
			return c.Value
		}
	}
	return palette[len(used)%len(palette)].Value
}

// inkOn picks dark or light text, whichever reads better on the colour.
func inkOn(hex string) string {
	n, err := strconv.ParseInt(strings.TrimPrefix(hex, "#"), 16, 32)
	if err != nil {
		return "#ffffff"
	}
	lin := func(c int64) float64 {
		v := float64(c) / 255
		if v <= 0.03928 {
			return v / 12.92
		}
		return math.Pow((v+0.055)/1.055, 2.4)
	}
	l := 0.2126*lin((n>>16)&255) + 0.7152*lin((n>>8)&255) + 0.0722*lin(n&255)
	if l > 0.3 {
		return "#0e231d"
	}
	return "#ffffff"
}

// ---------- steps ----------

type StepSpec struct {
	ID          string
	CatalogueID string
	Kind        string
	Label       string
	Tool        *string
	Icon        string
	Brand       string
	Current     *float64
	Future      *float64
	Share       *float64
	Presence    string
	Lever       string
	Note        *string
	After       string
	Before      string
	EdgeLabel   string
}

func catalogueEntry(id string) (*CatalogItem, error) {
	all := allCatalogue()
	for i := range all {
		if all[i].ID == id {
			return &all[i], nil
		}
	}
	return nil, fmt.Errorf("No catalogue entry \"%s\". Use list_catalogue to see what exists.", id)
}

func derivePresence(a, b string) string {
	if a == "current-only" || b == "current-only" {
		if a == "future-only" || b == "future-only" {
			return "both"
		}
		return "current-only"
	}
	if a == "future-only" || b == "future-only" {
		return "future-only"
	}
	return "both"
}

func (d *Doc) freeSpot(p Position) Position {
	for i := 0; i < 80; i++ {
		clash := false
		for _, n := range d.Nodes {
			if math.Abs(n.Position.X-p.X) < 196 && math.Abs(n.Position.Y-p.Y) < 64 {
				clash = true
				break
			}
		}
		if !clash {
			break
		}
		if d.Direction == "LR" {
			p.Y += 80
		} else {
			p.X += 232
		}
	}
	return Position{snap8(p.X), snap8(p.Y)}
}

func (d *Doc) addStep(s StepSpec) (*Node, error) {
	var base *CatalogItem
	if s.CatalogueID != "" {
		b, err := catalogueEntry(s.CatalogueID)
		if err != nil {
			return nil, err
		}
		base = b
	}
	kind := s.Kind
	if kind == "" && base != nil {
		kind = base.Kind
	}
	if kind == "" {
		kind = "step"
	}
	label := s.Label
	if label == "" && base != nil {
		label = base.Label
	}
	if label == "" {
		return nil, errors.New("A step needs a label, or a catalogue_id to take one from.")
	}
	id := s.ID
	if id == "" {
		id = slug(label)
	}
	id = uniqueID(d.nodeIDs(), id)

	var parent *Node
	forward := false
	if s.After != "" {
		p, err := d.findStep(s.After)
		if err != nil {
			return nil, err
		}
		parent, forward = p, true
	} else if s.Before != "" {
		p, err := d.findStep(s.Before)
		if err != nil {
			return nil, err
		}
		parent = p
	}
	pos := Position{}
	if parent != nil {
		pd := dims[parent.Data.Kind]
		nd := dims[kind]
		if d.Direction == "LR" {
			if forward {
				pos = Position{parent.Position.X + pd[0] + 60, parent.Position.Y}
			} else {
				pos = Position{parent.Position.X - (nd[0] + 60), parent.Position.Y}
			}
		} else {
			if forward {
				pos = Position{parent.Position.X, parent.Position.Y + pd[1] + 56}
			} else {
				pos = Position{parent.Position.X, parent.Position.Y - (nd[1] + 56)}
			}
		}
	} else if len(d.Nodes) > 0 {
		last := d.Nodes[len(d.Nodes)-1]
		ld := dims[last.Data.Kind]
		if d.Direction == "LR" {
			pos = Position{last.Position.X + ld[0] + 60, last.Position.Y}
		} else {
			pos = Position{last.Position.X, last.Position.Y + ld[1] + 56}
		}
	}

	data := NodeData{Kind: kind, Label: label, Share: 100, Presence: "both", Icon: defaultIcon[kind]}
	if base != nil {
		data.Tool, data.Icon, data.Brand = base.Tool, firstNonEmpty(base.Icon, data.Icon), base.Brand
		data.Current, data.Future, data.Presence, data.Lever = base.Current, base.Future, firstNonEmpty(base.Presence, "both"), base.Lever
	}
	if s.Tool != nil {
		data.Tool = *s.Tool
	}
	if s.Icon != "" {
		data.Icon = s.Icon
	}
	if s.Brand != "" {
		data.Brand = s.Brand
	}
	if s.Current != nil {
		data.Current = *s.Current
	}
	if s.Future != nil {
		data.Future = *s.Future
	} else if s.Current != nil && base == nil {
		data.Future = *s.Current
	}
	if s.Share != nil {
		data.Share = *s.Share
	}
	if s.Presence != "" {
		data.Presence = s.Presence
	}
	if s.Lever != "" {
		data.Lever = s.Lever
	}
	if s.Note != nil {
		data.Note = *s.Note
	}
	d.Nodes = append(d.Nodes, Node{ID: id, Type: "flow", Position: d.freeSpot(pos), Data: data})
	node := &d.Nodes[len(d.Nodes)-1]
	if s.After != "" {
		if _, err := d.connect(s.After, id, s.EdgeLabel, ""); err != nil {
			return nil, err
		}
	} else if s.Before != "" {
		if _, err := d.connect(id, s.Before, s.EdgeLabel, ""); err != nil {
			return nil, err
		}
	}
	return d.node(node.ID), nil
}

func firstNonEmpty(a ...string) string {
	for _, s := range a {
		if s != "" {
			return s
		}
	}
	return ""
}

type StepPatch struct {
	Kind, Label, Icon, Brand, Presence, Lever string
	Tool, Note                                *string
	Current, Future, Share                    *float64
}

func (d *Doc) updateStep(ref string, p StepPatch) (*Node, error) {
	n, err := d.findStep(ref)
	if err != nil {
		return nil, err
	}
	if p.Kind != "" {
		n.Data.Kind = p.Kind
	}
	if p.Label != "" {
		n.Data.Label = p.Label
	}
	if p.Icon != "" {
		n.Data.Icon = p.Icon
	}
	if p.Brand != "" {
		n.Data.Brand = p.Brand
	}
	if p.Presence != "" {
		n.Data.Presence = p.Presence
	}
	if p.Lever != "" {
		n.Data.Lever = p.Lever
	}
	if p.Tool != nil {
		n.Data.Tool = *p.Tool
	}
	if p.Note != nil {
		n.Data.Note = *p.Note
	}
	if p.Current != nil {
		n.Data.Current = *p.Current
	}
	if p.Future != nil {
		n.Data.Future = *p.Future
	}
	if p.Share != nil {
		n.Data.Share = *p.Share
	}
	return n, nil
}

func (d *Doc) removeStep(ref string) (string, error) {
	n, err := d.findStep(ref)
	if err != nil {
		return "", err
	}
	id := n.ID
	nodes := d.Nodes[:0:0]
	for _, x := range d.Nodes {
		if x.ID != id {
			nodes = append(nodes, x)
		}
	}
	d.Nodes = nodes
	edges := d.Edges[:0:0]
	for _, e := range d.Edges {
		if e.Source != id && e.Target != id {
			edges = append(edges, e)
		}
	}
	d.Edges = edges
	return id, nil
}

// ---------- connectors ----------

func handlesFor(dir string) (string, string) {
	if dir == "LR" {
		return "r", "l"
	}
	return "b", "t"
}

func (d *Doc) edgeBetween(a, b string) *Edge {
	for i := range d.Edges {
		if d.Edges[i].Source == a && d.Edges[i].Target == b {
			return &d.Edges[i]
		}
	}
	return nil
}

func (d *Doc) connect(from, to, label, line string) (*Edge, error) {
	a, err := d.findStep(from)
	if err != nil {
		return nil, err
	}
	b, err := d.findStep(to)
	if err != nil {
		return nil, err
	}
	if a.ID == b.ID {
		return nil, errors.New("A step cannot connect to itself.")
	}
	if e := d.edgeBetween(a.ID, b.ID); e != nil {
		if label != "" {
			e.Data.Label = label
		}
		if line != "" {
			e.Data.Line = line
		}
		return e, nil
	}
	outgoing := 0
	for _, e := range d.Edges {
		if e.Source == a.ID {
			outgoing++
		}
	}
	auto := ""
	if a.Data.Kind == "decision" {
		switch outgoing {
		case 0:
			auto = "Yes"
		case 1:
			auto = "No"
		}
	}
	if label == "" {
		label = auto
	}
	sh, th := handlesFor(d.Direction)
	d.Edges = append(d.Edges, Edge{
		ID: uniqueID(d.edgeIDs(), "e-"+a.ID+"-"+b.ID), Type: "flow", Source: a.ID, Target: b.ID,
		SourceHandle: sh, TargetHandle: th,
		Data: EdgeData{Presence: derivePresence(a.Data.Presence, b.Data.Presence), Label: label, Flows: []string{}, Line: line},
	})
	return &d.Edges[len(d.Edges)-1], nil
}

func (d *Doc) disconnect(from, to string) error {
	a, err := d.findStep(from)
	if err != nil {
		return err
	}
	b, err := d.findStep(to)
	if err != nil {
		return err
	}
	kept := d.Edges[:0:0]
	for _, e := range d.Edges {
		if !(e.Source == a.ID && e.Target == b.ID) {
			kept = append(kept, e)
		}
	}
	if len(kept) == len(d.Edges) {
		return fmt.Errorf("No connector from %s to %s.", a.ID, b.ID)
	}
	d.Edges = kept
	return nil
}

func (d *Doc) updateConnector(from, to, label string, setLabel bool, line, presence string) error {
	a, err := d.findStep(from)
	if err != nil {
		return err
	}
	b, err := d.findStep(to)
	if err != nil {
		return err
	}
	e := d.edgeBetween(a.ID, b.ID)
	if e == nil {
		return fmt.Errorf("No connector from %s to %s.", a.ID, b.ID)
	}
	if setLabel {
		e.Data.Label = label
	}
	if line != "" {
		e.Data.Line = line
	}
	if presence != "" {
		e.Data.Presence = presence
	}
	return nil
}

// ---------- flows ----------

// bridge finds the shortest directed route from `from` to any node in goals, as edge ids.
func (d *Doc) bridge(from string, goals map[string]bool, forward bool) []string {
	type item struct {
		id   string
		path []string
	}
	seen := map[string]bool{from: true}
	queue := []item{{from, nil}}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		for _, e := range d.Edges {
			a, b := e.Source, e.Target
			if !forward {
				a, b = b, a
			}
			if a != cur.id || seen[b] {
				continue
			}
			path := append(append([]string{}, cur.path...), e.ID)
			if goals[b] {
				return path
			}
			seen[b] = true
			queue = append(queue, item{b, path})
		}
	}
	return nil
}

// edgesForNodes: connectors between selected steps, with a lone selected step joined to the nearest other by the shortest route.
func (d *Doc) edgesForNodes(ids []string) []string {
	sel := map[string]bool{}
	for _, id := range ids {
		sel[id] = true
	}
	out := map[string]bool{}
	var order []string
	add := func(id string) {
		if !out[id] {
			out[id] = true
			order = append(order, id)
		}
	}
	touched := map[string]bool{}
	for _, e := range d.Edges {
		if sel[e.Source] && sel[e.Target] {
			add(e.ID)
			touched[e.Source], touched[e.Target] = true, true
		}
	}
	for _, id := range ids {
		if touched[id] || len(sel) < 2 {
			continue
		}
		goals := map[string]bool{}
		for _, o := range ids {
			if o != id {
				goals[o] = true
			}
		}
		path := d.bridge(id, goals, true)
		if path == nil {
			path = d.bridge(id, goals, false)
		}
		for _, p := range path {
			add(p)
		}
	}
	return order
}

func (d *Doc) findFlow(ref string) (*Flow, error) {
	for i := range d.Flows {
		if d.Flows[i].ID == ref || strings.EqualFold(d.Flows[i].Name, ref) {
			return &d.Flows[i], nil
		}
	}
	names := make([]string, len(d.Flows))
	for i, f := range d.Flows {
		names[i] = f.Name
	}
	have := "none"
	if len(names) > 0 {
		have = strings.Join(names, ", ")
	}
	return nil, fmt.Errorf("No flow \"%s\". Flows are: %s", ref, have)
}

func (d *Doc) createFlow(name string, steps, path []string, color string) (*Flow, error) {
	var edgeIDs []string
	if len(path) > 0 {
		nodes, err := d.findSteps(path)
		if err != nil {
			return nil, err
		}
		for i := 0; i+1 < len(nodes); i++ {
			e := d.edgeBetween(nodes[i].ID, nodes[i+1].ID)
			if e == nil {
				return nil, fmt.Errorf("No connector from %s to %s. Connect them first.", nodes[i].ID, nodes[i+1].ID)
			}
			edgeIDs = append(edgeIDs, e.ID)
		}
	} else if len(steps) > 0 {
		nodes, err := d.findSteps(steps)
		if err != nil {
			return nil, err
		}
		ids := make([]string, len(nodes))
		for i, n := range nodes {
			ids[i] = n.ID
		}
		edgeIDs = d.edgesForNodes(ids)
	}
	if len(edgeIDs) == 0 {
		return nil, errors.New("Those steps have no connectors between them, so there is no path to highlight.")
	}
	if color == "" {
		used := make([]string, len(d.Flows))
		for i, f := range d.Flows {
			used[i] = f.Color
		}
		color = nextColor(used)
	}
	ids := make([]string, len(d.Flows))
	for i, f := range d.Flows {
		ids[i] = f.ID
	}
	n := name
	if n == "" {
		n = fmt.Sprintf("Flow %d", len(d.Flows)+1)
	}
	flow := Flow{ID: uniqueID(ids, "f-"+slug(firstNonEmpty(name, "flow"))), Name: n, Color: color}
	d.Flows = append(d.Flows, flow)
	set := map[string]bool{}
	for _, id := range edgeIDs {
		set[id] = true
	}
	for i := range d.Edges {
		if set[d.Edges[i].ID] {
			d.Edges[i].Data.Flows = append(d.Edges[i].Data.Flows, flow.ID)
		}
	}
	return &d.Flows[len(d.Flows)-1], nil
}

func (d *Doc) deleteFlow(ref string) error {
	f, err := d.findFlow(ref)
	if err != nil {
		return err
	}
	id := f.ID
	flows := d.Flows[:0:0]
	for _, x := range d.Flows {
		if x.ID != id {
			flows = append(flows, x)
		}
	}
	d.Flows = flows
	for i := range d.Edges {
		kept := []string{}
		for _, x := range d.Edges[i].Data.Flows {
			if x != id {
				kept = append(kept, x)
			}
		}
		d.Edges[i].Data.Flows = kept
	}
	return nil
}

func (d *Doc) updateFlow(ref, name, color string) (*Flow, error) {
	f, err := d.findFlow(ref)
	if err != nil {
		return nil, err
	}
	if name != "" {
		f.Name = name
	}
	if color != "" {
		f.Color = color
	}
	return f, nil
}

// ---------- areas ----------

type ZoneSpec struct {
	Kind, Label, Color string
	Around             []string
	X, Y, W, H         *float64
}

func (d *Doc) addZone(s ZoneSpec) (*Zone, error) {
	if s.Kind == "" {
		s.Kind = "area"
	}
	color := s.Color
	if color == "" {
		used := make([]string, len(d.Zones))
		for i, z := range d.Zones {
			used[i] = z.Color
		}
		color = nextColor(used)
	}
	val := func(p *float64, def float64) float64 {
		if p != nil {
			return *p
		}
		return def
	}
	x, y := val(s.X, 0), val(s.Y, 0)
	w, h := val(s.W, 0), val(s.H, 0)
	if s.Kind == "area" {
		w, h = val(s.W, 360), val(s.H, 200)
	}
	if len(s.Around) > 0 {
		ns, err := d.findSteps(s.Around)
		if err != nil {
			return nil, err
		}
		const pad = 28.0
		minX, minY := math.Inf(1), math.Inf(1)
		maxX, maxY := math.Inf(-1), math.Inf(-1)
		for _, n := range ns {
			dd := dims[n.Data.Kind]
			minX, minY = math.Min(minX, n.Position.X), math.Min(minY, n.Position.Y)
			maxX, maxY = math.Max(maxX, n.Position.X+dd[0]), math.Max(maxY, n.Position.Y+dd[1])
		}
		if s.Kind == "area" {
			x, y = snap8(minX-pad), snap8(minY-pad-24)
			w, h = snap8(maxX-minX+pad*2), snap8(maxY-minY+pad*2+24)
		} else {
			x, y = snap8(minX), snap8(minY-48)
		}
	}
	ids := make([]string, len(d.Zones))
	for i, z := range d.Zones {
		ids[i] = z.ID
	}
	d.Zones = append(d.Zones, Zone{ID: uniqueID(ids, "z-"+slug(s.Label)), Kind: s.Kind, X: x, Y: y, W: w, H: h, Label: s.Label, Color: color})
	return &d.Zones[len(d.Zones)-1], nil
}

func (d *Doc) removeZone(ref string) error {
	kept := d.Zones[:0:0]
	found := false
	for _, z := range d.Zones {
		if !found && (z.ID == ref || strings.EqualFold(z.Label, ref)) {
			found = true
			continue
		}
		kept = append(kept, z)
	}
	if !found {
		return fmt.Errorf("No area or label \"%s\".", ref)
	}
	d.Zones = kept
	return nil
}

// ---------- whole diagrams ----------

type ConnSpec struct{ From, To, Label, Line string }
type FlowSpec struct {
	Name, Color string
	Steps, Path []string
}
type AreaSpec struct {
	Label, Color, Kind string
	Around             []string
}
type DiagramSpec struct {
	Title, Subtitle, Direction string
	RunsPerMonth, RatePerHour  *float64
	Steps                      []StepSpec
	Connections                []ConnSpec
	Flows                      []FlowSpec
	Areas                      []AreaSpec
}

func buildDoc(s DiagramSpec) (*Doc, error) {
	title := s.Title
	if title == "" {
		title = "Untitled process"
	}
	d := blankDoc(title)
	d.Subtitle = s.Subtitle
	if s.Direction == "TB" {
		d.Direction = "TB"
	}
	if s.RunsPerMonth != nil {
		d.RunsPerMonth = *s.RunsPerMonth
	}
	if s.RatePerHour != nil {
		d.RatePerHour = *s.RatePerHour
	}
	var links []ConnSpec
	for _, st := range s.Steps {
		if st.ID == "" {
			return nil, errors.New("Every step in build_diagram needs an id.")
		}
		after, before, el := st.After, st.Before, st.EdgeLabel
		st.After, st.Before, st.EdgeLabel = "", "", ""
		if _, err := d.addStep(st); err != nil {
			return nil, err
		}
		if after != "" {
			links = append(links, ConnSpec{From: after, To: st.ID, Label: el})
		}
		if before != "" {
			links = append(links, ConnSpec{From: st.ID, To: before, Label: el})
		}
	}
	for _, c := range append(links, s.Connections...) {
		if _, err := d.connect(c.From, c.To, c.Label, c.Line); err != nil {
			return nil, err
		}
	}
	d.autoLayout("")
	for _, f := range s.Flows {
		if _, err := d.createFlow(f.Name, f.Steps, f.Path, f.Color); err != nil {
			return nil, err
		}
	}
	for _, a := range s.Areas {
		if _, err := d.addZone(ZoneSpec{Kind: a.Kind, Label: a.Label, Color: a.Color, Around: a.Around}); err != nil {
			return nil, err
		}
	}
	return d, nil
}

func (d *Doc) autoLayout(direction string) {
	if direction != "" && direction != d.Direction {
		d.Direction = direction
		sh, th := handlesFor(direction)
		for i := range d.Edges {
			d.Edges[i].SourceHandle, d.Edges[i].TargetHandle = sh, th
		}
	}
	layoutNodes(d)
}

// ---------- time ----------

func fmtMins(m float64) string {
	if math.IsNaN(m) || math.IsInf(m, 0) || m <= 0 {
		return "0m"
	}
	if m < 1 {
		return fmt.Sprintf("%ds", int(math.Max(1, math.Round(m*60))))
	}
	if m < 60 {
		r := math.Round(m*10) / 10
		if r < 60 {
			if r == math.Trunc(r) {
				return fmt.Sprintf("%dm", int(r))
			}
			return strconv.FormatFloat(r, 'f', 1, 64) + "m"
		}
	}
	total := int(math.Round(m))
	h := total / 60
	mm := total - h*60
	if mm > 0 {
		return fmt.Sprintf("%dh %dm", h, mm)
	}
	return fmt.Sprintf("%dh", h)
}

func fmtDelta(m float64) string {
	if math.Abs(m) < 0.005 {
		return "0m"
	}
	sign := "+"
	if m < 0 {
		sign = "−"
	}
	return sign + fmtMins(math.Abs(m))
}

func stepMins(d NodeData, mode string) float64 {
	if mode == "current" {
		if d.Presence == "future-only" {
			return 0
		}
		return d.Current
	}
	if d.Presence == "current-only" {
		return 0
	}
	return d.Future
}

func stepSaved(d NodeData) float64 { return stepMins(d, "current") - stepMins(d, "future") }

func expectedEffort(nodes []Node, mode string) float64 {
	t := 0.0
	for _, n := range nodes {
		t += stepMins(n.Data, mode) * n.Data.Share / 100
	}
	return t
}

func longestStep(nodes []Node) float64 {
	m := 1.0
	for _, n := range nodes {
		m = math.Max(m, math.Max(n.Data.Current, n.Data.Future))
	}
	return m
}

// Overrides are ledger figures typed over the calculated ones: effort in minutes per run, hours a
// month and value a year. Unset figures are calculated.
type Overrides struct {
	Current       *float64 `json:"current,omitempty"`
	Future        *float64 `json:"future,omitempty"`
	HoursPerMonth *float64 `json:"hoursPerMonth,omitempty"`
	ValuePerYear  *float64 `json:"valuePerYear,omitempty"`
}

func pick(o *float64, calc float64) float64 {
	if o != nil && *o >= 0 && !math.IsInf(*o, 0) && !math.IsNaN(*o) {
		return *o
	}
	return calc
}

type Summary struct {
	Current       float64 `json:"current"`
	Future        float64 `json:"future"`
	Saved         float64 `json:"saved"`
	Pct           float64 `json:"pct"`
	HoursPerMonth float64 `json:"hoursPerMonth"`
	ValuePerYear  float64 `json:"valuePerYear"`
}

func (d *Doc) summary() Summary {
	o := d.Overrides
	if o == nil {
		o = &Overrides{}
	}
	cur := pick(o.Current, expectedEffort(d.Nodes, "current"))
	fut := pick(o.Future, expectedEffort(d.Nodes, "future"))
	saved := cur - fut
	pct := 0.0
	if cur > 0 {
		pct = saved / cur * 100
	}
	hpm := pick(o.HoursPerMonth, saved*d.RunsPerMonth/60)
	return Summary{cur, fut, saved, pct, hpm, pick(o.ValuePerYear, hpm*12*d.RatePerHour)}
}

type LeverSaving struct {
	Lever   string  `json:"lever"`
	Minutes float64 `json:"minutes"`
}

func (d *Doc) savedByLever() []LeverSaving {
	sums := map[string]float64{}
	for _, n := range d.Nodes {
		if n.Data.Kind == "input" || n.Data.Kind == "output" {
			continue
		}
		s := stepSaved(n.Data) * n.Data.Share / 100
		if s <= 0 {
			continue
		}
		k := n.Data.Lever
		if k == "" {
			k = "none"
		}
		sums[k] += s
	}
	var out []LeverSaving
	for _, k := range []string{"ai", "automation", "none"} {
		if sums[k] > 0.04 {
			out = append(out, LeverSaving{k, round2(sums[k])})
		}
	}
	return out
}

func round2(n float64) float64 { return math.Round(n*100) / 100 }

// ---------- reading it back ----------

type StepView struct {
	ID       string  `json:"id"`
	Kind     string  `json:"kind"`
	Label    string  `json:"label"`
	Tool     string  `json:"tool"`
	Current  float64 `json:"current"`
	Future   float64 `json:"future"`
	Saved    float64 `json:"saved"`
	Share    float64 `json:"share"`
	Presence string  `json:"presence"`
	Lever    string  `json:"lever"`
}
type ConnView struct {
	From  string   `json:"from"`
	To    string   `json:"to"`
	Label string   `json:"label"`
	Flows []string `json:"flows"`
}
type FlowView struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Color      string  `json:"color"`
	Connectors int     `json:"connectors"`
	Steps      int     `json:"steps"`
	Current    float64 `json:"current"`
	Future     float64 `json:"future"`
	Saved      float64 `json:"saved"`
}
type AreaView struct {
	ID    string `json:"id"`
	Kind  string `json:"kind"`
	Label string `json:"label"`
}
type Overview struct {
	Title      string        `json:"title"`
	Steps      []StepView    `json:"steps"`
	Connectors []ConnView    `json:"connectors"`
	Flows      []FlowView    `json:"flows"`
	Areas      []AreaView    `json:"areas"`
	Summary    Summary       `json:"summary"`
	SavedBy    []LeverSaving `json:"savedBy"`
}

func (d *Doc) overview() Overview {
	names := map[string]string{}
	for _, f := range d.Flows {
		names[f.ID] = f.Name
	}
	o := Overview{Title: d.Title, Steps: []StepView{}, Connectors: []ConnView{}, Flows: []FlowView{}, Areas: []AreaView{}, Summary: d.summary(), SavedBy: d.savedByLever()}
	if o.SavedBy == nil {
		o.SavedBy = []LeverSaving{}
	}
	for _, n := range d.Nodes {
		l := n.Data.Lever
		if l == "" {
			l = "none"
		}
		o.Steps = append(o.Steps, StepView{n.ID, n.Data.Kind, n.Data.Label, n.Data.Tool, n.Data.Current, n.Data.Future, round2(stepSaved(n.Data)), n.Data.Share, n.Data.Presence, l})
	}
	for _, e := range d.Edges {
		fl := []string{}
		for _, f := range e.Data.Flows {
			fl = append(fl, firstNonEmpty(names[f], f))
		}
		o.Connectors = append(o.Connectors, ConnView{e.Source, e.Target, e.Data.Label, fl})
	}
	for _, f := range d.Flows {
		c := 0
		for _, e := range d.Edges {
			if contains(e.Data.Flows, f.ID) {
				c++
			}
		}
		t := d.flowTotals(f.ID)
		o.Flows = append(o.Flows, FlowView{f.ID, f.Name, f.Color, c, t.Steps, round2(t.Current), round2(t.Future), round2(t.Saved)})
	}
	for _, z := range d.Zones {
		o.Areas = append(o.Areas, AreaView{z.ID, z.Kind, z.Label})
	}
	return o
}

func (d *Doc) markdown() string {
	s := d.summary()
	rows := []string{}
	for _, n := range d.Nodes {
		if n.Data.Kind == "output" {
			continue
		}
		saved := stepSaved(n.Data)
		change := "0m"
		if saved != 0 {
			change = fmtDelta(-saved)
		}
		rows = append(rows, fmt.Sprintf("| %s | %s | %s | %s | %v%% |", n.Data.Label, fmtMins(stepMins(n.Data, "current")), fmtMins(stepMins(n.Data, "future")), change, n.Data.Share))
	}
	names := make([]string, len(d.Flows))
	for i, f := range d.Flows {
		names[i] = f.Name
	}
	flows := "none"
	if len(names) > 0 {
		flows = strings.Join(names, ", ")
	}
	return strings.Join([]string{
		"### " + d.Title, "",
		"| Step | Now | After | Change | Share of runs |", "| --- | --- | --- | --- | --- |",
		strings.Join(rows, "\n"), "",
		fmt.Sprintf("Expected effort per run: %s now, %s after, %s saved (%d%%).", fmtMins(s.Current), fmtMins(s.Future), fmtMins(s.Saved), int(math.Round(s.Pct))),
		"", "Flows: " + flows,
	}, "\n")
}

// tidyJSON is the file form: two-space indent and a trailing newline, like the app writes it.
func (d *Doc) tidyJSON() []byte {
	d.normalise()
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	enc.SetIndent("", "  ")
	_ = enc.Encode(d) // Encode ends with a newline
	return buf.Bytes()
}

func sortedKeys(m map[string]bool) []string {
	k := make([]string, 0, len(m))
	for s := range m {
		k = append(k, s)
	}
	sort.Strings(k)
	return k
}
