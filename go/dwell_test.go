package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func f(v float64) *float64 { return &v }

func tmpDir(t *testing.T) {
	t.Helper()
	old := diagramDir
	diagramDir = t.TempDir()
	t.Cleanup(func() { diagramDir = old })
}

func TestSampleRoundTrips(t *testing.T) {
	d := sampleDoc()
	if len(d.Nodes) != 19 || len(d.Edges) == 0 {
		t.Fatalf("sample looks wrong: %d nodes, %d edges", len(d.Nodes), len(d.Edges))
	}
	back, err := parseDoc(d.tidyJSON())
	if err != nil {
		t.Fatal(err)
	}
	a, _ := json.Marshal(d)
	b, _ := json.Marshal(back)
	if !bytes.Equal(a, b) {
		t.Fatal("sample changed after a write and read")
	}
	// Same figures the app shows for the sample.
	s := d.summary()
	if fmtMins(s.Current) != "1h 27m" || fmtMins(s.Future) != "28.4m" {
		t.Fatalf("totals differ from the app: %s now, %s after", fmtMins(s.Current), fmtMins(s.Future))
	}
}

func TestFormatting(t *testing.T) {
	cases := map[float64]string{0.5: "30s", 14: "14m", 1.5: "1.5m", 135: "2h 15m", 60: "1h", 0: "0m", 59.96: "1h"}
	for in, want := range cases {
		if got := fmtMins(in); got != want {
			t.Errorf("fmtMins(%v) = %q, want %q", in, got, want)
		}
	}
	if fmtDelta(-3) != "−3m" || fmtDelta(2) != "+2m" {
		t.Error("fmtDelta")
	}
}

