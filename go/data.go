package main

import (
	"embed"
	"encoding/json"
	"io/fs"
)

//go:embed data/catalogue.json data/sample.json data/meta.json data/waves.png
var dataFS embed.FS

//go:embed all:web
var webFS embed.FS

type Meta struct {
	Icons       []string `json:"icons"`
	Brands      []string `json:"brands"`
	LogoPath    string   `json:"logoPath"`
	LogoViewBox string   `json:"logoViewBox"`
	LogoRatio   float64  `json:"logoRatio"`
}

var (
	catalogue []CatalogItem
	meta      Meta
	sample    []byte
)

func init() {
	must := func(name string, v any) {
		b, err := dataFS.ReadFile(name)
		if err != nil {
			panic(err)
		}
		if err := json.Unmarshal(b, v); err != nil {
			panic(name + ": " + err.Error())
		}
	}
	must("data/catalogue.json", &catalogue)
	must("data/meta.json", &meta)
	sample, _ = dataFS.ReadFile("data/sample.json")
}

func sampleDoc() *Doc {
	d, err := parseDoc(sample)
	if err != nil {
		panic(err)
	}
	return d
}

func webRoot() fs.FS {
	sub, err := fs.Sub(webFS, "web")
	if err != nil {
		return nil
	}
	return sub
}
