// Package agent wires the agent together for `lumen-agent run`: identity and
// credential, the control-plane connection, heartbeats, host metrics, the
// Caddy bootstrap, port checks, self-update and revocation.
//
// Phase 03 hooks in here: DesiredState arrives through Agent.dispatch, the
// reconcile loop runs next to the heartbeat and sampler goroutines in Run,
// and ActualState goes out through Agent.send.
package agent

import (
	"context"
	"crypto/ed25519"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/buildinfo"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/caddy"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/conn"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/docker"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/heartbeat"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/hostinfo"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/httpx"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/join"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/logs"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/metrics"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/opid"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/portcheck"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/provider"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/state"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/update"
	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

var (
	// ErrNotJoined means there is no credential; run `lumen-agent join`.
	ErrNotJoined = errors.New("this server hasn't joined a Lumen control plane yet")
	// ErrRevoked means the control plane removed this server.
	ErrRevoked = errors.New("this server was removed from Lumen")
	// ErrRestartForUpdate means a new binary is in place; exit 0.
	ErrRestartForUpdate = errors.New("restarting into the new agent version")
	// ErrRolledBack means the previous binary was restored; exit non-zero.
	ErrRolledBack = errors.New("rolled back to the previous agent version")
	// ErrTrialFailed means `run --trial` did not become healthy in time.
	ErrTrialFailed = errors.New("the trial run did not become healthy in time")
)

// Options configure Run. Zero values mean production defaults.
type Options struct {
	Store        *state.Store
	Log          *slog.Logger
	BinPath      string
	CAFile       string
	ProcRoot     string
	DockerSocket string
	CaddyRoot    string
	CaddyAdmin   string
	Metadata     provider.Endpoints
	ReleaseKey   string
	// Trial runs the health check only: connect, get accepted, probe Docker
	// and Caddy, then return nil. Nothing is written to disk.
	Trial        bool
	TrialTimeout time.Duration
}

// Agent is one running agent process.
type Agent struct {
	o        Options
	log      *slog.Logger
	st       *state.State
	id       *state.Identity
	cred     atomic.Pointer[string]
	client   *conn.Client
	docker   *docker.Client
	proxy    *caddy.Bootstrap
	ports    *portcheck.Responder
	updates  *update.Manager
	sampler  *metrics.Sampler
	seen     *opid.Seen
	http     *http.Client
	facts    join.HostFacts
	hbEvery  atomic.Int64 // nanoseconds
	mxEvery  atomic.Int64
	image    atomic.Pointer[string]
	kick     chan struct{}
	accepted atomic.Bool
	lastPrb  atomic.Pointer[heartbeat.Probe]

	statusMu sync.Mutex
	status   state.Status

	stop     context.CancelCauseFunc
	updating atomic.Bool
}

// Run runs the agent until ctx is done or a terminal event (revocation,
// update restart, rollback) happens; the returned error says which.
func Run(ctx context.Context, o Options) error {
	a, err := newAgent(o)
	if err != nil {
		return err
	}
	return a.run(ctx)
}

func newAgent(o Options) (*Agent, error) {
	if o.Store == nil {
		o.Store = state.New("")
	}
	if o.BinPath == "" {
		o.BinPath = "/usr/local/bin/lumen-agent"
	}
	if o.ReleaseKey == "" {
		o.ReleaseKey = buildinfo.ReleasePublicKey
	}
	a := &Agent{o: o, log: logs.Component(o.Log, "agent"), seen: opid.NewSeen(10000), kick: make(chan struct{}, 1)}
	cred, err := o.Store.LoadCredential()
	if errors.Is(err, state.ErrNotFound) {
		return nil, ErrNotJoined
	} else if err != nil {
		return nil, err
	}
	logs.AddSecret(cred)
	a.cred.Store(&cred)
	if a.st, err = o.Store.LoadState(); err != nil {
		return nil, err
	}
	if a.st.ServerID == "" || len(a.st.ControlPlanePublicKey) != ed25519.PublicKeySize {
		return nil, ErrNotJoined
	}
	if a.id, err = o.Store.LoadIdentity(); err != nil {
		return nil, fmt.Errorf("load identity: %w", err)
	}
	if a.http, err = httpx.NewClient(o.CAFile, 5*time.Minute); err != nil {
		return nil, err
	}
	a.hbEvery.Store(int64(10 * time.Second))
	a.mxEvery.Store(int64(10 * time.Second))
	img := a.st.CaddyImage
	if img == "" {
		img = caddy.DefaultImage
	}
	a.image.Store(&img)
	a.docker = docker.New(o.DockerSocket)
	a.proxy = &caddy.Bootstrap{Docker: a.docker, Admin: caddy.NewAdmin(o.CaddyAdmin), Root: o.CaddyRoot, Log: logs.Component(o.Log, "caddy")}
	a.ports = &portcheck.Responder{ProcRoot: procRoot(o.ProcRoot), Admin: a.proxy.Admin, Proxy: a.proxy, Log: logs.Component(o.Log, "portcheck")}
	a.updates = &update.Manager{
		BinPath: o.BinPath, Store: o.Store, Client: a.http, PublicKey: o.ReleaseKey,
		Version: buildinfo.Version, Log: logs.Component(o.Log, "update"),
	}
	a.status = state.Status{PID: os.Getpid(), AgentVersion: buildinfo.Version, ServerID: a.st.ServerID, Name: a.st.Name, Connection: "connecting"}
	return a, nil
}

func procRoot(p string) string {
	if p == "" {
		return "/proc"
	}
	return p
}

func (a *Agent) run(parent context.Context) error {
	decision := update.NoUpdate
	if !a.o.Trial {
		var err error
		decision, err = a.updates.OnStart()
		if decision == update.RolledBack {
			return errors.Join(ErrRolledBack, err)
		}
		if err != nil {
			a.log.Warn("could not read the update record", "err", err)
		}
	}
	ctx, cancel := context.WithCancelCause(parent)
	defer cancel(nil)
	a.stop = cancel

	started := time.Now()
	prov := a.detectProvider(ctx)
	a.facts = hostinfo.Gather(ctx, hostinfo.Sources{ProcRoot: a.o.ProcRoot}, a.docker, prov)

	tlsCfg, err := httpx.TLSConfig(a.o.CAFile)
	if err != nil {
		return err
	}
	a.client = conn.New(conn.Config{
		URL:             a.st.ControlPlaneWSURL,
		ServerID:        a.st.ServerID,
		Credential:      func() string { return *a.cred.Load() },
		Identity:        ed25519.PrivateKey(a.id.PrivateKey),
		ControlPlaneKey: ed25519.PublicKey(a.st.ControlPlanePublicKey),
		TLS:             tlsCfg,
		Log:             logs.Component(a.o.Log, "conn"),
		Hello:           a.hello,
	})

	if a.o.Trial {
		return a.trial(ctx)
	}

	var wg sync.WaitGroup
	goFn := func(fn func()) { wg.Add(1); go func() { defer wg.Done(); fn() }() }
	goFn(func() { a.client.Run(ctx, a) })
	hb := &heartbeat.Loop{
		Interval: func() time.Duration { return time.Duration(a.hbEvery.Load()) },
		Probe:    a.probe,
		Online:   a.client.Online,
		Send: func(h *agentv1.Heartbeat) {
			a.send(&agentv1.Envelope{Body: &agentv1.Envelope_Heartbeat{Heartbeat: h}}, conn.Normal)
		},
		Observe: a.observe,
		NewOpID: opid.New,
		NowMs:   func() int64 { return a.client.Clock().NowMs() },
		Kick:    a.kick,
	}
	goFn(func() { hb.Run(ctx) })
	a.sampler = &metrics.Sampler{
		Collector: &metrics.Collector{ProcRoot: a.o.ProcRoot},
		Interval:  func() time.Duration { return time.Duration(a.mxEvery.Load()) },
		Send: func(b *agentv1.MetricsBatch) {
			a.send(&agentv1.Envelope{Body: &agentv1.Envelope_MetricsBatch{MetricsBatch: b}}, conn.Droppable)
		},
		Self:       a.self,
		Containers: a.containerCount,
		NewOpID:    opid.New,
		Log:        logs.Component(a.o.Log, "metrics"),
	}
	goFn(func() { a.sampler.Run(ctx) })
	switch decision {
	case update.WatchHealth:
		goFn(func() { a.watchUpdate(ctx) })
	case update.OnProbation:
		goFn(func() { a.endProbation(ctx) })
	case update.NoUpdate, update.RolledBack:
	}
	a.log.Info("agent started", "version", buildinfo.Version, "server_id", a.st.ServerID,
		"provider", prov.Provider, "startup_ms", time.Since(started).Milliseconds())

	<-ctx.Done()
	wg.Wait()
	a.setStatus(func(s *state.Status) {
		if s.Connection != "revoked" {
			s.Connection = "offline"
		}
	})
	if cause := context.Cause(ctx); cause != nil && !errors.Is(cause, context.Canceled) {
		return cause
	}
	return nil
}

func (a *Agent) detectProvider(ctx context.Context) provider.Result {
	if a.o.Trial && a.st.Provider != "" {
		return provider.Result{Provider: a.st.Provider, RegionLabel: a.st.RegionLabel}
	}
	r := provider.Detect(ctx, a.o.Metadata)
	if r.Provider == "other" && a.st.Provider != "" && a.st.Provider != "other" {
		// A transient metadata failure should not forget a known provider.
		r.Provider, r.RegionLabel = a.st.Provider, a.st.RegionLabel
	}
	if !a.o.Trial && (r.Provider != a.st.Provider || r.RegionLabel != a.st.RegionLabel) {
		if _, err := a.o.Store.UpdateState(func(s *state.State) { s.Provider, s.RegionLabel = r.Provider, r.RegionLabel }); err != nil {
			a.log.Warn("could not cache the provider", "err", err)
		}
	}
	return r
}

func (a *Agent) hello(ctx context.Context) *agentv1.AgentHello {
	f := a.facts
	caddyRunning := a.proxy.Healthy(ctx)
	if v, err := a.docker.Version(ctx); err == nil {
		f.DockerVersion = v.Version
	}
	caps := []string{"heartbeat", "metrics.host", "portcheck", "self-update", "revoke"}
	return &agentv1.AgentHello{
		ServerId: a.st.ServerID, AgentVersion: buildinfo.Version, ProtocolVersion: buildinfo.ProtocolVersion,
		Os: f.OS, OsVersion: f.OSVersion, Arch: f.Arch, CpuCores: f.CPUCores,
		MemoryBytes: f.MemoryBytes, DiskBytes: f.DiskBytes, DockerVersion: f.DockerVersion,
		PublicIp: f.PublicIP, Hostname: f.Hostname, Kernel: f.Kernel, CaddyRunning: caddyRunning,
		Capabilities: caps, Provider: f.Provider, RegionLabel: f.RegionLabel,
	}
}

// send queues a body for the control plane.
func (a *Agent) send(body *agentv1.Envelope, class conn.Class) {
	a.client.Send(body, class)
}

func (a *Agent) sendOpError(op, code, msg string) {
	a.send(&agentv1.Envelope{Body: &agentv1.Envelope_OpError{OpError: &agentv1.OpError{OpId: op, Code: code, Message: msg}}}, conn.Critical)
}

// OnControlHello applies the control plane's configuration.
func (a *Agent) OnControlHello(_ context.Context, ch *agentv1.ControlHello) {
	cfg := ch.GetConfig()
	if s := cfg.GetHeartbeatIntervalS(); s >= 5 && s <= 60 {
		a.hbEvery.Store(int64(time.Duration(s) * time.Second))
	}
	if s := cfg.GetMetricsIntervalS(); s >= 5 && s <= 300 {
		a.mxEvery.Store(int64(time.Duration(s) * time.Second))
	}
	if img := cfg.GetCaddyImage(); img != "" && img != *a.image.Load() && !a.o.Trial {
		a.image.Store(&img)
		if _, err := a.o.Store.UpdateState(func(s *state.State) { s.CaddyImage = img }); err != nil {
			a.log.Warn("could not save the proxy image", "err", err)
		}
	}
	if rc := cfg.GetRotatedCredential(); rc != "" && !a.o.Trial {
		logs.AddSecret(rc)
		if err := a.o.Store.SaveCredential(rc); err != nil {
			a.log.Error("could not store the rotated credential; the old one stays valid for five minutes", "err", err)
		} else {
			a.cred.Store(&rc)
			a.log.Info("stored the rotated server credential")
		}
	}
	a.accepted.Store(true)
	if a.o.Trial {
		return
	}
	if r := a.updates.PendingResult(); r != nil {
		a.send(&agentv1.Envelope{Body: &agentv1.Envelope_AgentUpdateResult{AgentUpdateResult: &agentv1.AgentUpdateResult{
			OpId: r.OpID, Success: r.Success, RunningVersion: r.RunningVersion, Error: r.Error,
		}}}, conn.Critical)
	}
	select {
	case a.kick <- struct{}{}:
	default:
	}
}

// OnState records connection transitions for `lumen-agent status`.
func (a *Agent) OnState(s string, err error) {
	if s != "online" {
		a.accepted.Store(false)
	}
	a.setStatus(func(st *state.Status) {
		if st.Connection == "revoked" {
			return
		}
		st.Connection = s
		if s == "online" {
			st.ConnectedAt = time.Now().UTC()
			st.LastError = ""
		}
		if err != nil {
			st.LastError = logs.Scrub(err.Error())
		}
	})
	var rej *conn.RejectedError
	if errors.As(err, &rej) && rej.Reason == "CLOCK_SKEW" {
		a.log.Error("the control plane rejected this server's clock; enable NTP with: sudo timedatectl set-ntp true")
	}
}

// OnMessage dispatches one verified message from the control plane.
func (a *Agent) OnMessage(ctx context.Context, body *agentv1.Envelope) {
	a.dispatch(ctx, body)
}

func (a *Agent) dispatch(ctx context.Context, body *agentv1.Envelope) {
	switch m := body.GetBody().(type) {
	case *agentv1.Envelope_HeartbeatAck:
		a.client.Clock().Observe(m.HeartbeatAck.GetServerTimeMs())
		a.setStatus(func(s *state.Status) { s.LastHeartbeatAt = time.Now().UTC() })
	case *agentv1.Envelope_PortCheck:
		op := m.PortCheck.GetMeta().GetOpId()
		if !a.seen.Add(op) {
			return
		}
		go a.handlePortCheck(ctx, m.PortCheck)
	case *agentv1.Envelope_AgentUpdate:
		op := m.AgentUpdate.GetMeta().GetOpId()
		if !a.seen.Add(op) {
			return
		}
		a.send(&agentv1.Envelope{Body: &agentv1.Envelope_Ack{Ack: &agentv1.Ack{OpId: op}}}, conn.Critical)
		go a.handleUpdate(ctx, m.AgentUpdate)
	case *agentv1.Envelope_Revoke:
		op := m.Revoke.GetMeta().GetOpId()
		a.send(&agentv1.Envelope{Body: &agentv1.Envelope_Ack{Ack: &agentv1.Ack{OpId: op}}}, conn.Critical)
		a.handleRevoke(m.Revoke)
	case *agentv1.Envelope_Ack:
		if r := a.updates.PendingResult(); r != nil && r.OpID == m.Ack.GetOpId() {
			if err := a.updates.ResultSent(r.OpID); err != nil {
				a.log.Warn("could not clear the sent update result", "err", err)
			}
		}
	case *agentv1.Envelope_OpError:
		a.log.Warn("the control plane reported an error", "op_id", m.OpError.GetOpId(),
			"code", m.OpError.GetCode(), "detail", m.OpError.GetMessage())
	default:
		a.log.Debug("ignored an unexpected message", "type", fmt.Sprintf("%T", body.GetBody()))
	}
}

func (a *Agent) handlePortCheck(ctx context.Context, pc *agentv1.PortCheck) {
	op := pc.GetMeta().GetOpId()
	res, err := a.ports.Handle(ctx, pc)
	if err != nil {
		a.sendOpError(op, "VALIDATION_FAILED", err.Error())
		return
	}
	a.send(&agentv1.Envelope{Body: &agentv1.Envelope_PortCheckResult{PortCheckResult: res}}, conn.Critical)
}

func (a *Agent) handleUpdate(ctx context.Context, u *agentv1.AgentUpdate) {
	if !a.updating.CompareAndSwap(false, true) {
		a.sendOpError(u.GetMeta().GetOpId(), "VALIDATION_FAILED", "an update is already in progress")
		return
	}
	defer a.updating.Store(false)
	op := u.GetMeta().GetOpId()
	log := a.log.With("op_id", op, "to", u.GetVersion())
	log.Info("updating the agent")
	err := a.updates.Apply(ctx, u)
	if errors.Is(err, update.ErrAlreadyRunning) {
		a.sendUpdateResult(op, true, "")
		return
	}
	if err != nil {
		code := update.CodeRolledBack
		if errors.Is(err, update.ErrVerifyFailed) {
			code = update.CodeVerifyFailed
		}
		log.Warn("the update did not go through; this version keeps running", "err", err)
		a.sendUpdateResult(op, false, code+": "+logs.Scrub(err.Error()))
		return
	}
	// Give the writer a moment to flush, then exit so systemd starts the new binary.
	time.Sleep(500 * time.Millisecond)
	a.stop(ErrRestartForUpdate)
}

func (a *Agent) sendUpdateResult(op string, ok bool, msg string) {
	if len(msg) > 900 {
		msg = msg[:900]
	}
	a.send(&agentv1.Envelope{Body: &agentv1.Envelope_AgentUpdateResult{AgentUpdateResult: &agentv1.AgentUpdateResult{
		OpId: op, Success: ok, RunningVersion: buildinfo.Version, Error: msg,
	}}}, conn.Critical)
}

func (a *Agent) handleRevoke(r *agentv1.Revoke) {
	a.log.Warn("this server was removed from Lumen; stopping", "reason", r.GetReason())
	if err := a.o.Store.DeleteCredential(); err != nil {
		a.log.Error("could not delete the credential", "err", err)
	}
	a.setStatus(func(s *state.Status) { s.Connection = "revoked" })
	go func() {
		time.Sleep(500 * time.Millisecond) // let the Ack go out
		a.stop(ErrRevoked)
	}()
}

// probe checks Docker, keeps Caddy in place and reports both.
func (a *Agent) probe(ctx context.Context) heartbeat.Probe {
	var p heartbeat.Probe
	pctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	if _, err := a.docker.Version(pctx); err == nil {
		p.DockerOK = true
		if err := a.proxy.Ensure(ctx, *a.image.Load()); err != nil {
			a.log.Warn("the proxy is not ready", "err", err)
		}
		if n, err := a.docker.CountRunning(pctx); err == nil {
			p.ContainerCount = uint32(n) //nolint:gosec // container counts fit
		}
	} else {
		a.log.Warn("Docker is not responding; run: sudo systemctl restart docker", "err", err)
	}
	p.CaddyOK = a.proxy.Healthy(ctx)
	return p
}

func (a *Agent) observe(p heartbeat.Probe) {
	a.lastPrb.Store(&p)
	a.setStatus(func(s *state.Status) {
		s.DockerOK, s.CaddyOK = p.DockerOK, p.CaddyOK
		if a.sampler != nil {
			s.DiskLow = a.sampler.DiskLow()
		}
	})
}

func (a *Agent) containerCount(ctx context.Context) uint32 {
	if p := a.lastPrb.Load(); p != nil {
		return p.ContainerCount
	}
	_ = ctx
	return 0
}

func (a *Agent) self() *agentv1.AgentSelf {
	return &agentv1.AgentSelf{
		AgentRssBytes:   metrics.SelfRSS(a.o.ProcRoot),
		Goroutines:      uint32(max(0, goroutines())), //nolint:gosec // bounded
		SendQueueLen:    uint32(a.client.QueueLen()),  //nolint:gosec // bounded by the queue limit
		ReconnectsTotal: a.client.Reconnects(),
	}
}

func (a *Agent) setStatus(fn func(*state.Status)) {
	if a.o.Trial {
		return
	}
	a.statusMu.Lock()
	defer a.statusMu.Unlock()
	fn(&a.status)
	a.status.UpdatedAt = time.Now().UTC()
	if err := a.o.Store.WriteStatus(&a.status); err != nil {
		a.log.Debug("could not write status.json", "err", err)
	}
}

// watchUpdate confirms a freshly swapped binary or rolls it back.
func (a *Agent) watchUpdate(ctx context.Context) {
	deadline := time.NewTimer(update.HealthWindow)
	defer deadline.Stop()
	tick := time.NewTicker(time.Second)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-deadline.C:
			a.log.Error("the new agent did not become healthy within 60 s; rolling back")
			if err := a.updates.Rollback("health check timed out"); err != nil {
				a.log.Error("rollback failed", "err", err)
				return
			}
			a.stop(ErrRolledBack)
			return
		case <-tick.C:
			p := a.lastPrb.Load()
			if a.client.Online() && a.accepted.Load() && p != nil && p.DockerOK && p.CaddyOK {
				res, err := a.updates.Confirm()
				if err != nil {
					a.log.Warn("could not record the confirmed update", "err", err)
				}
				if res != nil {
					a.log.Info("the new agent is healthy", "version", buildinfo.Version)
					a.send(&agentv1.Envelope{Body: &agentv1.Envelope_AgentUpdateResult{AgentUpdateResult: &agentv1.AgentUpdateResult{
						OpId: res.OpID, Success: true, RunningVersion: res.RunningVersion,
					}}}, conn.Critical)
				}
				a.endProbation(ctx)
				return
			}
		}
	}
}

func (a *Agent) endProbation(ctx context.Context) {
	select {
	case <-ctx.Done():
	case <-time.After(update.Probation + time.Second):
		if err := a.updates.EndProbation(); err != nil {
			a.log.Warn("could not clear the update record", "err", err)
		}
	}
}

// trial connects once and returns nil when accepted with Docker and Caddy
// healthy within the timeout.
func (a *Agent) trial(ctx context.Context) error {
	limit := a.o.TrialTimeout
	if limit == 0 {
		limit = update.HealthWindow
	}
	ctx, cancel := context.WithTimeout(ctx, limit)
	defer cancel()
	go a.client.Run(ctx, a)
	tick := time.NewTicker(250 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return ErrTrialFailed
		case <-tick.C:
			if !a.accepted.Load() {
				continue
			}
			pctx, pcancel := context.WithTimeout(ctx, 3*time.Second)
			_, derr := a.docker.Version(pctx)
			pcancel()
			if derr == nil && a.proxy.Healthy(ctx) {
				a.log.Info("trial run healthy", "version", buildinfo.Version)
				return nil
			}
		}
	}
}
