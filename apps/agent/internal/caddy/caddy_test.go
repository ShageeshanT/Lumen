package caddy

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

func TestDefaultConfigIsLoopbackAndHas404(t *testing.T) {
	t.Parallel()
	cert, key, err := FallbackCert(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(DefaultConfig(cert, key))
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	for _, want := range []string{`"listen":"127.0.0.1:2019"`, `":80"`, `":443"`, `"status_code":404`, FallbackTag, "Nothing is deployed at this address yet"} {
		if !strings.Contains(s, want) {
			t.Errorf("config lacks %s", want)
		}
	}
}

func TestFallbackCertIsStable(t *testing.T) {
	t.Parallel()
	dir := t.TempDir()
	c1, k1, err := FallbackCert(dir)
	if err != nil {
		t.Fatal(err)
	}
	c2, k2, err := FallbackCert(dir)
	if err != nil {
		t.Fatal(err)
	}
	if c1 != c2 || k1 != k2 {
		t.Fatal("fallback certificate must be reused")
	}
}

func TestContainerSpecIsHardened(t *testing.T) {
	t.Parallel()
	spec := ContainerSpec(DefaultImage, "/var/lib/lumen/caddy")
	h := spec.HostConfig
	if h.Privileged || !h.ReadonlyRootfs || h.PidsLimit != 512 || h.Memory != 256<<20 {
		t.Fatalf("host config not hardened: %+v", h)
	}
	if len(h.CapDrop) != 1 || h.CapDrop[0] != "ALL" || len(h.CapAdd) != 1 || h.CapAdd[0] != "NET_BIND_SERVICE" {
		t.Fatalf("capabilities: %+v %+v", h.CapDrop, h.CapAdd)
	}
	if h.NetworkMode != "host" || h.RestartPolicy.Name != "always" || len(h.Binds) != 2 {
		t.Fatalf("network/restart/binds: %+v", h)
	}
	if spec.Labels[RoleLabel] != "proxy" || !strings.Contains(spec.Image, "@sha256:") {
		t.Fatalf("labels/image: %+v %s", spec.Labels, spec.Image)
	}
}

func TestServerForPort(t *testing.T) {
	t.Parallel()
	if s, ok := ServerForPort(80); !ok || s != ServerHTTP {
		t.Fatal("80")
	}
	if s, ok := ServerForPort(443); !ok || s != ServerHTTPS {
		t.Fatal("443")
	}
	if _, ok := ServerForPort(8080); ok {
		t.Fatal("8080 has no server")
	}
}

func TestAdminClient(t *testing.T) {
	t.Parallel()
	var mu sync.Mutex
	var calls []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		calls = append(calls, r.Method+" "+r.URL.Path+" "+string(body))
		mu.Unlock()
		if r.URL.Path == "/id/missing" {
			http.Error(w, `{"error":"unknown object ID 'missing'"}`, http.StatusNotFound)
			return
		}
		_, _ = w.Write([]byte("{}"))
	}))
	defer srv.Close()
	a := NewAdmin(srv.URL)
	ctx := context.Background()
	if err := a.Ping(ctx); err != nil {
		t.Fatal(err)
	}
	if err := a.Load(ctx, map[string]any{"x": 1}); err != nil {
		t.Fatal(err)
	}
	if err := a.InsertRoute(ctx, ServerHTTP, map[string]any{"@id": "r"}); err != nil {
		t.Fatal(err)
	}
	if err := a.DeleteID(ctx, "missing"); err != nil {
		t.Fatalf("missing id must not fail: %v", err)
	}
	want := []string{"GET /config/ ", `POST /load {"x":1}`, `PUT /config/apps/http/servers/lumen_http/routes/0 {"@id":"r"}`, "DELETE /id/missing "}
	for i, w := range want {
		if calls[i] != w {
			t.Errorf("call %d: got %q want %q", i, calls[i], w)
		}
	}
}
