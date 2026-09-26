package main

import (
	"bytes"
	"strings"
	"testing"
)

func TestRunVersion(t *testing.T) {
	t.Parallel()

	var stdout, stderr bytes.Buffer
	if code := run([]string{"--version"}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit code %d, want 0; stderr: %s", code, stderr.String())
	}
	if !strings.HasPrefix(stdout.String(), "lumen-agent 0.0.0-dev (") {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestRunWithoutFlags(t *testing.T) {
	t.Parallel()

	var stdout, stderr bytes.Buffer
	if code := run(nil, &stdout, &stderr); code != 2 {
		t.Fatalf("exit code %d, want 2", code)
	}
	if stdout.Len() != 0 {
		t.Fatalf("unexpected stdout: %q", stdout.String())
	}
}

func TestRunBadFlag(t *testing.T) {
	t.Parallel()

	var stdout, stderr bytes.Buffer
	if code := run([]string{"--nope"}, &stdout, &stderr); code != 2 {
		t.Fatalf("exit code %d, want 2", code)
	}
}
