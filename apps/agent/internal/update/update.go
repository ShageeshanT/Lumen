package update

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/httpx"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/state"
	agentv1 "github.com/ShageeshanT/Lumen/packages/protocol/gen/go/lumen/agent/v1"
)

const (
	// MaxBinaryBytes caps a download.
	MaxBinaryBytes = 128 << 20
	// HealthWindow is how long a new binary has to connect and report
	// Docker and Caddy healthy after it starts.
	HealthWindow = 60 * time.Second
	// Probation is how long after confirmation a crash loop still rolls back.
	Probation = 10 * time.Minute
	// MaxStarts is how many starts a new binary gets before rolling back.
	MaxStarts = 3
)

// Error codes reported in AgentUpdateResult.error (packages/shared catalog).
const (
	CodeVerifyFailed = "UPDATE_VERIFY_FAILED"
	CodeRolledBack   = "UPDATE_ROLLED_BACK"
)

// ErrAlreadyRunning means the requested version is the running one.
var ErrAlreadyRunning = errors.New("this version is already running")

// TrialError means the new binary failed its trial run.
type TrialError struct{ Output string }

func (e *TrialError) Error() string { return "the new agent failed its trial run: " + e.Output }

// Manager applies updates and runs the rollback logic.
type Manager struct {
	BinPath   string // e.g. /usr/local/bin/lumen-agent
	Store     *state.Store
	Client    *http.Client
	PublicKey string
	Version   string // the running version
	Log       *slog.Logger
	// TrialTimeout defaults to HealthWindow.
	TrialTimeout time.Duration
	// Now is replaced in tests.
	Now func() time.Time
}

func (m *Manager) now() time.Time {
	if m.Now != nil {
		return m.Now()
	}
	return time.Now()
}

// Apply downloads, verifies and trial-runs the new binary, then swaps it in
// and records the pending update. On nil the caller must exit 0 so systemd
// starts the new binary; containers are untouched by the restart.
func (m *Manager) Apply(ctx context.Context, u *agentv1.AgentUpdate) error {
	if u.GetVersion() == m.Version && !u.GetForce() {
		return ErrAlreadyRunning
	}
	st, err := m.Store.LoadState()
	if err != nil {
		return err
	}
	if st.Update != nil && st.Update.OpID == u.GetMeta().GetOpId() {
		return nil // duplicate delivery of an update already swapped in
	}
	data, err := m.download(ctx, u.GetUrl())
	if err != nil {
		return err
	}
	if err := Verify(data, u.GetSha256(), u.GetSignature(), m.PublicKey); err != nil {
		return err
	}
	newPath := m.BinPath + ".new"
	if err := state.WriteFileAtomic(newPath, data, 0o755); err != nil { //nolint:gosec // executable binary
		return err
	}
	if err := m.trial(ctx, newPath, u.GetMeta().GetOpId()); err != nil {
		_ = os.Remove(newPath)
		return err
	}
	// Keep exactly one previous binary.
	if err := os.Rename(m.BinPath, m.BinPath+".prev"); err != nil {
		_ = os.Remove(newPath)
		return fmt.Errorf("keep the previous binary: %w", err)
	}
	if err := os.Rename(newPath, m.BinPath); err != nil {
		_ = os.Rename(m.BinPath+".prev", m.BinPath)
		return fmt.Errorf("swap in the new binary: %w", err)
	}
	if _, err := m.Store.UpdateState(func(s *state.State) {
		s.Update = &state.UpdateRecord{
			OpID: u.GetMeta().GetOpId(), From: m.Version, To: u.GetVersion(),
			At: m.now().UTC(), Phase: "pending",
		}
		s.PendingUpdateResult = nil
	}); err != nil {
		return err
	}
	m.Log.Info("the new agent is in place; restarting into it", "from", m.Version, "to", u.GetVersion(), "op_id", u.GetMeta().GetOpId())
	return nil
}

func (m *Manager) download(ctx context.Context, raw string) ([]byte, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "https" && (u.Scheme != "http" || !httpx.IsLoopback(u.Hostname()))) {
		return nil, fmt.Errorf("%w: the update URL must be https", ErrVerifyFailed)
	}
	dctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	req, err := http.NewRequestWithContext(dctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, fmt.Errorf("build download request: %w", err)
	}
	resp, err := m.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download the new agent: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("download the new agent: HTTP %d", resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, MaxBinaryBytes+1))
	if err != nil {
		return nil, fmt.Errorf("download the new agent: %w", err)
	}
	if len(data) > MaxBinaryBytes {
		return nil, fmt.Errorf("%w: the download is larger than %d MB", ErrVerifyFailed, MaxBinaryBytes>>20)
	}
	return data, nil
}

