package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Diagram files on disk. The web app and the MCP server both work on this folder.

const fileExt = ".dwell.json"

var diagramDir = "diagrams"

var badName = regexp.MustCompile(`[^a-z0-9._-]+`)

func nameOf(input string) (string, error) {
	n := strings.TrimSpace(strings.ToLower(input))
	n = strings.TrimSuffix(strings.TrimSuffix(n, ".dwell.json"), ".json")
	n = strings.Trim(badName.ReplaceAllString(n, "-"), "-")
	if n == "" || strings.HasPrefix(n, ".") {
		return "", fmt.Errorf("\"%s\" is not a usable diagram name. Use letters, numbers and dashes.", input)
	}
	return n, nil
}

func pathFor(name string) (string, error) {
	n, err := nameOf(name)
	if err != nil {
		return "", err
	}
	return filepath.Join(diagramDir, n+fileExt), nil
}

type DiagramInfo struct {
	Name    string `json:"name"`
	Title   string
	Steps   int
	Updated time.Time
}

func listDiagrams() []DiagramInfo {
	entries, err := os.ReadDir(diagramDir)
	if err != nil {
		return nil
	}
	var out []DiagramInfo
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), fileExt) {
			continue
		}
		full := filepath.Join(diagramDir, e.Name())
		info, err := e.Info()
		if err != nil {
			continue
		}
		di := DiagramInfo{Name: strings.TrimSuffix(e.Name(), fileExt), Title: "(unreadable)", Updated: info.ModTime()}
		if b, err := os.ReadFile(full); err == nil {
			if d, err := parseDoc(b); err == nil {
				di.Title, di.Steps = d.Title, len(d.Nodes)
			}
		}
		out = append(out, di)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Updated.After(out[j].Updated) })
	return out
}

func readDiagram(name string) (*Doc, error) {
	p, err := pathFor(name)
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		n, _ := nameOf(name)
		have := []string{}
		for _, d := range listDiagrams() {
			have = append(have, d.Name)
		}
		hint := "None exist yet, use create_diagram first."
		if len(have) > 0 {
			hint = "Available: " + strings.Join(have, ", ") + "."
		}
		return nil, fmt.Errorf("No diagram called \"%s\". %s", n, hint)
	}
	if err != nil {
		return nil, err
	}
	d, err := parseDoc(b)
	if err != nil {
		n, _ := nameOf(name)
		return nil, fmt.Errorf("%s: %s", n, err.Error())
	}
	return d, nil
}

// writeFileAtomic writes next to the target and renames, so a reader never sees half a file.
func writeFileAtomic(p string, b []byte) error {
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

func writeDiagram(name string, d *Doc) (string, error) {
	p, err := pathFor(name)
	if err != nil {
		return "", err
	}
	return p, writeFileAtomic(p, d.tidyJSON())
}

func diagramExists(name string) bool {
	p, err := pathFor(name)
	if err != nil {
		return false
	}
	_, err = os.Stat(p)
	return err == nil
}
