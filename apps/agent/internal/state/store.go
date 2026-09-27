// Package state is the agent's local state on disk:
//
//	/var/lib/lumen/agent/            0700
//	  identity.json   Ed25519 keypair (and server id once joined)   0600
//	  credential      the server credential, one line               0600
//	  state.json      control plane, server id, update record, ...  0600
//	  status.json     runtime status written by `run`, read by `status` 0600
//
// Every write goes to a temp file in the same directory, is fsynced, and is
// renamed over the target, so a crash leaves either the old or the new file.
package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// DefaultDir is where the agent keeps its state on a server.
const DefaultDir = "/var/lib/lumen/agent"

// ErrNotFound means the file does not exist yet.
var ErrNotFound = errors.New("not found")

// Identity is the agent's keypair. It is created before the first join
// request and survives revocation, so a re-join reuses it.
type Identity struct {
	ServerID   string `json:"server_id,omitempty"`
	PublicKey  []byte `json:"public_key"`
	PrivateKey []byte `json:"private_key"`
}

// UpdateRecord tracks a self-update from swap to confirmation (PHASE-02 §4.10).
type UpdateRecord struct {
	OpID  string    `json:"op_id"`
	From  string    `json:"from"`
	To    string    `json:"to"`
	At    time.Time `json:"at"`
	Phase string    `json:"phase"` // pending | confirmed
	// Starts counts process starts of the new binary while pending or on
	// probation; three starts without settling roll back.
	Starts         int       `json:"starts"`
	ProbationUntil time.Time `json:"probation_until,omitzero"`
}

// UpdateResult is an AgentUpdateResult waiting to be sent on the next connection.
type UpdateResult struct {
	OpID           string `json:"op_id"`
	Success        bool   `json:"success"`
	RunningVersion string `json:"running_version"`
	Error          string `json:"error,omitempty"`
}

// State is everything the agent remembers besides its identity and credential.
type State struct {
	ServerID              string        `json:"server_id,omitempty"`
	Name                  string        `json:"name,omitempty"`
	ControlPlaneURL       string        `json:"control_plane_url,omitempty"`
	ControlPlaneWSURL     string        `json:"control_plane_ws_url,omitempty"`
	ControlPlanePublicKey []byte        `json:"control_plane_public_key,omitempty"`
	CertFingerprint       string        `json:"cert_fingerprint,omitempty"`
	JoinedAt              time.Time     `json:"joined_at,omitzero"`
	Provider              string        `json:"provider,omitempty"`
	RegionLabel           string        `json:"region_label,omitempty"`
	CaddyImage            string        `json:"caddy_image,omitempty"`
	Update                *UpdateRecord `json:"update,omitempty"`
	PendingUpdateResult   *UpdateResult `json:"pending_update_result,omitempty"`
}

