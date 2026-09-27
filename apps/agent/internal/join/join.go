package join

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/httpx"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/logs"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/state"
)

var (
	// ErrTokenInvalid covers expired, used and unknown tokens: the control
	// plane answers all three with the same 401 on purpose.
	ErrTokenInvalid = errors.New("the join token has expired or was already used")
	// ErrUnreachable means the control plane could not be reached.
	ErrUnreachable = errors.New("the control plane could not be reached")
)

// HostFacts are sent with the join request and in AgentHello.
type HostFacts struct {
	OS              string `json:"os"`
	OSVersion       string `json:"os_version"`
	Arch            string `json:"arch"`
	CPUCores        uint32 `json:"cpu_cores"`
	MemoryBytes     uint64 `json:"memory_bytes"`
	DiskBytes       uint64 `json:"disk_bytes"`
	DockerVersion   string `json:"docker_version"`
	PublicIP        string `json:"public_ip"`
	Hostname        string `json:"hostname"`
	Kernel          string `json:"kernel"`
	AgentVersion    string `json:"agent_version"`
	ProtocolVersion uint32 `json:"protocol_version"`
	Provider        string `json:"provider"`
	RegionLabel     string `json:"region_label"`
}

// Options configure a join.
type Options struct {
	ControlPlane string
	Token        string
	Client       *http.Client
	Store        *state.Store
	Facts        HostFacts
	// TrustNewCert accepts a changed control-plane certificate fingerprint.
	TrustNewCert bool
}

// Result is what a successful join (or an existing valid join) returns.
type Result struct {
	ServerID      string
	Name          string
	AlreadyJoined bool
	// CertChanged is set when the control plane's certificate differs from
	// the one recorded at the first join (a warning, not an error).
	CertChanged bool
}

type joinResponse struct {
	ServerID              string `json:"server_id"`
	Name                  string `json:"name"`
	Credential            string `json:"credential"`
	ControlPlaneWSURL     string `json:"control_plane_ws_url"`
	ControlPlanePublicKey string `json:"control_plane_public_key"`
	ObservedIP            string `json:"observed_ip"`
}

// CheckCredential asks the control plane whether the stored credential is
// valid. It returns the server id and name when it is.
func CheckCredential(ctx context.Context, client *http.Client, s *state.Store) (string, string, error) {
	st, err := s.LoadState()
	if err != nil {
		return "", "", err
	}
	cred, err := s.LoadCredential()
	if err != nil {
		return "", "", err
	}
	if st.ServerID == "" || st.ControlPlaneURL == "" {
		return "", "", state.ErrNotFound
	}
	logs.AddSecret(cred)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, st.ControlPlaneURL+"/agent/v1/credential", nil)
	if err != nil {
		return "", "", fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+st.ServerID+"."+cred)
	resp, err := client.Do(req)
	if err != nil {
		return "", "", fmt.Errorf("%w: %w", ErrUnreachable, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusNotFound {
		return "", "", ErrTokenInvalid
	}
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("credential check: HTTP %d", resp.StatusCode)
	}
	var out struct {
		ServerID string `json:"server_id"`
		Name     string `json:"name"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&out); err != nil {
		return "", "", fmt.Errorf("credential check: %w", err)
	}
	return out.ServerID, out.Name, nil
}

// Run performs the join. Re-running with a valid credential is a no-op; with
// a revoked or missing credential it joins again, reusing the identity.
func Run(ctx context.Context, o Options) (*Result, error) {
	cp, err := httpx.CheckControlPlaneURL(o.ControlPlane)
	if err != nil {
		return nil, err
	}
	base := cp.String()
	if err := o.Store.Ensure(); err != nil {
		return nil, err
	}
	st, err := o.Store.LoadState()
	if err != nil {
		return nil, err
	}
	if st.ServerID != "" && sameControlPlane(st.ControlPlaneURL, base) {
		if id, name, err := CheckCredential(ctx, o.Client, o.Store); err == nil {
			return &Result{ServerID: id, Name: name, AlreadyJoined: true}, nil
		} else if errors.Is(err, ErrUnreachable) {
			return nil, err
		}
	}
	if strings.TrimSpace(o.Token) == "" {
		return nil, ErrTokenInvalid
	}
	logs.AddSecret(o.Token)

	id, _, err := EnsureIdentity(o.Store)
	if err != nil {
		return nil, err
	}
	payload, err := json.Marshal(map[string]any{
		"join_token": o.Token,
		"public_key": base64.StdEncoding.EncodeToString(id.PublicKey),
		"host":       o.Facts,
	})
	if err != nil {
		return nil, fmt.Errorf("encode join request: %w", err)
	}
	reqCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, base+"/agent/v1/join", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("build join request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := o.Client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUnreachable, err)
	}
	defer func() { _ = resp.Body.Close() }()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 256<<10))
	switch {
	case resp.StatusCode == http.StatusUnauthorized:
		return nil, ErrTokenInvalid
	case resp.StatusCode == http.StatusTooManyRequests:
		return nil, fmt.Errorf("too many join attempts from this address; wait a minute and run the command again")
	case resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated:
		return nil, fmt.Errorf("join failed: HTTP %d: %s", resp.StatusCode, apiErrorTitle(body))
	}
	var jr joinResponse
	if err := json.Unmarshal(body, &jr); err != nil {
		return nil, fmt.Errorf("join response: %w", err)
	}
	cpKey, err := base64.StdEncoding.DecodeString(jr.ControlPlanePublicKey)
	if err != nil || len(cpKey) != 32 || jr.ServerID == "" || jr.Credential == "" {
		return nil, fmt.Errorf("join response is incomplete")
	}
	logs.AddSecret(jr.Credential)

	res := &Result{ServerID: jr.ServerID, Name: jr.Name}
	fp := httpx.PeerFingerprint(resp)
	if st.CertFingerprint != "" && fp != "" && fp != st.CertFingerprint && !o.TrustNewCert {
		res.CertChanged = true
	}
	wsURL := jr.ControlPlaneWSURL
	if wsURL == "" {
		wsURL = httpx.WebSocketURL(cp)
	}
	// Credential first (atomic), then state: a crash in between leaves a
	// credential without a server id, which `status` treats as not joined and
	// a re-run with a fresh token repairs.
	if err := o.Store.SaveCredential(jr.Credential); err != nil {
		return nil, err
	}
	id.ServerID = jr.ServerID
	if err := o.Store.SaveIdentity(id); err != nil {
		return nil, err
	}
	if _, err := o.Store.UpdateState(func(s *state.State) {
		s.ServerID = jr.ServerID
		s.Name = jr.Name
		s.ControlPlaneURL = base
		s.ControlPlaneWSURL = wsURL
		s.ControlPlanePublicKey = cpKey
		if fp != "" && (s.CertFingerprint == "" || o.TrustNewCert) {
			s.CertFingerprint = fp
		}
		s.JoinedAt = time.Now().UTC()
		s.PendingUpdateResult = nil
		s.Update = nil
	}); err != nil {
		return nil, err
	}
	return res, nil
}

func sameControlPlane(a, b string) bool {
	ua, err1 := url.Parse(a)
	ub, err2 := url.Parse(b)
	return err1 == nil && err2 == nil && ua.Host == ub.Host && ua.Scheme == ub.Scheme
}

func apiErrorTitle(body []byte) string {
	var e struct {
		Error struct {
			Title string `json:"title"`
		} `json:"error"`
	}
	if json.Unmarshal(body, &e) == nil && e.Error.Title != "" {
		return e.Error.Title
	}
	return strings.TrimSpace(string(body[:min(len(body), 200)]))
}
