// Command badagent is a deliberately broken agent release used by the
// self-update rollback test (PHASE-02 §4.10): it answers `version` like a
// real agent but exits immediately on `run`, so it can never pass the trial
// run or the post-restart health check.
package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) > 1 && os.Args[1] == "version" {
		fmt.Println("lumen-agent 0.0.3-broken")
		return
	}
	fmt.Fprintln(os.Stderr, "badagent: exiting immediately on purpose")
	os.Exit(1)
}
