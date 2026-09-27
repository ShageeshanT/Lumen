// Package httpx builds the HTTP client the agent uses to reach its control
// plane: system roots plus an optional extra CA bundle (LUMEN_CA_FILE, for
// private control planes), TLS 1.2+, and a transport tuned for one
// long-lived connection. It also enforces that the control plane is reached
// over HTTPS unless it is on the loopback interface.
package httpx

import (
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// ErrInsecureURL means a non-HTTPS control plane URL on a non-loopback host.
var ErrInsecureURL = errors.New("the control plane URL must start with https://")

// NewClient returns an HTTP client trusting the system roots and, when caFile
// is set, the certificates in it.
func NewClient(caFile string, timeout time.Duration) (*http.Client, error) {
	tlsCfg, err := TLSConfig(caFile)
	if err != nil {
		return nil, err
	}
	tr := &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		TLSClientConfig:       tlsCfg,
		DialContext:           (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
		IdleConnTimeout:       90 * time.Second,
		MaxIdleConns:          4,
	}
	return &http.Client{Transport: tr, Timeout: timeout}, nil
}

// TLSConfig returns the TLS settings shared by HTTP and WebSocket dials.
func TLSConfig(caFile string) (*tls.Config, error) {
	cfg := &tls.Config{MinVersion: tls.VersionTLS12}
	if caFile == "" {
		return cfg, nil
	}
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	pem, err := os.ReadFile(caFile) //nolint:gosec // operator-provided CA bundle path
	if err != nil {
		return nil, fmt.Errorf("read CA file %s: %w", caFile, err)
	}
	if !pool.AppendCertsFromPEM(pem) {
		return nil, fmt.Errorf("CA file %s has no PEM certificates", caFile)
	}
	cfg.RootCAs = pool
	return cfg, nil
}

// CheckControlPlaneURL parses raw and requires https, except for loopback
// hosts (local development).
func CheckControlPlaneURL(raw string) (*url.URL, error) {
	u, err := url.Parse(strings.TrimRight(strings.TrimSpace(raw), "/"))
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("the control plane URL %q is not a valid URL", raw)
	}
	switch u.Scheme {
	case "https":
		return u, nil
	case "http":
		if IsLoopback(u.Hostname()) {
			return u, nil
		}
	}
	return nil, ErrInsecureURL
}

// IsLoopback reports whether host is localhost or a loopback address.
func IsLoopback(host string) bool {
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// WebSocketURL turns https://cp into wss://cp/agent/v1.
func WebSocketURL(cp *url.URL) string {
	scheme := "wss"
	if cp.Scheme == "http" {
		scheme = "ws"
	}
	return scheme + "://" + cp.Host + strings.TrimRight(cp.Path, "/") + "/agent/v1"
}

// PeerFingerprint returns the SHA-256 of the leaf certificate of resp, or ""
// for plain HTTP.
func PeerFingerprint(resp *http.Response) string {
	if resp == nil || resp.TLS == nil || len(resp.TLS.PeerCertificates) == 0 {
		return ""
	}
	sum := sha256.Sum256(resp.TLS.PeerCertificates[0].Raw)
	return hex.EncodeToString(sum[:])
}