// trial runs `<new> run --trial <op_id>`: the new binary must connect, get
// accepted and see Docker and Caddy healthy, then exit 0. A binary that
// crashes or exits early never replaces the running one.
func (m *Manager) trial(ctx context.Context, path, opID string) error {
	limit := m.TrialTimeout
	if limit == 0 {
		limit = HealthWindow
	}
	tctx, cancel := context.WithTimeout(ctx, limit+5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(tctx, path, "run", "--trial", opID, "--trial-timeout", limit.String()) //nolint:gosec // our own verified binary
	cmd.Env = os.Environ()
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	if err := cmd.Run(); err != nil {
		tail := strings.TrimSpace(out.String())
		if len(tail) > 500 {
			tail = tail[len(tail)-500:]
		}
		return &TrialError{Output: fmt.Sprintf("%v: %s", err, tail)}
	}
	return nil
}

// StartDecision tells the run loop what to do about an update in progress.
type StartDecision int

const (
	// NoUpdate means nothing is pending.
	NoUpdate StartDecision = iota
	// WatchHealth means this is a freshly swapped binary: confirm it within
	// HealthWindow or roll back.
	WatchHealth
	// OnProbation means the update was confirmed recently.
	OnProbation
	// RolledBack means OnStart restored the previous binary; exit non-zero so
	// systemd starts it.
	RolledBack
)

// OnStart runs before anything else in `run`.
func (m *Manager) OnStart() (StartDecision, error) {
	st, err := m.Store.LoadState()
	if err != nil {
		return NoUpdate, err
	}
	u := st.Update
	if u == nil {
		return NoUpdate, nil
	}
	if m.Version != u.To {
		// We are the previous binary again (rolled back); the pending result
		// is sent on the next connection.
		if _, err := m.Store.UpdateState(func(s *state.State) {
			if s.PendingUpdateResult == nil {
				s.PendingUpdateResult = &state.UpdateResult{OpID: u.OpID, Success: false, RunningVersion: m.Version, Error: CodeRolledBack}
			}
			s.Update = nil
		}); err != nil {
			return NoUpdate, err
		}
		return NoUpdate, nil
	}
	if u.Phase == "confirmed" && m.now().After(u.ProbationUntil) {
		_, err := m.Store.UpdateState(func(s *state.State) { s.Update = nil })
		return NoUpdate, err
	}
	u.Starts++
	if u.Starts > MaxStarts {
		m.Log.Error("the new agent keeps restarting; rolling back", "to", u.From, "starts", u.Starts)
		return RolledBack, m.Rollback("crash loop after update")
	}
	if _, err := m.Store.UpdateState(func(s *state.State) { s.Update = u }); err != nil {
		return NoUpdate, err
	}
	if u.Phase == "confirmed" {
		return OnProbation, nil
	}
	return WatchHealth, nil
}

// Confirm marks the running update healthy and queues the success result.
func (m *Manager) Confirm() (*state.UpdateResult, error) {
	var res *state.UpdateResult
	_, err := m.Store.UpdateState(func(s *state.State) {
		if s.Update == nil || s.Update.Phase != "pending" {
			return
		}
		s.Update.Phase = "confirmed"
		s.Update.Starts = 0
		s.Update.GuardStarts = 0
		s.Update.ProbationUntil = m.now().Add(Probation).UTC()
		res = &state.UpdateResult{OpID: s.Update.OpID, Success: true, RunningVersion: m.Version}
		s.PendingUpdateResult = res
	})
	return res, err
}

// EndProbation clears the update record once the probation window passed.
func (m *Manager) EndProbation() error {
	_, err := m.Store.UpdateState(func(s *state.State) {
		if s.Update != nil && s.Update.Phase == "confirmed" && m.now().After(s.Update.ProbationUntil) {
			s.Update = nil
		}
	})
	return err
}

// Rollback restores the previous binary and records the failure. The caller
// exits non-zero afterwards so systemd starts the restored binary.
func (m *Manager) Rollback(reason string) error {
	prev := m.BinPath + ".prev"
	if _, err := os.Stat(prev); err != nil {
		return fmt.Errorf("no previous binary to roll back to: %w", err)
	}
	st, err := m.Store.LoadState()
	if err != nil {
		return err
	}
	from := m.Version
	opID := ""
	if st.Update != nil {
		from, opID = st.Update.From, st.Update.OpID
	}
	_ = os.Remove(m.BinPath + ".failed")
	if err := os.Rename(m.BinPath, m.BinPath+".failed"); err != nil {
		return fmt.Errorf("move the failed binary aside: %w", err)
	}
	if err := os.Rename(prev, m.BinPath); err != nil {
		_ = os.Rename(m.BinPath+".failed", m.BinPath)
		return fmt.Errorf("restore the previous binary: %w", err)
	}
	_, err = m.Store.UpdateState(func(s *state.State) {
		s.Update = nil
		s.PendingUpdateResult = &state.UpdateResult{
			OpID: opID, Success: false, RunningVersion: from, Error: CodeRolledBack + ": " + reason,
		}
	})
	m.Log.Warn("rolled back to the previous agent", "version", from, "reason", reason, "op_id", opID)
	return err
}

// GuardMaxStarts is how many starts the guard allows a freshly updated binary
// before restoring the previous one.
const GuardMaxStarts = 5

// Guard runs as the systemd ExecStartPre, executed from the *previous*
// binary (`lumen-agent.prev update-guard`), before every start of the agent.
// It covers the case the new binary's own checks cannot: a binary that
// passed its trial run but then crashes before it can roll itself back.
// While an update is in progress it counts starts; past GuardMaxStarts it
// restores the previous binary and records the failure. It returns true when
// it rolled back.
func (m *Manager) Guard() (bool, error) {
	st, err := m.Store.LoadState()
	if err != nil {
		return false, err
	}
	if st.Update == nil {
		return false, nil
	}
	st.Update.GuardStarts++
	if st.Update.GuardStarts <= GuardMaxStarts {
		return false, m.Store.SaveState(st)
	}
	if err := m.Rollback(fmt.Sprintf("the new agent failed to start %d times", GuardMaxStarts)); err != nil {
		return false, err
	}
	return true, nil
}

// PendingResult returns the result waiting to be sent, if any.
func (m *Manager) PendingResult() *state.UpdateResult {
	st, err := m.Store.LoadState()
	if err != nil {
		return nil
	}
	return st.PendingUpdateResult
}

// ResultSent clears the pending result once it is on the wire.
func (m *Manager) ResultSent(opID string) error {
	_, err := m.Store.UpdateState(func(s *state.State) {
		if s.PendingUpdateResult != nil && s.PendingUpdateResult.OpID == opID {
			s.PendingUpdateResult = nil
		}
	})
	return err
}
