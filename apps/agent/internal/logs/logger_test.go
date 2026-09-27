package logs

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestLoggerShapeAndRedaction(t *testing.T) {
	var buf bytes.Buffer
	AddSecret("c2VjcmV0LWNyZWRlbnRpYWwtdmFsdWU")
	l := Component(New(&buf, "info"), "conn")
	l.Info("dialing with c2VjcmV0LWNyZWRlbnRpYWwtdmFsdWU",
		"credential", "abc", "op_id", "op-1",
		"url", "wss://cp/agent/v1?x=c2VjcmV0LWNyZWRlbnRpYWwtdmFsdWU",
		"err", errors.New("401 for c2VjcmV0LWNyZWRlbnRpYWwtdmFsdWU"))
	l.Debug("hidden")

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 1 {
		t.Fatalf("got %d lines: %q", len(lines), buf.String())
	}
	if strings.Contains(lines[0], "c2VjcmV0LWNyZWRlbnRpYWwtdmFsdWU") {
		t.Fatalf("secret leaked: %s", lines[0])
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &m); err != nil {
		t.Fatalf("not JSON: %v", err)
	}
	for _, k := range []string{"ts", "level", "msg", "component", "op_id", "service"} {
		if _, ok := m[k]; !ok {
			t.Errorf("missing key %q in %v", k, m)
		}
	}
	if m["level"] != "info" || m["component"] != "conn" || m["credential"] != "[redacted]" {
		t.Fatalf("unexpected fields: %v", m)
	}
}

func TestShortSecretsIgnored(t *testing.T) {
	AddSecret("abc")
	if got := Scrub("abcdef"); got != "abcdef" {
		t.Fatalf("short secret scrubbed: %q", got)
	}
}
