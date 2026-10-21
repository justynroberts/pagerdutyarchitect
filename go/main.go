package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
)

var version = "0.2.0"

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
	if *dir != "" {
		diagramDir = *dir
	}
	diagramDir, _ = filepath.Abs(diagramDir)

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
