// Package provider detects which cloud a server runs on from the instance
// metadata service (PHASE-02 §4.7). Probes run in a fixed order with a 2 s
// timeout each; the first hit wins; failures fall back to "other". Probes
// never send credentials, and the AWS IMDSv2 token is discarded after use.
// deploy/agent-install.sh runs the same probes in shell.
package provider

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"
)

// Result is what detection found.
type Result struct {
	Provider    string // oracle | aws | gcp | azure | hetzner | digitalocean | other
	RegionLabel string
	PublicIP    string
}

// Endpoints lets tests point the probes at a fake metadata server.
type Endpoints struct {
	Metadata    string // default http://169.254.169.254
	GCPMetadata string // default http://metadata.google.internal
}

// DefaultEndpoints are the real metadata services.
var DefaultEndpoints = Endpoints{
	Metadata:    "http://169.254.169.254",
	GCPMetadata: "http://metadata.google.internal",
}

const probeTimeout = 2 * time.Second

// Detect runs the probes in order. It never returns an error: an
// unreachable metadata service simply means "other".
func Detect(ctx context.Context, ep Endpoints) Result {
	if ep.Metadata == "" {
		ep.Metadata = DefaultEndpoints.Metadata
	}
	if ep.GCPMetadata == "" {
		ep.GCPMetadata = DefaultEndpoints.GCPMetadata
	}
	// No proxy: metadata services are link-local and must not be proxied.
	client := &http.Client{
		Timeout: probeTimeout,
		Transport: &http.Transport{
			Proxy:       nil,
			DialContext: (&net.Dialer{Timeout: probeTimeout}).DialContext,
		},
	}
	p := &prober{ctx: ctx, client: client, ep: ep}
	for _, probe := range []func() (Result, bool){p.oracle, p.aws, p.gcp, p.azure, p.hetzner, p.digitalocean} {
		if ctx.Err() != nil {
			break
		}
		if r, ok := probe(); ok {
			return r
		}
	}
	return Result{Provider: "other"}
}

type prober struct {
	ctx    context.Context
	client *http.Client
	ep     Endpoints
}

func (p *prober) do(method, url string, headers map[string]string) (string, bool) {
	ctx, cancel := context.WithTimeout(p.ctx, probeTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, method, url, nil)
	if err != nil {
		return "", false
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return "", false
	}
	defer func() { _ = resp.Body.Close() }()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 256<<10))
	if err != nil || resp.StatusCode != http.StatusOK {
		return "", false
	}
	return string(body), true
}

func (p *prober) oracle() (Result, bool) {
	body, ok := p.do(http.MethodGet, p.ep.Metadata+"/opc/v2/instance/", map[string]string{"Authorization": "Bearer Oracle"})
	if !ok {
		return Result{}, false
	}
	var doc struct {
		CanonicalRegionName string `json:"canonicalRegionName"`
		Region              string `json:"region"`
		ID                  string `json:"id"`
	}
	if json.Unmarshal([]byte(body), &doc) != nil || doc.ID == "" {
		return Result{}, false
	}
	region := doc.CanonicalRegionName
	if region == "" {
		region = doc.Region
	}
	return Result{Provider: "oracle", RegionLabel: region}, true
}

func (p *prober) aws() (Result, bool) {
	token, ok := p.do(http.MethodPut, p.ep.Metadata+"/latest/api/token",
		map[string]string{"X-aws-ec2-metadata-token-ttl-seconds": "60"})
	if !ok || strings.TrimSpace(token) == "" {
		return Result{}, false
	}
	h := map[string]string{"X-aws-ec2-metadata-token": strings.TrimSpace(token)}
	id, ok := p.do(http.MethodGet, p.ep.Metadata+"/latest/meta-data/instance-id", h)
	if !ok || !strings.HasPrefix(strings.TrimSpace(id), "i-") {
		return Result{}, false
	}
	region, _ := p.do(http.MethodGet, p.ep.Metadata+"/latest/meta-data/placement/region", h)
	ip, _ := p.do(http.MethodGet, p.ep.Metadata+"/latest/meta-data/public-ipv4", h)
	// The token is dropped here; it is never stored or logged.
	return Result{Provider: "aws", RegionLabel: strings.TrimSpace(region), PublicIP: validIP(ip)}, true
}

