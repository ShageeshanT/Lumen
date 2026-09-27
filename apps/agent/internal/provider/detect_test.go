package provider

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// fake serves one provider's metadata endpoints and 404 for everything else.
func fake(t *testing.T, provider string) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	switch provider {
	case "oracle":
		mux.HandleFunc("/opc/v2/instance/", func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Authorization") != "Bearer Oracle" {
				http.Error(w, "no", http.StatusUnauthorized)
				return
			}
			_, _ = w.Write([]byte(`{"id":"ocid1.instance.oc1..x","canonicalRegionName":"eu-frankfurt-1","region":"fra"}`))
		})
	case "aws":
		mux.HandleFunc("/latest/api/token", func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodPut || r.Header.Get("X-aws-ec2-metadata-token-ttl-seconds") == "" {
				http.Error(w, "no", http.StatusMethodNotAllowed)
				return
			}
			_, _ = w.Write([]byte("tok"))
		})
		guard := func(body string) http.HandlerFunc {
			return func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("X-aws-ec2-metadata-token") != "tok" {
					http.Error(w, "no", http.StatusUnauthorized)
					return
				}
				_, _ = w.Write([]byte(body))
			}
		}
		mux.HandleFunc("/latest/meta-data/instance-id", guard("i-0abc"))
		mux.HandleFunc("/latest/meta-data/placement/region", guard("eu-central-1"))
		mux.HandleFunc("/latest/meta-data/public-ipv4", guard("198.51.100.7"))
	case "gcp":
		mux.HandleFunc("/computeMetadata/v1/instance/", func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Metadata-Flavor") != "Google" {
				http.Error(w, "no", http.StatusForbidden)
				return
			}
			switch r.URL.Path {
			case "/computeMetadata/v1/instance/id":
				_, _ = w.Write([]byte("123456"))
			case "/computeMetadata/v1/instance/zone":
				_, _ = w.Write([]byte("projects/1/zones/europe-west1-b"))
			case "/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip":
				_, _ = w.Write([]byte("203.0.113.9"))
			default:
				http.NotFound(w, r)
			}
		})
	case "azure":
		mux.HandleFunc("/metadata/instance", func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Metadata") != "true" {
				http.Error(w, "no", http.StatusBadRequest)
				return
			}
			_, _ = w.Write([]byte(`{"compute":{"location":"westeurope","vmId":"vm-1"},"network":{"interface":[{"ipv4":{"ipAddress":[{"publicIpAddress":"20.1.2.3"}]}}]}}`))
		})
	case "hetzner":
		mux.HandleFunc("/hetzner/v1/metadata", func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte("hostname: my-server\ninstance-id: 42\npublic-ipv4: 5.6.7.8\nregion: eu-central\navailability-zone: fsn1-dc14\n"))
		})
	case "digitalocean":
		mux.HandleFunc("/metadata/v1/id", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("9999")) })
		mux.HandleFunc("/metadata/v1/region", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ams3")) })
		mux.HandleFunc("/metadata/v1/interfaces/public/0/ipv4/address", func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte("159.1.2.3"))
		})
	}
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func TestDetectAllProviders(t *testing.T) {
	t.Parallel()
	cases := []struct {
		provider, region, ip string
	}{
		{"oracle", "eu-frankfurt-1", ""},
		{"aws", "eu-central-1", "198.51.100.7"},
		{"gcp", "europe-west1-b", "203.0.113.9"},
		{"azure", "westeurope", "20.1.2.3"},
		{"hetzner", "eu-central", "5.6.7.8"},
		{"digitalocean", "ams3", "159.1.2.3"},
		{"other", "", ""},
	}
	for _, tc := range cases {
		t.Run(tc.provider, func(t *testing.T) {
			t.Parallel()
			srv := fake(t, tc.provider)
			got := Detect(context.Background(), Endpoints{Metadata: srv.URL, GCPMetadata: srv.URL})
			if got.Provider != tc.provider || got.RegionLabel != tc.region || got.PublicIP != tc.ip {
				t.Fatalf("got %+v, want %s/%s/%s", got, tc.provider, tc.region, tc.ip)
			}
		})
	}
}

func TestDetectUnreachableIsOther(t *testing.T) {
	t.Parallel()
	// A closed port: every probe fails fast.
	srv := httptest.NewServer(http.NotFoundHandler())
	url := srv.URL
	srv.Close()
	got := Detect(context.Background(), Endpoints{Metadata: url, GCPMetadata: url})
	if got.Provider != "other" {
		t.Fatalf("got %+v", got)
	}
	if got.String() != "other ()" {
		t.Fatalf("string: %q", got.String())
	}
}
