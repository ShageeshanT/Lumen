// Package caddy runs the platform Caddy container and talks to its admin API
// on 127.0.0.1:2019 (never published; SPEC J5). Route management for apps is
// Phase 03; this phase installs the default catch-all 404 route, a fallback
// certificate for :443, and temporary port-check routes.
package caddy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// AdminAddr is where the admin API listens, loopback only.
const AdminAddr = "127.0.0.1:2019"

// Admin is a thin client for the admin API.
type Admin struct {
	base   string
	client *http.Client
}

// NewAdmin returns a client for base (default http://127.0.0.1:2019).
func NewAdmin(base string) *Admin {
	if base == "" {
		base = "http://" + AdminAddr
	}
	return &Admin{
		base: strings.TrimRight(base, "/"),
		// Never proxied: the admin API is on loopback.
		client: &http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{Proxy: nil}},
	}
}

func (a *Admin) do(ctx context.Context, method, path string, body any) ([]byte, error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("caddy: encode: %w", err)
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, a.base+path, rdr)
	if err != nil {
		return nil, fmt.Errorf("caddy: build request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("caddy: %s %s: %w", method, path, err)
	}
	defer func() { _ = resp.Body.Close() }()
	out, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return out, fmt.Errorf("caddy: %s %s: %d %s", method, path, resp.StatusCode, strings.TrimSpace(string(out)))
	}
	return out, nil
}

// Ping returns nil when the admin API answers GET /config/.
func (a *Admin) Ping(ctx context.Context) error {
	_, err := a.do(ctx, http.MethodGet, "/config/", nil)
	return err
}

// Load replaces the whole running config.
func (a *Admin) Load(ctx context.Context, cfg any) error {
	_, err := a.do(ctx, http.MethodPost, "/load", cfg)
	return err
}

// InsertRoute puts route first in the server's route list, so it wins over
// the catch-all.
func (a *Admin) InsertRoute(ctx context.Context, server string, route any) error {
	_, err := a.do(ctx, http.MethodPut, "/config/apps/http/servers/"+server+"/routes/0", route)
	return err
}

// DeleteID removes the config object with the given @id. Missing is fine.
func (a *Admin) DeleteID(ctx context.Context, id string) error {
	body, err := a.do(ctx, http.MethodDelete, "/id/"+id, nil)
	if err != nil && strings.Contains(string(body), "unknown object ID") {
		return nil
	}
	return err
}
