// Package docker is a small Docker Engine API client over the local unix
// socket. It covers only what the agent needs so far (version probe,
// container create/start/inspect/remove, image pull, counting); Phase 03
// extends it. Using the HTTP API directly keeps the static binary small.
package docker

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// APIVersion is the Engine API version the agent speaks (Docker 24+).
const APIVersion = "v1.43"

// ErrNotFound is returned when a container or image does not exist.
var ErrNotFound = errors.New("docker: not found")

// Client talks to the Engine API.
type Client struct {
	http *http.Client
	base string
}

// New returns a client for socketPath (default /var/run/docker.sock, or
// DOCKER_HOST=unix://... when set).
func New(socketPath string) *Client {
	if socketPath == "" {
		socketPath = "/var/run/docker.sock"
		if h := os.Getenv("DOCKER_HOST"); strings.HasPrefix(h, "unix://") {
			socketPath = strings.TrimPrefix(h, "unix://")
		}
	}
	tr := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", socketPath)
		},
		MaxIdleConns:    2,
		IdleConnTimeout: 30 * time.Second,
	}
	return &Client{http: &http.Client{Transport: tr}, base: "http://docker/" + APIVersion}
}

// NewWithHTTP is for tests: base is an httptest server URL.
func NewWithHTTP(c *http.Client, base string) *Client {
	return &Client{http: c, base: strings.TrimRight(base, "/") + "/" + APIVersion}
}

// apiError carries the Engine's error message.
type apiError struct {
	Status  int
	Message string `json:"message"`
}

func (e *apiError) Error() string { return fmt.Sprintf("docker: %d %s", e.Status, e.Message) }

func (c *Client) do(ctx context.Context, method, path string, query url.Values, body, out any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("docker: encode %s: %w", path, err)
		}
		rdr = bytes.NewReader(b)
	}
	u := c.base + path
	if len(query) > 0 {
		u += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, method, u, rdr)
	if err != nil {
		return fmt.Errorf("docker: build %s: %w", path, err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("docker: %s %s: %w", method, path, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if resp.StatusCode >= 300 {
		e := &apiError{Status: resp.StatusCode}
		_ = json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(e)
		return e
	}
	if out == nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 16<<20))
		return nil
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("docker: decode %s: %w", path, err)
	}
	return nil
}

// Version is the subset of GET /version the agent uses.
type Version struct {
	Version    string `json:"Version"`
	APIVersion string `json:"ApiVersion"`
	Os         string `json:"Os"`
	Arch       string `json:"Arch"`
}

// Version returns the Engine version. An error means Docker is not usable.
func (c *Client) Version(ctx context.Context) (*Version, error) {
	var v Version
	if err := c.do(ctx, http.MethodGet, "/version", nil, nil, &v); err != nil {
		return nil, err
	}
	return &v, nil
}

// ContainerSummary is one row of GET /containers/json.
type ContainerSummary struct {
	ID     string            `json:"Id"`
	Names  []string          `json:"Names"`
	Image  string            `json:"Image"`
	State  string            `json:"State"`
	Labels map[string]string `json:"Labels"`
}

