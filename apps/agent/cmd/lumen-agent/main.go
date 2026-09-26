// Command lumen-agent runs on every server Lumen manages. In Phase 00 it only
// reports its version; the connection, heartbeat and reconciliation loops
// arrive in Phases 02 and 03.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/version"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("lumen-agent", flag.ContinueOnError)
	fs.SetOutput(stderr)
	showVersion := fs.Bool("version", false, "print the version and exit")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *showVersion {
		fmt.Fprintln(stdout, version.String("lumen-agent"))
		return 0
	}
	fmt.Fprintln(stderr, "lumen-agent: nothing to run yet. Use --version.")
	return 2
}