// Status is the runtime status `lumen-agent run` publishes for `status`.
type Status struct {
	PID             int       `json:"pid"`
	AgentVersion    string    `json:"agent_version"`
	ServerID        string    `json:"server_id"`
	Name            string    `json:"name"`
	Connection      string    `json:"connection"` // connecting | online | offline | revoked
	ConnectedAt     time.Time `json:"connected_at,omitzero"`
	LastHeartbeatAt time.Time `json:"last_heartbeat_at,omitzero"`
	DockerOK        bool      `json:"docker_ok"`
	CaddyOK         bool      `json:"caddy_ok"`
	DiskLow         bool      `json:"disk_low"`
	LastError       string    `json:"last_error,omitempty"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// Store reads and writes the state directory.
type Store struct {
	Dir string
}

// New returns a store rooted at dir (DefaultDir when empty).
func New(dir string) *Store {
	if dir == "" {
		dir = DefaultDir
	}
	return &Store{Dir: dir}
}

// Ensure creates the directory with mode 0700 and tightens it if it exists.
func (s *Store) Ensure() error {
	if err := os.MkdirAll(s.Dir, 0o700); err != nil {
		return fmt.Errorf("create state dir: %w", err)
	}
	if err := os.Chmod(s.Dir, 0o700); err != nil { //nolint:gosec // a directory needs the execute bit
		return fmt.Errorf("chmod state dir: %w", err)
	}
	return nil
}

func (s *Store) path(name string) string { return filepath.Join(s.Dir, name) }

// WriteFileAtomic writes data to path via a temp file, fsync and rename.
func WriteFileAtomic(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpName := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpName) }
	if err := tmp.Chmod(perm); err != nil {
		_ = tmp.Close()
		cleanup()
		return fmt.Errorf("chmod temp file: %w", err)
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		cleanup()
		return fmt.Errorf("write temp file: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		cleanup()
		return fmt.Errorf("sync temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		cleanup()
		return fmt.Errorf("close temp file: %w", err)
	}
	if err := os.Rename(tmpName, path); err != nil {
		cleanup()
		return fmt.Errorf("rename into place: %w", err)
	}
	if d, err := os.Open(dir); err == nil { //nolint:gosec // dir is the store's own directory
		_ = d.Sync()
		_ = d.Close()
	}
	return nil
}

func (s *Store) readJSON(name string, v any) error {
	b, err := os.ReadFile(s.path(name))
	if errors.Is(err, os.ErrNotExist) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("read %s: %w", name, err)
	}
	if err := json.Unmarshal(b, v); err != nil {
		return fmt.Errorf("parse %s: %w", name, err)
	}
	return nil
}

func (s *Store) writeJSON(name string, v any) error {
	if err := s.Ensure(); err != nil {
		return err
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("encode %s: %w", name, err)
	}
	return WriteFileAtomic(s.path(name), append(b, '\n'), 0o600)
}

// LoadIdentity returns the stored identity or ErrNotFound.
func (s *Store) LoadIdentity() (*Identity, error) {
	var id Identity
	if err := s.readJSON("identity.json", &id); err != nil {
		return nil, err
	}
	return &id, nil
}

// SaveIdentity writes identity.json.
func (s *Store) SaveIdentity(id *Identity) error { return s.writeJSON("identity.json", id) }

// LoadState returns the stored state, or an empty State when none exists.
func (s *Store) LoadState() (*State, error) {
	var st State
	if err := s.readJSON("state.json", &st); err != nil {
		if errors.Is(err, ErrNotFound) {
			return &State{}, nil
		}
		return nil, err
	}
	return &st, nil
}

// SaveState writes state.json.
func (s *Store) SaveState(st *State) error { return s.writeJSON("state.json", st) }

// UpdateState loads, mutates and saves state.json.
func (s *Store) UpdateState(fn func(*State)) (*State, error) {
	st, err := s.LoadState()
	if err != nil {
		return nil, err
	}
	fn(st)
	if err := s.SaveState(st); err != nil {
		return nil, err
	}
	return st, nil
}

// LoadCredential returns the credential or ErrNotFound.
func (s *Store) LoadCredential() (string, error) {
	b, err := os.ReadFile(s.path("credential"))
	if errors.Is(err, os.ErrNotExist) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("read credential: %w", err)
	}
	c := strings.TrimSpace(string(b))
	if c == "" {
		return "", ErrNotFound
	}
	return c, nil
}

// SaveCredential writes the credential atomically with mode 0600.
func (s *Store) SaveCredential(c string) error {
	if err := s.Ensure(); err != nil {
		return err
	}
	return WriteFileAtomic(s.path("credential"), []byte(c+"\n"), 0o600)
}

// DeleteCredential removes the credential (revocation). Missing is fine.
func (s *Store) DeleteCredential() error {
	if err := os.Remove(s.path("credential")); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("delete credential: %w", err)
	}
	return nil
}

// CredentialPath is the file systemd's ConditionPathExists watches.
func (s *Store) CredentialPath() string { return s.path("credential") }

// WriteStatus publishes the runtime status.
func (s *Store) WriteStatus(st *Status) error { return s.writeJSON("status.json", st) }

// ReadStatus returns the last published runtime status or ErrNotFound.
func (s *Store) ReadStatus() (*Status, error) {
	var st Status
	if err := s.readJSON("status.json", &st); err != nil {
		return nil, err
	}
	return &st, nil
}
