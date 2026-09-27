// Command crashafter is a deliberately broken agent release for the rollback
// test: it passes the pre-swap trial run (`run --trial ...` exits 0) but
// crashes on every real start, so only the systemd ExecStartPre guard
// (`lumen-agent.prev update-guard`) can bring the previous binary back.
package main

import (
	"fmt"
	"os"
	"slices"
)

func main() {
	if slices.Contains(os.Args, "--trial") {
		fmt.Println("crashafter: pretending the trial run is healthy")
		return
	}
	if len(os.Args) > 1 && os.Args[1] == "version" {
		fmt.Println("lumen-agent 0.0.4-crashafter")
		return
	}
	fmt.Fprintln(os.Stderr, "crashafter: crashing on start on purpose")
	os.Exit(1)
}
