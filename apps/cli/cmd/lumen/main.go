// Command lumen is the Lumen CLI. In Phase 00 it only reports its version; the
// commands from SPEC J2 arrive in Phase 14.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/ShageeshanT/Lumen/apps/cli/internal/version"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("lumen", flag.ContinueOnError)
	fs.SetOutput(stderr)
	showVersion := fs.Bool("version", false, "print the version and exit")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *showVersion {
		fmt.Fprintln(stdout, version.String("lumen"))
		return 0
	}
	fmt.Fprintln(stderr, "lumen: no commands yet. Use --version.")
	return 2
}
