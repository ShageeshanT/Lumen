package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestVersion(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{{"--version"}, {"version"}} {
		var stdout, stderr bytes.Buffer
		if code := run(args, &stdout, &stderr); code != 0 {
			t.Fatalf("%v: exit %d; %s", args, code, stderr.String())
		}
		if !strings.HasPrefix(stdout.String(), "lumen-agent 0.0.0-dev (") || !strings.Contains(stdout.String(), "protocol 1") {
			t.Fatalf("stdout = %q", stdout.String())
		}
	}
	var stdout, stderr bytes.Buffer
	if code := run([]string{"version", "--json"}, &stdout, &stderr); code != 0 {
		t.Fatal(code)
	}
	var v map[string]any
	if err := json.Unmarshal(stdout.Bytes(), &v); err != nil || v["protocol_version"].(float64) != 1 {
		t.Fatalf("json %q", stdout.String())
	}
}

func TestUsageErrors(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{nil, {"--nope"}, {"join"}, {"run", "--bad"}} {
		var stdout, stderr bytes.Buffer
		if code := run(args, &stdout, &stderr); code != 2 {
			t.Fatalf("%v: exit %d, want 2", args, code)
		}
	}
}

// These tests set process environment, so they don't run in parallel.

func TestStatusWithoutControlPlane(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("LUMEN_STATE_DIR", dir)
	var stdout, stderr bytes.Buffer
	if code := run([]string{"status"}, &stdout, &stderr); code != 0 || !strings.Contains(stdout.String(), "Not joined") {
		t.Fatalf("exit %d: %q %q", code, stdout.String(), stderr.String())
	}
	if err := os.WriteFile(filepath.Join(dir, "state.json"), []byte(`{"server_id":"srv_x","name":"oracle-1","control_plane_url":"https://cp"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "credential"), []byte("c\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	stdout.Reset()
	if code := run([]string{"status"}, &stdout, &stderr); code != 0 || !strings.Contains(stdout.String(), "Joined as oracle-1 (srv_x)") {
		t.Fatalf("exit %d: %q", code, stdout.String())
	}
	stdout.Reset()
	if code := run([]string{"status", "--json"}, &stdout, &stderr); code != 0 || !strings.Contains(stdout.String(), `"joined":true`) {
		t.Fatalf("json: %q", stdout.String())
	}
	if code := run([]string{"status", "--wait-online", "1"}, &stdout, &stderr); code != 1 {
		t.Fatalf("wait-online without a running agent must time out, got %d", code)
	}
}

func TestLoadEnvFile(t *testing.T) {
	p := filepath.Join(t.TempDir(), "agent.env")
	if err := os.WriteFile(p, []byte("LUMEN_TEST_A=from-file\nLUMEN_TEST_B=\"quoted\"\nOTHER=x\n# comment\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("LUMEN_TEST_A", "")
	t.Setenv("LUMEN_TEST_B", "already-set")
	t.Setenv("OTHER", "")
	loadEnvFile(p)
	if os.Getenv("LUMEN_TEST_A") != "from-file" || os.Getenv("LUMEN_TEST_B") != "already-set" || os.Getenv("OTHER") != "" {
		t.Fatalf("got A=%q B=%q OTHER=%q", os.Getenv("LUMEN_TEST_A"), os.Getenv("LUMEN_TEST_B"), os.Getenv("OTHER"))
	}
	loadEnvFile(filepath.Join(t.TempDir(), "missing"))
}

func TestRunWithoutJoin(t *testing.T) {
	t.Setenv("LUMEN_STATE_DIR", t.TempDir())
	var stdout, stderr bytes.Buffer
	if code := run([]string{"run"}, &stdout, &stderr); code != 1 || !strings.Contains(stderr.String(), "hasn't joined") {
		t.Fatalf("exit %d: %q", code, stderr.String())
	}
}

func TestJoinRequiresHTTPS(t *testing.T) {
	t.Setenv("LUMEN_STATE_DIR", t.TempDir())
	t.Setenv("LUMEN_METADATA_URL", "http://127.0.0.1:1")
	t.Setenv("LUMEN_GCP_METADATA_URL", "http://127.0.0.1:1")
	var stdout, stderr bytes.Buffer
	if code := run([]string{"join", "--control-plane", "http://cp.example.com", "--token", "x"}, &stdout, &stderr); code != 2 {
		t.Fatalf("exit %d: %q", code, stderr.String())
	}
}

func TestUninstallIntoRoot(t *testing.T) {
	root := t.TempDir()
	t.Setenv("LUMEN_ROOT", root)
	t.Setenv("DOCKER_HOST", "unix://"+filepath.Join(root, "no-docker.sock"))
	for _, p := range []string{"etc/lumen/agent.env", "var/lib/lumen/agent/credential", "usr/local/bin/lumen-agent", "usr/local/bin/lumen-agent.prev", "etc/systemd/system/lumen-agent.service"} {
		full := filepath.Join(root, p)
		if err := os.MkdirAll(filepath.Dir(full), 0o750); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	var stdout, stderr bytes.Buffer
	if code := cmdUninstall([]string{}, strings.NewReader("no\n"), &stdout, &stderr); code != 1 {
		t.Fatalf("declined confirmation must change nothing, exit %d", code)
	}
	if _, err := os.Stat(filepath.Join(root, "etc/lumen/agent.env")); err != nil {
		t.Fatal("files removed without confirmation")
	}
	stdout.Reset()
	if code := cmdUninstall([]string{"--keep-data"}, strings.NewReader("remove\n"), &stdout, &stderr); code != 0 {
		t.Fatalf("exit %d: %s", code, stdout.String())
	}
	if _, err := os.Stat(filepath.Join(root, "var/lib/lumen/agent/credential")); err != nil {
		t.Fatal("--keep-data removed data")
	}
	for _, p := range []string{"etc/lumen", "usr/local/bin/lumen-agent", "usr/local/bin/lumen-agent.prev", "etc/systemd/system/lumen-agent.service"} {
		if _, err := os.Stat(filepath.Join(root, p)); !os.IsNotExist(err) {
			t.Fatalf("%s still exists", p)
		}
	}
	if code := cmdUninstall([]string{"--yes"}, strings.NewReader(""), &stdout, &stderr); code != 0 {
		t.Fatalf("second run must be safe, exit %d", code)
	}
	if _, err := os.Stat(filepath.Join(root, "var/lib/lumen")); !os.IsNotExist(err) {
		t.Fatal("/var/lib/lumen not removed")
	}
}