func TestBuildDiagram(t *testing.T) {
	d, err := buildDoc(DiagramSpec{
		Title: "Alerts",
		Steps: []StepSpec{
			{ID: "a", CatalogueID: "in-alert"},
			{ID: "b", CatalogueID: "st-triage", After: "a"},
			{ID: "c", CatalogueID: "au-paige", After: "b", Lever: "ai"},
			{ID: "q", Kind: "decision", Label: "Fixed?", After: "c"},
			{ID: "y", Kind: "output", Label: "Resolved", After: "q"},
			{ID: "n", Kind: "step", Label: "Escalate", After: "q", Current: f(20), Future: f(5), Lever: "automation"},
		},
		Flows: []FlowSpec{{Name: "Happy path", Steps: []string{"a", "y"}}},
		Areas: []AreaSpec{{Label: "AI assisted", Around: []string{"b", "c"}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Nodes) != 6 || len(d.Edges) != 5 || len(d.Flows) != 1 || len(d.Zones) != 1 {
		t.Fatalf("shape: %d nodes %d edges %d flows %d zones", len(d.Nodes), len(d.Edges), len(d.Flows), len(d.Zones))
	}
	if d.edgeBetween("q", "y").Data.Label != "Yes" || d.edgeBetween("q", "n").Data.Label != "No" {
		t.Error("decision exits should be labelled Yes then No")
	}
	for _, e := range d.Edges {
		a, b := d.node(e.Source), d.node(e.Target)
		if b.Position.X <= a.Position.X {
			t.Errorf("left to right broken on %s", e.ID)
		}
	}
	// Nothing overlaps.
	for i, p := range d.Nodes {
		for _, q := range d.Nodes[i+1:] {
			dp, dq := dims[p.Data.Kind], dims[q.Data.Kind]
			if p.Position.X < q.Position.X+dq[0] && q.Position.X < p.Position.X+dp[0] && p.Position.Y < q.Position.Y+dq[1] && q.Position.Y < p.Position.Y+dp[1] {
				t.Errorf("%s overlaps %s", p.ID, q.ID)
			}
		}
	}
	if d.node("c").Data.Lever != "ai" {
		t.Error("lever lost")
	}
}

func TestLayoutHandlesCyclesAndFlip(t *testing.T) {
	d := sampleDoc()
	d.connect("n-done", "n-alert", "", "") // a loop back
	d.autoLayout("TB")
	if d.Direction != "TB" || d.Edges[0].SourceHandle != "b" {
		t.Error("flip did not update handles")
	}
	for _, n := range d.Nodes {
		if n.Position.X < 0 || n.Position.Y < 0 {
			t.Errorf("negative position for %s", n.ID)
		}
	}
}

func TestFlows(t *testing.T) {
	d := sampleDoc()
	fl, err := d.createFlow("Fix", nil, []string{"n-quick", "n-fix", "n-log"}, "#e5558d")
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, e := range d.Edges {
		if contains(e.Data.Flows, fl.ID) {
			n++
		}
	}
	if n != 2 {
		t.Errorf("flow covers %d connectors, want 2", n)
	}
	if _, err := d.createFlow("Bad", nil, []string{"n-alert", "n-log"}, ""); err == nil || !strings.Contains(err.Error(), "Connect them first") {
		t.Errorf("broken path should be refused: %v", err)
	}
	// Skipping the middle still gives one flow.
	if _, err := d.createFlow("Skip", []string{"n-alert", "n-done"}, nil, ""); err != nil {
		t.Errorf("bridge: %v", err)
	}
	if err := d.deleteFlow("Fix"); err != nil {
		t.Fatal(err)
	}
	for _, e := range d.Edges {
		if contains(e.Data.Flows, fl.ID) {
			t.Error("flow still on a connector")
		}
	}
}

func TestStepsByLabelAndErrors(t *testing.T) {
	d := sampleDoc()
	if _, err := d.addStep(StepSpec{Label: "Page the owner", Current: f(5), Future: f(1), After: "Carry out fix"}); err != nil {
		t.Fatal(err)
	}
	if _, err := d.connect("nope", "Carry out fix", "", ""); err == nil || !strings.Contains(err.Error(), `No step "nope"`) {
		t.Errorf("unhelpful error: %v", err)
	}
	if _, err := d.removeStep("n-log"); err != nil {
		t.Fatal(err)
	}
	for _, e := range d.Edges {
		if e.Source == "n-log" || e.Target == "n-log" {
			t.Error("connector left behind")
		}
	}
	if _, err := d.addStep(StepSpec{}); err == nil {
		t.Error("a step with no label should be refused")
	}
}

func TestSVG(t *testing.T) {
	d := sampleDoc()
	for _, mode := range []string{"current", "future"} {
		for _, theme := range []string{"green", "light", "dark"} {
			svg := renderSVG(d, mode, theme)
			if !strings.HasPrefix(svg, "<svg") || !strings.Contains(svg, "Alert engagement") || strings.Count(svg, "<svg")-strings.Count(svg, "</svg>") != 0 {
				t.Fatalf("%s/%s: bad svg", mode, theme)
			}
		}
	}
	if !strings.Contains(renderSVG(d, "future", "green"), ">AI<") {
		t.Error("AI chip missing in the future state")
	}
	if strings.Contains(renderSVG(d, "current", "green"), ">AI<") {
		t.Error("AI chip should only show in the future state")
	}
}

// rpc drives the server the way a client would.
func rpc(t *testing.T, msgs ...string) []map[string]any {
	t.Helper()
	var out bytes.Buffer
	if err := runMCP(strings.NewReader(strings.Join(msgs, "\n")+"\n"), &out); err != nil {
		t.Fatal(err)
	}
	var res []map[string]any
	for _, l := range strings.Split(strings.TrimSpace(out.String()), "\n") {
		if l == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(l), &m); err != nil {
			t.Fatalf("bad json line %q", l)
		}
		res = append(res, m)
	}
	return res
}

func call(id int, name string, a any) string {
	b, _ := json.Marshal(M{"jsonrpc": "2.0", "id": id, "method": "tools/call", "params": M{"name": name, "arguments": a}})
	return string(b)
}

func text(r map[string]any) (string, bool) {
	res := r["result"].(map[string]any)
	c := res["content"].([]any)[0].(map[string]any)["text"].(string)
	e, _ := res["isError"].(bool)
	return c, e
}

func TestMCPSession(t *testing.T) {
	tmpDir(t)
	out := rpc(t,
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`,
		call(3, "build_diagram", M{"name": "Deploy", "title": "Release", "steps": []M{
			{"id": "a", "catalogue_id": "in-alert"},
			{"id": "b", "catalogue_id": "st-triage", "after": "a"},
			{"id": "c", "kind": "output", "label": "Done", "after": "b"},
		}, "flows": []M{{"name": "Main", "steps": []string{"a", "c"}}}}),
		call(4, "set_lever", M{"diagram": "deploy", "steps": []string{"b"}, "lever": "ai"}),
		call(5, "connect", M{"diagram": "deploy", "from": "zzz", "to": "b"}),
		call(6, "add_step", M{"diagram": "deploy", "label": "X", "current": -3}),
		call(7, "export_diagram", M{"name": "deploy", "format": "svg", "mode": "future"}),
		call(8, "export_diagram", M{"name": "deploy", "format": "png"}),
		call(9, "get_diagram", M{"name": "deploy"}),
		`{"jsonrpc":"2.0","id":10,"method":"nope"}`,
	)
	if len(out) != 10 { // the notification gets no reply
		t.Fatalf("got %d replies, want 10", len(out))
	}
	if out[0]["result"].(map[string]any)["protocolVersion"] != "2025-03-26" {
		t.Error("should echo a supported protocol version")
	}
	if n := len(out[1]["result"].(map[string]any)["tools"].([]any)); n != 23 {
		t.Errorf("%d tools, want 23", n)
	}
	if s, bad := text(out[2]); bad || !strings.Contains(s, "Built deploy") {
		t.Errorf("build: %q", s)
	}
	if s, bad := text(out[3]); bad || !strings.Contains(s, "Tagged b as ai") {
		t.Errorf("lever: %q", s)
	}
	if s, bad := text(out[4]); !bad || !strings.Contains(s, `No step "zzz"`) {
		t.Errorf("bad step should be a readable error: %q", s)
	}
	if s, bad := text(out[5]); !bad || !strings.Contains(s, "negative") {
		t.Errorf("negative time: %q", s)
	}
	if s, bad := text(out[6]); bad || !strings.Contains(s, "deploy-future.svg") {
		t.Errorf("svg: %q", s)
	}
	if _, bad := text(out[7]); !bad {
		t.Error("png should explain it is unavailable")
	}
	if s, _ := text(out[8]); !strings.Contains(s, `"lever": "ai"`) {
		t.Errorf("overview: %q", s)
	}
	if out[9]["error"].(map[string]any)["code"].(float64) != -32601 {
		t.Error("unknown method should be -32601")
	}
	if _, err := os.Stat(diagramDir + "/exports/deploy-future.svg"); err != nil {
		t.Error("export file missing")
	}
}

func TestServerAPI(t *testing.T) {
	tmpDir(t)
	h, _ := newHandler("127.0.0.1:5817")
	srv := httptest.NewServer(h)
	defer srv.Close()
	do := func(method, path, body string) (*http.Response, string) {
		req, _ := http.NewRequest(method, srv.URL+path, strings.NewReader(body))
		if body != "" {
			req.Header.Set("Content-Type", "application/json")
		}
		req.Host = "localhost:5817"
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		b, _ := io.ReadAll(res.Body)
		res.Body.Close()
		return res, string(b)
	}
	if r, b := do("GET", "/api/diagrams", ""); r.StatusCode != 200 || strings.TrimSpace(b) != "[]" {
		t.Errorf("empty list: %d %q", r.StatusCode, b)
	}
	if r, _ := do("GET", "/api/diagrams/nothing", ""); r.StatusCode != 404 {
		t.Error("missing file should 404")
	}
	if r, _ := do("PUT", "/api/diagrams/mine", `{"hello":1}`); r.StatusCode != 400 {
		t.Error("non-diagram should be refused")
	}
	if r, _ := do("PUT", "/api/diagrams/mine", string(sampleDoc().tidyJSON())); r.StatusCode != 204 {
		t.Error("save failed")
	}
	if r, b := do("GET", "/api/diagrams/mine", ""); r.StatusCode != 200 || !strings.Contains(b, "Alert engagement") {
		t.Error("read back failed")
	}
	if r, _ := do("GET", "/api/diagrams/..%2Fetc%2Fpasswd", ""); r.StatusCode == 200 {
		t.Error("path traversal")
	}
	// A page on another site that points its own name at this machine must be refused.
	req, _ := http.NewRequest("GET", srv.URL+"/api/diagrams", nil)
	req.Host = "evil.example"
	if res, _ := http.DefaultClient.Do(req); res.StatusCode != 403 {
		t.Errorf("rebinding host got %d", res.StatusCode)
	}
	req2, _ := http.NewRequest("PUT", srv.URL+"/api/diagrams/mine", strings.NewReader("x"))
	req2.Header.Set("Content-Type", "text/plain")
	req2.Host = "localhost:5817"
	if res, _ := http.DefaultClient.Do(req2); res.StatusCode != 415 {
		t.Errorf("non-json put got %d", res.StatusCode)
	}
}

func TestCustomCatalogue(t *testing.T) {
	tmpDir(t)
	out := rpc(t,
		call(1, "add_catalogue_item", M{"id": "mo-honeycomb", "kind": "input", "label": "Honeycomb trigger", "tool": "Honeycomb", "current": 2, "future": 0.5, "category": "Monitoring"}),
		call(2, "add_catalogue_item", M{"id": "Bad Id", "kind": "input", "label": "x", "current": 1, "future": 1}),
		call(3, "list_catalogue", M{"query": "honeycomb"}),
		call(4, "build_diagram", M{"name": "h", "steps": []M{{"id": "a", "catalogue_id": "mo-honeycomb"}}}),
		call(5, "remove_catalogue_item", M{"id": "st-triage"}),
		call(6, "remove_catalogue_item", M{"id": "mo-honeycomb"}),
	)
	if s, bad := text(out[0]); bad || !strings.Contains(s, "Saved") {
		t.Errorf("add: %q", s)
	}
	if _, bad := text(out[1]); !bad {
		t.Error("a bad id should be refused")
	}
	if s, _ := text(out[2]); !strings.Contains(s, "mo-honeycomb") {
		t.Errorf("custom item not listed: %q", s)
	}
	if s, bad := text(out[3]); bad {
		t.Errorf("custom catalogue_id not usable: %q", s)
	}
	if _, bad := text(out[4]); !bad {
		t.Error("built-ins must not be removable")
	}
	if _, bad := text(out[5]); bad {
		t.Error("custom item should be removable")
	}
	if len(loadCustom()) != 0 {
		t.Error("catalogue file should be empty again")
	}
}
