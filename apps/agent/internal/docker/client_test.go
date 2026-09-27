package docker

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestClientAgainstFakeEngine(t *testing.T) {
	t.Parallel()
	var created *CreateSpec
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1.43/version", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"Version":"28.1.1","ApiVersion":"1.49","Os":"linux","Arch":"arm64"}`))
	})
	mux.HandleFunc("GET /v1.43/containers/json", func(w http.ResponseWriter, r *http.Request) {
		if f := r.URL.Query().Get("filters"); f != "" && !strings.Contains(f, "lumen.role=proxy") {
			t.Errorf("unexpected filter %s", f)
		}
		_, _ = w.Write([]byte(`[{"Id":"a","Names":["/lumen-caddy"],"State":"running","Labels":{"lumen.role":"proxy"}}]`))
	})
	mux.HandleFunc("GET /v1.43/containers/missing/json", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"message":"No such container"}`, http.StatusNotFound)
	})
	mux.HandleFunc("GET /v1.43/containers/lumen-caddy/json", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"Id":"a","Name":"/lumen-caddy","State":{"Status":"running","Running":true},"Config":{"Image":"caddy@sha256:x","Labels":{"lumen.role":"proxy"}}}`))
	})
	mux.HandleFunc("POST /v1.43/containers/create", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("name") != "lumen-caddy" {
			t.Errorf("name %q", r.URL.Query().Get("name"))
		}
		created = &CreateSpec{}
		_ = json.NewDecoder(r.Body).Decode(created)
		_, _ = w.Write([]byte(`{"Id":"new"}`))
	})
	mux.HandleFunc("POST /v1.43/containers/new/start", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNotModified)
	})
	mux.HandleFunc("DELETE /v1.43/containers/gone", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"message":"no"}`, http.StatusNotFound)
	})
	mux.HandleFunc("POST /v1.43/images/create", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("fromImage") != "caddy" || r.URL.Query().Get("tag") != "sha256:abc" {
			t.Errorf("pull query %v", r.URL.Query())
		}
		_, _ = w.Write([]byte(`{"status":"Pulling"}` + "\n" + `{"status":"Done"}`))
	})
	mux.HandleFunc("GET /v1.43/images/caddy@sha256:abc/json", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, `{"message":"no"}`, http.StatusNotFound)
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()
	c := NewWithHTTP(srv.Client(), srv.URL)
	ctx := context.Background()

	v, err := c.Version(ctx)
	if err != nil || v.Version != "28.1.1" {
		t.Fatalf("version: %v %+v", err, v)
	}
	list, err := c.ListContainers(ctx, true, "lumen.role=proxy")
	if err != nil || len(list) != 1 {
		t.Fatalf("list: %v %+v", err, list)
	}
	n, err := c.CountRunning(ctx)
	if err != nil || n != 1 {
		t.Fatalf("count: %v %d", err, n)
	}
	if _, err := c.Inspect(ctx, "missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("inspect missing: %v", err)
	}
	st, err := c.Inspect(ctx, "lumen-caddy")
	if err != nil || !st.State.Running {
		t.Fatalf("inspect: %v %+v", err, st)
	}
	id, err := c.Create(ctx, "lumen-caddy", &CreateSpec{Image: "caddy", HostConfig: HostConfig{CapDrop: []string{"ALL"}}})
	if err != nil || id != "new" || created.HostConfig.CapDrop[0] != "ALL" {
		t.Fatalf("create: %v %s %+v", err, id, created)
	}
	if err := c.Start(ctx, "new"); err != nil {
		t.Fatalf("start already running: %v", err)
	}
	if err := c.Remove(ctx, "gone"); err != nil {
		t.Fatalf("remove missing: %v", err)
	}
	ok, err := c.ImageExists(ctx, "caddy@sha256:abc")
	if err != nil || ok {
		t.Fatalf("image exists: %v %v", err, ok)
	}
	if err := c.Pull(ctx, "caddy@sha256:abc"); err != nil {
		t.Fatalf("pull: %v", err)
	}
}

func TestPullReportsStreamError(t *testing.T) {
	t.Parallel()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"error":"manifest unknown"}`))
	}))
	defer srv.Close()
	c := NewWithHTTP(srv.Client(), srv.URL)
	if err := c.Pull(context.Background(), "caddy:2"); err == nil || !strings.Contains(err.Error(), "manifest unknown") {
		t.Fatalf("got %v", err)
	}
}
