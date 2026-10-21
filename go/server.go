package main

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Serves the embedded web app and a small API on the diagrams folder, so a file changed by the MCP
// server (or an editor) shows up live in the browser, and changes made in the browser are written back.

type hub struct {
	mu      sync.Mutex
	clients map[chan string]bool
}

func (h *hub) add() chan string {
	c := make(chan string, 8)
	h.mu.Lock()
	h.clients[c] = true
	h.mu.Unlock()
	return c
}

func (h *hub) remove(c chan string) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
}

func (h *hub) send(msg string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for c := range h.clients {
		select {
		case c <- msg:
		default:
		}
	}
}

// watch polls the folder. Plain stat calls keep this to the standard library and behave the same on every OS.
func (h *hub) watch() {
	last := map[string]string{}
	for {
		cur := map[string]string{}
		if entries, err := os.ReadDir(diagramDir); err == nil {
			for _, e := range entries {
				isCat := e.Name() == catalogueFile
				if e.IsDir() || (!isCat && !strings.HasSuffix(e.Name(), fileExt)) {
					continue
				}
				if info, err := e.Info(); err == nil {
					key := strings.TrimSuffix(e.Name(), fileExt)
					if isCat {
						key = "\x00catalogue"
					}
					cur[key] = fmt.Sprintf("%d-%d", info.ModTime().UnixNano(), info.Size())
				}
			}
		}
		notify := func(name string) {
			if name == "\x00catalogue" {
				h.send(`{"catalogue":true}`)
				return
			}
			h.send(fmt.Sprintf(`{"name":%q}`, name))
		}
		for name, sig := range cur {
			if last[name] != sig {
				notify(name)
			}
		}
		for name := range last {
			if _, ok := cur[name]; !ok {
				notify(name)
			}
		}
		last = cur
		time.Sleep(350 * time.Millisecond)
	}
}

func allowedHost(host string, listen string) bool {
	h, _, err := net.SplitHostPort(host)
	if err != nil {
		h = host
	}
	h = strings.Trim(h, "[]")
	if h == "localhost" || h == "127.0.0.1" || h == "::1" {
		return true
	}
	lh, _, _ := net.SplitHostPort(listen)
	return lh != "" && lh != "127.0.0.1" && lh != "localhost" && lh != "::1" // opted in to a wider bind
}

func newHandler(listen string) (http.Handler, *hub) {
	h := &hub{clients: map[chan string]bool{}}
	go h.watch()
	mux := http.NewServeMux()

	mux.HandleFunc("/api/diagrams/events", func(w http.ResponseWriter, r *http.Request) {
		fl, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", 500)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		fmt.Fprint(w, ": connected\n\n")
		fl.Flush()
		c := h.add()
		defer h.remove(c)
		keep := time.NewTicker(20 * time.Second)
		defer keep.Stop()
		for {
			select {
			case msg := <-c:
				fmt.Fprintf(w, "data: %s\n\n", msg)
				fl.Flush()
			case <-keep.C:
				fmt.Fprint(w, ": ping\n\n")
				fl.Flush()
			case <-r.Context().Done():
				return
			}
		}
	})

	mux.HandleFunc("/api/catalogue", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			items := loadCustom()
			if items == nil {
				items = []CatalogItem{}
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(items)
		case http.MethodPut:
			b, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
			var items []CatalogItem
			if err != nil || json.Unmarshal(b, &items) != nil {
				http.Error(w, "Bad catalogue", 400)
				return
			}
			if err := saveCustom(items); err != nil {
				http.Error(w, "Could not save", 500)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "Method not allowed", 405)
		}
	})

	mux.HandleFunc("/api/diagrams", func(w http.ResponseWriter, r *http.Request) {
		type row struct {
			Name    string  `json:"name"`
			Updated float64 `json:"updated"`
		}
		rows := []row{}
		for _, d := range listDiagrams() {
			rows = append(rows, row{d.Name, float64(d.Updated.UnixMilli())})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(rows)
	})

	mux.HandleFunc("/api/diagrams/", func(w http.ResponseWriter, r *http.Request) {
		raw := strings.TrimPrefix(r.URL.Path, "/api/diagrams/")
		name, err := nameOf(raw)
		if err != nil || name != raw {
			http.NotFound(w, r)
			return
		}
		p, _ := pathFor(name)
		switch r.Method {
		case http.MethodGet:
			b, err := os.ReadFile(p)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write(b)
		case http.MethodPut:
			b, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
			if err != nil {
				http.Error(w, "Bad diagram", 400)
				return
			}
			d, err := parseDoc(b)
			if err != nil {
				http.Error(w, "Bad diagram", 400)
				return
			}
			if err := writeFileAtomic(p, d.tidyJSON()); err != nil {
				http.Error(w, "Could not save", 500)
				return
			}
			w.WriteHeader(http.StatusNoContent)
		default:
			http.Error(w, "Method not allowed", 405)
		}
	})

	root := webRoot()
	files := http.FileServer(http.FS(root))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if root == nil {
			http.Error(w, "No web app embedded in this build.", 500)
			return
		}
		if _, err := fs.Stat(root, "index.html"); err != nil {
			http.Error(w, "This build has no web app inside. Build with scripts/build-go.sh.", 500)
			return
		}
		p := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(root, p); err != nil {
			r.URL.Path = "/" // single page app: unknown paths get the app
		}
		if strings.HasPrefix(p, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		files.ServeHTTP(w, r)
	})

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Guards against DNS rebinding: a web page elsewhere cannot talk to a local server by pointing its own name at 127.0.0.1.
		if !allowedHost(r.Host, listen) {
			http.Error(w, "Forbidden host", http.StatusForbidden)
			return
		}
		if r.Method == http.MethodPut && !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
			http.Error(w, "Expected JSON", http.StatusUnsupportedMediaType)
			return
		}
		mux.ServeHTTP(w, r)
	}), h
}

func serve(host string, port int, open bool) error {
	listen := net.JoinHostPort(host, fmt.Sprint(port))
	handler, _ := newHandler(listen)
	ln, err := net.Listen("tcp", listen)
	if err != nil {
		return fmt.Errorf("could not listen on %s: %w (is another copy running? try --port)", listen, err)
	}
	abs, _ := filepath.Abs(diagramDir)
	url := fmt.Sprintf("http://localhost:%d", port)
	fmt.Fprintf(os.Stderr, "PagerDuty Architect %s\n  app       %s\n  diagrams  %s\n  mcp       %s mcp\n", version, url, abs, os.Args[0])
	if open {
		openBrowser(url)
	}
	return http.Serve(ln, handler)
}
