package version

import (
	"runtime"
	"strings"
	"testing"
)

func TestString(t *testing.T) {
	t.Parallel()

	got := String("lumen-agent")
	for _, want := range []string{"lumen-agent ", Version, Commit, BuildDate, runtime.GOOS + "/" + runtime.GOARCH} {
		if !strings.Contains(got, want) {
			t.Errorf("String() = %q, want it to contain %q", got, want)
		}
	}
}
