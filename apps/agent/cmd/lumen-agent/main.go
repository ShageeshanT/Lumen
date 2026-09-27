// Command lumen-agent runs on every server Lumen manages. It dials out to the
// control plane over one WebSocket, keeps the platform proxy running, reports
// heartbeats and host metrics, and updates itself (SPEC B5, PHASE-02).
//
//	lumen-agent join --control-plane https://cp --token <join-token>
//	lumen-agent run
//	lumen-agent status [--json] [--check-credential] [--wait-online 90]
//	lumen-agent uninstall [--yes] [--keep-data]
//	lumen-agent version
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/agent"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/buildinfo"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/docker"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/hostinfo"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/httpx"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/join"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/logs"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/provider"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/state"
)

// Exit codes the installer relies on.
const (
	exitOK           = 0
	exitFailure      = 1
	exitUsage        = 2
	exitTokenInvalid = 3
	exitUnreachable  = 4
)

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func env(key, def string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return def
}

func store() *state.Store { return state.New(env("LUMEN_STATE_DIR", state.DefaultDir)) }

func usage(w io.Writer) {
	fmt.Fprint(w, `Usage: lumen-agent <command> [flags]

Commands:
  join       Connect this server to a Lumen control plane with a join token
  run        Run the agent (systemd starts this)
  status     Show whether this server is joined and connected
  uninstall  Remove the agent, its proxy container and its data
  version    Print the version
`)
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		usage(stderr)
		return exitUsage
	}
	switch args[0] {
	case "--version", "-v", "version":
		return cmdVersion(args[1:], stdout, stderr)
	case "join":
		return cmdJoin(args[1:], stdout, stderr)
	case "run":
		return cmdRun(args[1:], stdout, stderr)
	case "status":
		return cmdStatus(args[1:], stdout, stderr)
	case "uninstall":
		return cmdUninstall(args[1:], os.Stdin, stdout, stderr)
	case "-h", "--help", "help":
		usage(stdout)
		return exitOK
	default:
		fmt.Fprintf(stderr, "lumen-agent: unknown command %q\n\n", args[0])
		usage(stderr)
		return exitUsage
	}
}

func cmdVersion(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("version", flag.ContinueOnError)
	fs.SetOutput(stderr)
	asJSON := fs.Bool("json", false, "print JSON")
	if err := fs.Parse(args); err != nil {
		return exitUsage
	}
	if *asJSON {
		_ = json.NewEncoder(stdout).Encode(map[string]any{
			"version": buildinfo.Version, "commit": buildinfo.Commit, "build_date": buildinfo.BuildDate,
			"protocol_version": buildinfo.ProtocolVersion,
		})
		return exitOK
	}
	fmt.Fprintln(stdout, buildinfo.String())
	return exitOK
}

func signalContext() (context.Context, context.CancelFunc) {
	return signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
}

