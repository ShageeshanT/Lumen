package caddy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/docker"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/state"
)

const (
	// ContainerName is the platform proxy container.
	ContainerName = "lumen-caddy"
	// RoleLabel marks the platform proxy.
	RoleLabel = "lumen.role"
	// DefaultImage is used until the control plane sends AgentConfig.caddy_image.
	// Caddy 2.11.4 (alpine), multi-arch index digest; see docs/DECISIONS.md.
	DefaultImage = "caddy:2-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b"
	// DefaultRoot holds Caddy's config and data on the host.
	DefaultRoot = "/var/lib/lumen/caddy"
)

// Bootstrap keeps the platform Caddy container present and configured.
type Bootstrap struct {
	Docker *docker.Client
	Admin  *Admin
	Root   string
	Log    *slog.Logger

	mu     sync.Mutex
	loaded bool
}

// ContainerSpec is the hardened container definition (PHASE-02 §5 Security):
// pinned image, host network, admin API on loopback only (set in the config),
// all capabilities dropped except binding low ports, read-only root with two
// writable mounts, pids and memory limits, restart always.
func ContainerSpec(image, root string) *docker.CreateSpec {
	return &docker.CreateSpec{
		Image:  image,
		Cmd:    []string{"caddy", "run", "--config", "/config/caddy.json"},
		Env:    []string{"XDG_CONFIG_HOME=/config", "XDG_DATA_HOME=/data"},
		Labels: map[string]string{RoleLabel: "proxy", "lumen.managed": "true"},
		HostConfig: docker.HostConfig{
			NetworkMode:    "host",
			Binds:          []string{filepath.Join(root, "config") + ":/config", filepath.Join(root, "data") + ":/data"},
			RestartPolicy:  docker.RestartPolicy{Name: "always"},
			CapDrop:        []string{"ALL"},
			CapAdd:         []string{"NET_BIND_SERVICE"},
			ReadonlyRootfs: true,
			PidsLimit:      512,
			Memory:         256 << 20,
			SecurityOpt:    []string{"no-new-privileges:true"},
		},
	}
}

// Ensure makes sure the container exists with image, runs, and has Lumen's
// base config loaded. It is cheap when everything is already in place, so the
// agent calls it every heartbeat: a container removed by hand comes back
// within one heartbeat.
func (b *Bootstrap) Ensure(ctx context.Context, image string) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if image == "" {
		image = DefaultImage
	}
	root := b.Root
	if root == "" {
		root = DefaultRoot
	}
	cfgDir := filepath.Join(root, "config")
	for _, d := range []string{cfgDir, filepath.Join(root, "data")} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			return fmt.Errorf("caddy: create %s: %w", d, err)
		}
	}
	cert, key, err := FallbackCert(cfgDir)
	if err != nil {
		return err
	}
	cfg := DefaultConfig(cert, key)
	raw, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("caddy: encode config: %w", err)
	}
	cfgPath := filepath.Join(cfgDir, "caddy.json")
	if existing, err := os.ReadFile(cfgPath); err != nil || string(existing) != string(raw) { //nolint:gosec // agent-owned path
		if err := state.WriteFileAtomic(cfgPath, raw, 0o600); err != nil {
			return err
		}
	}

	changed, err := b.ensureContainer(ctx, image, root)
	if err != nil {
		return err
	}
	if changed || !b.loaded {
		if err := b.waitAdmin(ctx, 20*time.Second); err != nil {
			return err
		}
		// Loading resets routes to the base set, dropping stale port-check routes.
		if err := b.Admin.Load(ctx, cfg); err != nil {
			return err
		}
		b.loaded = true
	}
	return nil
}

func (b *Bootstrap) ensureContainer(ctx context.Context, image, root string) (bool, error) {
	cur, err := b.Docker.Inspect(ctx, ContainerName)
	switch {
	case errors.Is(err, docker.ErrNotFound):
		return true, b.create(ctx, image, root)
	case err != nil:
		return false, fmt.Errorf("caddy: inspect: %w", err)
	case cur.Config.Image != image:
		b.Log.Info("replacing the proxy container with a new image", "from", cur.Config.Image, "to", image)
		if err := b.Docker.Remove(ctx, cur.ID); err != nil {
			return false, fmt.Errorf("caddy: remove old container: %w", err)
		}
		return true, b.create(ctx, image, root)
	case !cur.State.Running && !cur.State.Restarting:
		b.Log.Warn("the proxy container was stopped; starting it")
		if err := b.Docker.Start(ctx, cur.ID); err != nil {
			return false, fmt.Errorf("caddy: start: %w", err)
		}
		return true, nil
	}
	return false, nil
}

func (b *Bootstrap) create(ctx context.Context, image, root string) error {
	ok, err := b.Docker.ImageExists(ctx, image)
	if err != nil {
		return fmt.Errorf("caddy: image lookup: %w", err)
	}
	if !ok {
		b.Log.Info("pulling the proxy image", "image", image)
		if err := b.Docker.Pull(ctx, image); err != nil {
			return fmt.Errorf("caddy: pull: %w", err)
		}
	}
	id, err := b.Docker.Create(ctx, ContainerName, ContainerSpec(image, root))
	if err != nil {
		return fmt.Errorf("caddy: create: %w", err)
	}
	if err := b.Docker.Start(ctx, id); err != nil {
		return fmt.Errorf("caddy: start: %w", err)
	}
	b.Log.Info("the proxy container is running", "id", id[:min(12, len(id))])
	return nil
}

func (b *Bootstrap) waitAdmin(ctx context.Context, limit time.Duration) error {
	deadline := time.Now().Add(limit)
	for {
		err := b.Admin.Ping(ctx)
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("caddy: admin API did not come up: %w", err)
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("caddy: %w", ctx.Err())
		case <-time.After(250 * time.Millisecond):
		}
	}
}

// Restart restarts the container (used once when a port has no listener).
func (b *Bootstrap) Restart(ctx context.Context) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	if err := b.Docker.Restart(ctx, ContainerName); err != nil {
		return fmt.Errorf("caddy: restart: %w", err)
	}
	b.loaded = false
	return nil
}

// Healthy reports whether the admin API answers.
func (b *Bootstrap) Healthy(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	return b.Admin.Ping(ctx) == nil
}