func (p *prober) gcp() (Result, bool) {
	h := map[string]string{"Metadata-Flavor": "Google"}
	base := p.ep.GCPMetadata + "/computeMetadata/v1/instance"
	id, ok := p.do(http.MethodGet, base+"/id", h)
	if !ok || strings.TrimSpace(id) == "" {
		return Result{}, false
	}
	zone, _ := p.do(http.MethodGet, base+"/zone", h)
	ip, _ := p.do(http.MethodGet, base+"/network-interfaces/0/access-configs/0/external-ip", h)
	// zone looks like "projects/123/zones/europe-west1-b".
	z := strings.TrimSpace(zone)
	if i := strings.LastIndex(z, "/"); i >= 0 {
		z = z[i+1:]
	}
	return Result{Provider: "gcp", RegionLabel: z, PublicIP: validIP(ip)}, true
}

func (p *prober) azure() (Result, bool) {
	body, ok := p.do(http.MethodGet, p.ep.Metadata+"/metadata/instance?api-version=2021-02-01", map[string]string{"Metadata": "true"})
	if !ok {
		return Result{}, false
	}
	var doc struct {
		Compute struct {
			Location string `json:"location"`
			VMID     string `json:"vmId"`
		} `json:"compute"`
		Network struct {
			Interface []struct {
				IPv4 struct {
					IPAddress []struct {
						PublicIPAddress string `json:"publicIpAddress"`
					} `json:"ipAddress"`
				} `json:"ipv4"`
			} `json:"interface"`
		} `json:"network"`
	}
	if json.Unmarshal([]byte(body), &doc) != nil || doc.Compute.VMID == "" {
		return Result{}, false
	}
	r := Result{Provider: "azure", RegionLabel: doc.Compute.Location}
	if len(doc.Network.Interface) > 0 && len(doc.Network.Interface[0].IPv4.IPAddress) > 0 {
		r.PublicIP = validIP(doc.Network.Interface[0].IPv4.IPAddress[0].PublicIPAddress)
	}
	return r, true
}

func (p *prober) hetzner() (Result, bool) {
	body, ok := p.do(http.MethodGet, p.ep.Metadata+"/hetzner/v1/metadata", nil)
	if !ok {
		return Result{}, false
	}
	// A small YAML document of "key: value" lines.
	fields := map[string]string{}
	sc := bufio.NewScanner(strings.NewReader(body))
	for sc.Scan() {
		k, v, found := strings.Cut(sc.Text(), ":")
		if found && !strings.HasPrefix(k, " ") {
			fields[strings.TrimSpace(k)] = strings.Trim(strings.TrimSpace(v), `"`)
		}
	}
	if fields["instance-id"] == "" && fields["hostname"] == "" {
		return Result{}, false
	}
	region := fields["region"]
	if region == "" {
		region = fields["availability-zone"]
	}
	return Result{Provider: "hetzner", RegionLabel: region, PublicIP: validIP(fields["public-ipv4"])}, true
}

func (p *prober) digitalocean() (Result, bool) {
	id, ok := p.do(http.MethodGet, p.ep.Metadata+"/metadata/v1/id", nil)
	if !ok || strings.TrimSpace(id) == "" {
		return Result{}, false
	}
	region, _ := p.do(http.MethodGet, p.ep.Metadata+"/metadata/v1/region", nil)
	ip, _ := p.do(http.MethodGet, p.ep.Metadata+"/metadata/v1/interfaces/public/0/ipv4/address", nil)
	return Result{Provider: "digitalocean", RegionLabel: strings.TrimSpace(region), PublicIP: validIP(ip)}, true
}

func validIP(s string) string {
	s = strings.TrimSpace(s)
	if net.ParseIP(s) == nil {
		return ""
	}
	return s
}

// String renders a result for logs.
func (r Result) String() string {
	return fmt.Sprintf("%s (%s)", r.Provider, r.RegionLabel)
}