func cmdJoin(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("join", flag.ContinueOnError)
	fs.SetOutput(stderr)
	cp := fs.String("control-plane", env("LUMEN_CONTROL_PLANE", ""), "control plane URL (https://...)")
	token := fs.String("token", "", "join token from Servers → Add server")
	caFile := fs.String("ca-file", env("LUMEN_CA_FILE", ""), "extra CA bundle for a private control plane")
	trustNew := fs.Bool("trust-new-cert", false, "accept a changed control-plane certificate")
	if err := fs.Parse(args); err != nil {
		return exitUsage
	}
	if *cp == "" {
		fmt.Fprintln(stderr, "lumen-agent: --control-plane is required. Copy the full command from Servers → Add server.")
		return exitUsage
	}
	client, err := httpx.NewClient(*caFile, 60*time.Second)
	if err != nil {
		fmt.Fprintf(stderr, "lumen-agent: %v\n", err)
		return exitUsage
	}
	ctx, cancel := signalContext()
	defer cancel()
	dc := docker.New("")
	prov := provider.Detect(ctx, metadataEndpoints())
	facts := hostinfo.Gather(ctx, hostinfo.Sources{}, dc, prov)
	res, err := join.Run(ctx, join.Options{
		ControlPlane: *cp, Token: *token, Client: client, Store: store(), Facts: facts, TrustNewCert: *trustNew,
	})
	switch {
	case errors.Is(err, join.ErrTokenInvalid):
		fmt.Fprintln(stderr, "This join command has expired or was already used. Create a new one in Lumen: Servers → Add server.")
		return exitTokenInvalid
	case errors.Is(err, join.ErrUnreachable):
		fmt.Fprintf(stderr, "Couldn't reach the control plane at %s. Check the URL and that this server can reach it over HTTPS, then run the command again.\n", *cp)
		fmt.Fprintf(stderr, "Details: %s\n", logs.Scrub(err.Error()))
		return exitUnreachable
	case errors.Is(err, httpx.ErrInsecureURL):
		fmt.Fprintln(stderr, "The control plane URL must start with https://. Copy the full command from Servers → Add server.")
		return exitUsage
	case err != nil:
		fmt.Fprintf(stderr, "The join didn't finish: %s. Run the command again; it's safe to repeat.\n", logs.Scrub(err.Error()))
		return exitFailure
	}
	if res.CertChanged {
		fmt.Fprintln(stderr, "Warning: the control plane's certificate changed since this server first joined. If you didn't expect that, stop and check. Use --trust-new-cert to accept it.")
	}
	if res.AlreadyJoined {
		fmt.Fprintf(stdout, "Already joined as %s (%s)\n", res.Name, res.ServerID)
		return exitOK
	}
	fmt.Fprintf(stdout, "Joined as %s (%s). Starting agent…\n", res.Name, res.ServerID)
	return exitOK
}

func metadataEndpoints() provider.Endpoints {
	return provider.Endpoints{Metadata: env("LUMEN_METADATA_URL", ""), GCPMetadata: env("LUMEN_GCP_METADATA_URL", "")}
}

func cmdRun(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	fs.SetOutput(stderr)
	trialOp := fs.String("trial", "", "internal: health-check this binary for update <op_id> and exit")
	trialTimeout := fs.Duration("trial-timeout", 60*time.Second, "internal: trial time limit")
	if err := fs.Parse(args); err != nil {
		return exitUsage
	}
	log := logs.New(stdout, env("LUMEN_LOG_LEVEL", "info"))
	releaseKey := buildinfo.ReleasePublicKey
	if releaseKey == "" {
		// Development builds only: production builds embed the key and
		// ignore the environment.
		releaseKey = env("LUMEN_RELEASE_PUBKEY", "")
	}
	ctx, cancel := signalContext()
	defer cancel()
	err := agent.Run(ctx, agent.Options{
		Store:        store(),
		Log:          log,
		BinPath:      env("LUMEN_BIN_PATH", "/usr/local/bin/lumen-agent"),
		CAFile:       env("LUMEN_CA_FILE", ""),
		ProcRoot:     env("LUMEN_PROC_ROOT", ""),
		CaddyRoot:    env("LUMEN_CADDY_ROOT", ""),
		CaddyAdmin:   env("LUMEN_CADDY_ADMIN", ""),
		Metadata:     metadataEndpoints(),
		ReleaseKey:   releaseKey,
		Trial:        *trialOp != "",
		TrialTimeout: *trialTimeout,
	})
	switch {
	case err == nil:
		return exitOK
	case errors.Is(err, agent.ErrRestartForUpdate), errors.Is(err, agent.ErrRevoked):
		log.Info(err.Error())
		return exitOK
	case errors.Is(err, agent.ErrNotJoined):
		fmt.Fprintln(stderr, "This server hasn't joined Lumen yet. Run the join command from Servers → Add server.")
		return exitFailure
	default:
		log.Error("the agent stopped", "err", err)
		return exitFailure
	}
}

