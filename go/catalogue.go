package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"regexp"
)

// Custom catalogue items live in <diagrams>/catalogue.json, shared with the web app and the Node MCP server.

const catalogueFile = "catalogue.json"

func cataloguePath() string { return filepath.Join(diagramDir, catalogueFile) }

func loadCustom() []CatalogItem {
	b, err := os.ReadFile(cataloguePath())
	if err != nil {
		return nil
	}
	var items []CatalogItem
	if json.Unmarshal(b, &items) != nil {
		return nil
	}
	return items
}

func saveCustom(items []CatalogItem) error {
	if items == nil {
		items = []CatalogItem{}
	}
	b, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomic(cataloguePath(), append(b, '\n'))
}

// allCatalogue is the built-in steps plus custom ones; a custom item with a built-in id replaces it.
func allCatalogue() []CatalogItem {
	custom := loadCustom()
	ids := map[string]bool{}
	for _, c := range custom {
		ids[c.ID] = true
	}
	out := make([]CatalogItem, 0, len(catalogue)+len(custom))
	for _, c := range catalogue {
		if !ids[c.ID] {
			out = append(out, c)
		}
	}
	return append(out, custom...)
}

var itemID = regexp.MustCompile(`^[a-z0-9][a-z0-9-]*$`)

func addCatalogueItem(item CatalogItem) error {
	if !itemID.MatchString(item.ID) {
		return errors.New("id must be lowercase letters, numbers and dashes, e.g. mo-honeycomb")
	}
	if item.Label == "" {
		return errors.New("label is required")
	}
	if item.Icon == "" {
		item.Icon = defaultIcon[item.Kind]
	}
	if item.Presence == "" {
		item.Presence = "both"
	}
	if item.Category == "" {
		item.Category = "Other"
	}
	kept := []CatalogItem{}
	for _, c := range loadCustom() {
		if c.ID != item.ID {
			kept = append(kept, c)
		}
	}
	return saveCustom(append(kept, item))
}

func removeCatalogueItem(id string) error {
	custom := loadCustom()
	kept := []CatalogItem{}
	for _, c := range custom {
		if c.ID != id {
			kept = append(kept, c)
		}
	}
	if len(kept) == len(custom) {
		return errors.New("No custom item \"" + id + "\". Built-in items stay.")
	}
	return saveCustom(kept)
}
