package portcheck

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"sync"
	"time"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/caddy"
	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

// RouteTTL is how long a port-check route stays installed.
const RouteTTL = 60 * time.Second

var nonceRE = regexp.MustCompile(`^[A-Za-z0-9_-]{8,128}$`)

// RouteAdmin is the part of the Caddy admin client the responder uses.
type RouteAdmin interface {
	InsertRoute(ctx context.Context, server string, route any) error
	DeleteID(ctx context.Context, id string) error
}

// ProxyRestarter restarts the proxy once when a web port has no listener.
type ProxyRestarter interface {
	Restart(ctx context.Context) error
}

// Responder handles PortCheck messages.
type Responder struct {
	ProcRoot string
	Admin    RouteAdmin
	Proxy    ProxyRestarter
	Log      *slog.Logger
	// TTL overrides RouteTTL in tests.
	TTL time.Duration
	// Settle is how long to wait after restarting the proxy (default 3 s).
	Settle time.Duration

	mu     sync.Mutex
	timers map[string]*time.Timer
}

// RouteID is the Caddy @id of a nonce route on a server.
func RouteID(nonce, server string) string { return "lumen-portcheck-" + nonce + "-" + server }

// NonceRoute answers GET /.lumen/portcheck/<nonce> with 200 and the nonce.
func NonceRoute(nonce, server string) map[string]any {
	return map[string]any{
		"@id":   RouteID(nonce, server),
		"match": []any{map[string]any{"path": []string{"/.lumen/portcheck/" + nonce}}},
		"handle": []any{map[string]any{
			"handler":     "static_response",
			"status_code": 200,
			"headers":     map[string][]string{"Content-Type": {"text/plain"}, "Cache-Control": {"no-store"}},
			"body":        nonce,
		}},
		"terminal": true,
	}
}

// Handle inspects every requested port and installs nonce routes.
func (r *Responder) Handle(ctx context.Context, pc *agentv1.PortCheck) (*agentv1.PortCheckResult, error) {
	if !nonceRE.MatchString(pc.GetNonce()) {
		return nil, fmt.Errorf("portcheck: nonce must be 8-128 URL-safe characters")
	}
	if len(pc.GetPorts()) == 0 || len(pc.GetPorts()) > 10 {
		return nil, fmt.Errorf("portcheck: between 1 and 10 ports")
	}
	res := &agentv1.PortCheckResult{OpId: pc.GetMeta().GetOpId()}
	restarted := false
	for _, port := range pc.GetPorts() {
		l, err := Lookup(r.ProcRoot, port)
		if err != nil {
			r.Log.Warn("could not read listening sockets", "port", port, "err", err)
		}
		_, isWeb := caddy.ServerForPort(port)
		if !l.Listening && isWeb && !restarted && r.Proxy != nil {
			// Proxy problem: restart Caddy once, then report what we see.
			restarted = true
			r.Log.Warn("nothing listens on a web port; restarting the proxy once", "port", port)
			if err := r.Proxy.Restart(ctx); err != nil {
				r.Log.Warn("proxy restart failed", "err", err)
			} else {
				settle := r.Settle
				if settle == 0 {
					settle = 3 * time.Second
				}
				select {
				case <-ctx.Done():
				case <-time.After(settle):
				}
				l, _ = Lookup(r.ProcRoot, port)
			}
		}
		st := &agentv1.PortState{Port: port, Listening: l.Listening, Listener: l.Process}
		if l.Listening && isWeb {
			st.NonceRouteInstalled = r.install(ctx, pc.GetNonce(), port)
		}
		res.Ports = append(res.Ports, st)
	}
	return res, nil
}

func (r *Responder) install(ctx context.Context, nonce string, port uint32) bool {
	server, _ := caddy.ServerForPort(port)
	id := RouteID(nonce, server)
	// Idempotent: a re-delivered PortCheck removes and re-adds the same id.
	_ = r.Admin.DeleteID(ctx, id)
	if err := r.Admin.InsertRoute(ctx, server, NonceRoute(nonce, server)); err != nil {
		r.Log.Warn("could not install the port-check route", "port", port, "err", err)
		return false
	}
	ttl := r.TTL
	if ttl == 0 {
		ttl = RouteTTL
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.timers == nil {
		r.timers = map[string]*time.Timer{}
	}
	if t, ok := r.timers[id]; ok {
		t.Stop()
	}
	// The removal must outlive the request that installed the route.
	bg := context.WithoutCancel(ctx)
	r.timers[id] = time.AfterFunc(ttl, func() {
		ctx, cancel := context.WithTimeout(bg, 5*time.Second)
		defer cancel()
		if err := r.Admin.DeleteID(ctx, id); err != nil {
			r.Log.Warn("could not remove the port-check route", "id", id, "err", err)
		}
		r.mu.Lock()
		delete(r.timers, id)
		r.mu.Unlock()
	})
	return true
}

// Pending returns how many routes are waiting for removal (for tests).
func (r *Responder) Pending() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.timers)
}