func cmdStatus(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("status", flag.ContinueOnError)
	fs.SetOutput(stderr)
	asJSON := fs.Bool("json", false, "print JSON")
	check := fs.Bool("check-credential", false, "ask the control plane whether the credential is valid")
	wait := fs.Int("wait-online", 0, "wait up to N seconds for the agent to report online")
	if err := fs.Parse(args); err != nil {
		return exitUsage
	}
	s := store()
	if *check {
		client, err := httpx.NewClient(env("LUMEN_CA_FILE", ""), 15*time.Second)
		if err != nil {
			fmt.Fprintf(stderr, "lumen-agent: %v\n", err)
			return exitFailure
		}
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		id, name, err := join.CheckCredential(ctx, client, s)
		if err != nil {
			fmt.Fprintln(stderr, "This server's credential isn't valid (not joined, or removed from Lumen).")
			return exitFailure
		}
		fmt.Fprintf(stdout, "Already joined as %s (%s)\n", name, id)
		return exitOK
	}
	if *wait > 0 {
		return waitOnline(s, time.Duration(*wait)*time.Second, stdout, stderr)
	}
	st, err := s.LoadState()
	if err != nil {
		fmt.Fprintf(stderr, "lumen-agent: %v\n", err)
		return exitFailure
	}
	_, credErr := s.LoadCredential()
	joined := st.ServerID != "" && credErr == nil
	rs, _ := s.ReadStatus()
	if *asJSON {
		out := map[string]any{"joined": joined, "server_id": st.ServerID, "name": st.Name,
			"control_plane": st.ControlPlaneURL, "provider": st.Provider, "agent_version": buildinfo.Version}
		if rs != nil {
			out["runtime"] = rs
		}
		_ = json.NewEncoder(stdout).Encode(out)
		return exitOK
	}
	if !joined {
		fmt.Fprintln(stdout, "Not joined. Run the join command from Servers → Add server.")
		return exitOK
	}
	fmt.Fprintf(stdout, "Joined as %s (%s) to %s\n", st.Name, st.ServerID, st.ControlPlaneURL)
	if rs == nil || time.Since(rs.UpdatedAt) > 2*time.Minute {
		fmt.Fprintln(stdout, "Agent: not running (start it with: sudo systemctl start lumen-agent)")
		return exitOK
	}
	fmt.Fprintf(stdout, "Connection: %s · Docker: %s · Proxy: %s · Disk: %s\n",
		rs.Connection, okText(rs.DockerOK), okText(rs.CaddyOK), map[bool]string{true: "low (under 2 GB free)", false: "ok"}[rs.DiskLow])
	return exitOK
}

func okText(b bool) string {
	if b {
		return "ok"
	}
	return "not ready"
}

// waitOnline polls status.json (written by `run`) and prints each checklist
// step once it succeeds. The installer relays this output.
func waitOnline(s *state.Store, limit time.Duration, stdout, stderr io.Writer) int {
	deadline := time.Now().Add(limit)
	var connected, dockerOK, proxyOK bool
	for {
		if rs, err := s.ReadStatus(); err == nil && time.Since(rs.UpdatedAt) < 30*time.Second {
			if !connected && rs.Connection == "online" {
				connected = true
				fmt.Fprintln(stdout, "✔ Connected")
			}
			if !dockerOK && rs.DockerOK {
				dockerOK = true
				fmt.Fprintln(stdout, "✔ Docker ready")
			}
			if !proxyOK && rs.CaddyOK {
				proxyOK = true
				fmt.Fprintln(stdout, "✔ Proxy running")
			}
			if connected && dockerOK && proxyOK {
				return exitOK
			}
			if rs.Connection == "revoked" {
				fmt.Fprintln(stderr, "This server was removed from Lumen. Create a new join command to add it again.")
				return exitFailure
			}
		}
		if time.Now().After(deadline) {
			fmt.Fprintln(stderr, "The agent didn't come online in time.")
			return exitFailure
		}
		time.Sleep(time.Second)
	}
}
