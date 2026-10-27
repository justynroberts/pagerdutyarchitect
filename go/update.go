package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// The Mac app's update feed. The browser cannot read it (no CORS on GitHub's release downloads), so the
// page asks dwell, which reads it and says whether a newer version is out.
const (
	updateFeed  = "https://github.com/justynroberts/pagerdutyarchitect/releases/latest/download/appcast.xml"
	releasePage = "https://github.com/justynroberts/pagerdutyarchitect/releases/latest"
	// The Mac app registers this scheme; opening it brings the app forward with Sparkle's update window.
	appUpdateURL = "pagerduty-architect://check-for-updates"
)

type updateInfo struct {
	Version   string `json:"version"`
	Latest    string `json:"latest,omitempty"`
	Available bool   `json:"available"`
	// InApp is true when the Mac app started dwell, so it can install the update itself.
	InApp bool   `json:"inApp"`
	Page  string `json:"page"`
}

var (
	updateMu      sync.Mutex
	updateLatest  string
	updateChecked time.Time
	feedVersion   = regexp.MustCompile(`<sparkle:shortVersionString>([^<]+)</sparkle:shortVersionString>`)
)

// latestVersion reads the feed at most every ten minutes; on failure it keeps what it last knew.
func latestVersion(force bool) string {
	updateMu.Lock()
	defer updateMu.Unlock()
	if !force && time.Since(updateChecked) < 10*time.Minute {
		return updateLatest
	}
	updateChecked = time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, updateFeed, nil)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return updateLatest
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if m := feedVersion.FindSubmatch(b); res.StatusCode == 200 && m != nil {
		updateLatest = strings.TrimSpace(string(m[1]))
	}
	return updateLatest
}

// newer reports whether version a is later than b, comparing each dotted part as a number (0.3.10 > 0.3.9).
func newer(a, b string) bool {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			return x > y
		}
	}
	return false
}

func inMacApp() bool { return os.Getenv("PDA_APP") == "1" }

func handleUpdate(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		latest := latestVersion(r.URL.Query().Get("check") == "1")
		info := updateInfo{Version: version, Latest: latest, Available: latest != "" && newer(latest, version), InApp: inMacApp(), Page: releasePage}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		_ = json.NewEncoder(w).Encode(info)
	case http.MethodPost:
		// Only the Mac app can install; anywhere else the page links to the download instead.
		if !inMacApp() {
			http.Error(w, "Not running in the Mac app", http.StatusConflict)
			return
		}
		if err := exec.Command("open", appUpdateURL).Run(); err != nil {
			http.Error(w, "Could not reach the app", http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}
