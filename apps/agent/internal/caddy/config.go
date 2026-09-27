package caddy

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"os"
	"path/filepath"
	"time"

	"github.com/ShageeshanT/Lumen/apps/agent/assets"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/state"
)

// Server names in the Caddy config. Phase 03 adds app routes to these.
const (
	ServerHTTP  = "lumen_http"
	ServerHTTPS = "lumen_https"
	// FallbackTag selects the self-signed certificate used for connections
	// that match no app (IP-only HTTPS, the port-check probe).
	FallbackTag = "lumen-fallback"
)

// ServerForPort maps a public port to the Caddy server that listens on it.
func ServerForPort(port uint32) (string, bool) {
	switch port {
	case 80:
		return ServerHTTP, true
	case 443:
		return ServerHTTPS, true
	}
	return "", false
}

// catchAll is the last route of every server: the Lumen 404 page.
func catchAll(server string) map[string]any {
	return map[string]any{
		"@id": "lumen-catch-all-" + server,
		"handle": []any{map[string]any{
			"handler":     "static_response",
			"status_code": 404,
			"headers": map[string][]string{
				"Content-Type":           {"text/html; charset=utf-8"},
				"Cache-Control":          {"no-store"},
				"X-Content-Type-Options": {"nosniff"},
			},
			"body": assets.NotFoundPage,
		}},
	}
}

// DefaultConfig is the config the agent loads on every start. certPEM and
// keyPEM are the fallback certificate for :443.
func DefaultConfig(certPEM, keyPEM string) map[string]any {
	return map[string]any{
		"admin": map[string]any{"listen": AdminAddr},
		"logging": map[string]any{"logs": map[string]any{"default": map[string]any{
			"level": "WARN",
		}}},
		"apps": map[string]any{
			"http": map[string]any{
				"servers": map[string]any{
					ServerHTTP: map[string]any{
						"listen":          []string{":80"},
						"routes":          []any{catchAll(ServerHTTP)},
						"automatic_https": map[string]any{"disable": true},
					},
					ServerHTTPS: map[string]any{
						"listen": []string{":443"},
						"routes": []any{catchAll(ServerHTTPS)},
						"tls_connection_policies": []any{map[string]any{
							"certificate_selection": map[string]any{"any_tag": []string{FallbackTag}},
						}},
						"automatic_https": map[string]any{"disable": true},
					},
				},
			},
			"tls": map[string]any{
				"certificates": map[string]any{
					"load_pem": []any{map[string]any{
						"certificate": certPEM,
						"key":         keyPEM,
						"tags":        []string{FallbackTag},
					}},
				},
			},
		},
	}
}

// FallbackCert loads or creates the self-signed fallback certificate under
// dir. It is only used when no app certificate matches; browsers are never
// expected to trust it.
func FallbackCert(dir string) (certPEM, keyPEM string, err error) {
	certPath, keyPath := filepath.Join(dir, "fallback.crt"), filepath.Join(dir, "fallback.key")
	c, errC := os.ReadFile(certPath) //nolint:gosec // agent-owned path
	k, errK := os.ReadFile(keyPath)  //nolint:gosec // agent-owned path
	if errC == nil && errK == nil {
		return string(c), string(k), nil
	}
	if !errors.Is(errC, os.ErrNotExist) && errC != nil {
		return "", "", fmt.Errorf("read fallback cert: %w", errC)
	}
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return "", "", fmt.Errorf("generate fallback key: %w", err)
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 120))
	if err != nil {
		return "", "", fmt.Errorf("serial: %w", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: "lumen-fallback", Organization: []string{"Lumen"}},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().AddDate(10, 0, 0),
		KeyUsage:     x509.KeyUsageDigitalSignature,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		DNSNames:     []string{"lumen-fallback.invalid"},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &priv.PublicKey, priv)
	if err != nil {
		return "", "", fmt.Errorf("create fallback cert: %w", err)
	}
	keyDER, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		return "", "", fmt.Errorf("marshal fallback key: %w", err)
	}
	certPEM = string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}))
	keyPEM = string(pem.EncodeToMemory(&pem.Block{Type: "EC PRIVATE KEY", Bytes: keyDER}))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", "", fmt.Errorf("create %s: %w", dir, err)
	}
	if err := state.WriteFileAtomic(keyPath, []byte(keyPEM), 0o600); err != nil {
		return "", "", err
	}
	if err := state.WriteFileAtomic(certPath, []byte(certPEM), 0o644); err != nil { //nolint:gosec // public certificate
		return "", "", err
	}
	return certPEM, keyPEM, nil
}
