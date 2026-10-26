package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

var version = "0.3.7"

const usage = `PagerDuty Architect: process diagrams that show time saved, as a single binary.

  dwell                     open the app in your browser (http://localhost:5817) and follow the diagrams folder
  dwell mcp                 run the MCP server on stdio, for Claude and other MCP clients
  dwell version

Flags (before or after the command):
  --dir DIR     where diagrams live (default ./diagrams, or $DWELL_DIR)
  --port N      port for the app (default 5817)
  --host ADDR   address to listen on (default 127.0.0.1; only widen it on a network you trust)
  --open=false  don't open the app in your browser (it opens by default)
`

// resolveDir picks the diagrams folder. A folder that was asked for must be writable, or we stop now
// rather than fail on every save. The default ./diagrams falls back to ~/Documents when the current
// folder is read-only, as it is when run from inside the disk image or by a client started in /.
func resolveDir(asked string) (string, error) {
	if asked != "" {
		abs, _ := filepath.Abs(asked)
		if err := writable(abs); err != nil {
			return "", fmt.Errorf("can't save diagrams in %s: %w", abs, err)
		}
		return abs, nil
	}
	abs, _ := filepath.Abs(diagramDir)
	if writable(abs) == nil {
		return abs, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("can't save diagrams in %s and there is no home folder to fall back to; pass --dir", abs)
	}
	alt := filepath.Join(home, "Documents", "PagerDuty Architect")
	if err := writable(alt); err != nil {
		return "", fmt.Errorf("can't save diagrams in %s or %s: %w; pass --dir", abs, alt, err)
	}
	return alt, nil
}

// writable creates the folder if needed and proves a file can be written there.
func writable(dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	f, err := os.CreateTemp(dir, ".dwell-write-check-*")
	if err != nil {
		return err
	}
	f.Close()
	return os.Remove(f.Name())
}

func main() {
	cmd := "serve"
	argv := os.Args[1:]
	if len(argv) > 0 && len(argv[0]) > 0 && argv[0][0] != '-' {
		cmd, argv = argv[0], argv[1:]
	}
	fs := flag.NewFlagSet("dwell", flag.ExitOnError)
	fs.Usage = func() { fmt.Fprint(os.Stderr, usage) }
	dir := fs.String("dir", os.Getenv("DWELL_DIR"), "diagrams folder")
	port := fs.Int("port", 5817, "port")
	host := fs.String("host", "127.0.0.1", "listen address")
	open := fs.Bool("open", true, "open the browser")
	_ = fs.Parse(argv)
	if cmd == "serve" || cmd == "mcp" {
		d, err := resolveDir(*dir)
		if err != nil {
			fmt.Fprintln(os.Stderr, "dwell:", err)
			os.Exit(1)
		}
		diagramDir = d
	}

	switch cmd {
	case "serve":
		if err := serve(*host, *port, *open); err != nil {
			fmt.Fprintln(os.Stderr, "dwell:", err)
			os.Exit(1)
		}
	case "mcp":
		if err := runMCP(os.Stdin, os.Stdout); err != nil {
			fmt.Fprintln(os.Stderr, "dwell mcp:", err)
			os.Exit(1)
		}
	case "version":
		fmt.Println("dwell", version)
	case "help":
		fmt.Print(usage)
	default:
		fmt.Fprintf(os.Stderr, "dwell: unknown command %q\n\n%s", cmd, usage)
		os.Exit(2)
	}
}