// ListContainers lists containers; all includes stopped ones. label filters
// by "key=value" when non-empty.
func (c *Client) ListContainers(ctx context.Context, all bool, label string) ([]ContainerSummary, error) {
	q := url.Values{}
	if all {
		q.Set("all", "1")
	}
	if label != "" {
		f, _ := json.Marshal(map[string][]string{"label": {label}})
		q.Set("filters", string(f))
	}
	var out []ContainerSummary
	if err := c.do(ctx, http.MethodGet, "/containers/json", q, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ContainerState is the part of an inspect result the agent reads.
type ContainerState struct {
	ID    string `json:"Id"`
	Name  string `json:"Name"`
	Image string `json:"Image"`
	State struct {
		Status     string `json:"Status"`
		Running    bool   `json:"Running"`
		Restarting bool   `json:"Restarting"`
	} `json:"State"`
	Config struct {
		Image  string            `json:"Image"`
		Labels map[string]string `json:"Labels"`
	} `json:"Config"`
}

// Inspect returns a container by name or id, or ErrNotFound.
func (c *Client) Inspect(ctx context.Context, name string) (*ContainerState, error) {
	var out ContainerState
	if err := c.do(ctx, http.MethodGet, "/containers/"+url.PathEscape(name)+"/json", nil, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CreateSpec is the container create body (Engine API ContainerCreate).
type CreateSpec struct {
	Image      string            `json:"Image"`
	Cmd        []string          `json:"Cmd,omitempty"`
	Env        []string          `json:"Env,omitempty"`
	Labels     map[string]string `json:"Labels,omitempty"`
	User       string            `json:"User,omitempty"`
	HostConfig HostConfig        `json:"HostConfig"`
}

// HostConfig is the subset of host settings Lumen sets.
type HostConfig struct {
	NetworkMode    string            `json:"NetworkMode,omitempty"`
	Binds          []string          `json:"Binds,omitempty"`
	RestartPolicy  RestartPolicy     `json:"RestartPolicy"`
	CapDrop        []string          `json:"CapDrop,omitempty"`
	CapAdd         []string          `json:"CapAdd,omitempty"`
	ReadonlyRootfs bool              `json:"ReadonlyRootfs"`
	PidsLimit      int64             `json:"PidsLimit,omitempty"`
	Memory         int64             `json:"Memory,omitempty"`
	SecurityOpt    []string          `json:"SecurityOpt,omitempty"`
	Tmpfs          map[string]string `json:"Tmpfs,omitempty"`
	Privileged     bool              `json:"Privileged"`
}

// RestartPolicy is Docker's restart policy.
type RestartPolicy struct {
	Name string `json:"Name"`
}

// Create creates a container named name and returns its id.
func (c *Client) Create(ctx context.Context, name string, spec *CreateSpec) (string, error) {
	var out struct {
		ID string `json:"Id"`
	}
	q := url.Values{"name": {name}}
	if err := c.do(ctx, http.MethodPost, "/containers/create", q, spec, &out); err != nil {
		return "", err
	}
	return out.ID, nil
}

// Start starts a container. Starting a running container is not an error.
func (c *Client) Start(ctx context.Context, id string) error {
	err := c.do(ctx, http.MethodPost, "/containers/"+url.PathEscape(id)+"/start", nil, nil, nil)
	var ae *apiError
	if errors.As(err, &ae) && ae.Status == http.StatusNotModified {
		return nil
	}
	return err
}

// Restart restarts a container.
func (c *Client) Restart(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodPost, "/containers/"+url.PathEscape(id)+"/restart", url.Values{"t": {"5"}}, nil, nil)
}

// Remove force-removes a container. Missing is not an error.
func (c *Client) Remove(ctx context.Context, id string) error {
	err := c.do(ctx, http.MethodDelete, "/containers/"+url.PathEscape(id), url.Values{"force": {"1"}}, nil, nil)
	if errors.Is(err, ErrNotFound) {
		return nil
	}
	return err
}

// ImageExists reports whether ref is present locally.
func (c *Client) ImageExists(ctx context.Context, ref string) (bool, error) {
	err := c.do(ctx, http.MethodGet, "/images/"+ref+"/json", nil, nil, nil)
	if errors.Is(err, ErrNotFound) {
		return false, nil
	}
	return err == nil, err
}

// Pull pulls ref (name[:tag][@digest]) and waits for completion.
func (c *Client) Pull(ctx context.Context, ref string) error {
	name, tagOrDigest := ref, ""
	if i := strings.Index(ref, "@"); i >= 0 {
		name, tagOrDigest = ref[:i], ref[i+1:]
	} else if i := strings.LastIndex(ref, ":"); i > strings.LastIndex(ref, "/") {
		name, tagOrDigest = ref[:i], ref[i+1:]
	}
	q := url.Values{"fromImage": {name}}
	if tagOrDigest != "" {
		q.Set("tag", tagOrDigest)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/images/create?"+q.Encode(), nil)
	if err != nil {
		return fmt.Errorf("docker: build pull: %w", err)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("docker: pull %s: %w", ref, err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode >= 300 {
		e := &apiError{Status: resp.StatusCode}
		_ = json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(e)
		return e
	}
	// The body is a JSON stream of progress messages; an "error" field means failure.
	dec := json.NewDecoder(resp.Body)
	for {
		var msg struct {
			Error string `json:"error"`
		}
		if err := dec.Decode(&msg); errors.Is(err, io.EOF) {
			return nil
		} else if err != nil {
			return fmt.Errorf("docker: pull %s: %w", ref, err)
		}
		if msg.Error != "" {
			return fmt.Errorf("docker: pull %s: %s", ref, msg.Error)
		}
	}
}

// CountRunning returns the number of running containers.
func (c *Client) CountRunning(ctx context.Context) (int, error) {
	list, err := c.ListContainers(ctx, false, "")
	if err != nil {
		return 0, err
	}
	return len(list), nil
}
