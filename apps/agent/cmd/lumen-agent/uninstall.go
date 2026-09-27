package main

import (
	"bufio"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/caddy"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/docker"
)

// cmdUninstall removes the agent from this server (SPEC E5): the systemd
// unit, the platform proxy container, the binaries, /etc/lumen and, unless
// --keep-data, /var/lib/lumen. It asks for confirmation unless --yes.
func cmdUninstall(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("uninstall", flag.ContinueOnError)
	fs.SetOutput(stderr)
	yes := fs.Bool("yes", false, "don't ask for confirmation")
	keep := fs.Bool("keep-data", false, "keep /var/lib/lumen (volumes and agent state)")
	if err := fs.Parse(args); err != nil {
		return exitUsage
	}
	root := env("LUMEN_ROOT", "")
	if root == "" && os.Geteuid() != 0 {
		fmt.Fprintln(stderr, "Run this as root: sudo lumen-agent uninstall")
		return exitUsage
	}
	if !*yes {
		what := "the agent, its proxy container and all Lumen data in /var/lib/lumen"
		if *keep {
			what = "the agent and its proxy container (keeping /var/lib/lumen)"
		}
		fmt.Fprintf(stdout, "This removes %s from this server. Apps deployed here stop receiving traffic.\nType \"remove\" to continue: ", what)
		line, _ := bufio.NewReader(stdin).ReadString('\n')
		if strings.TrimSpace(line) != "remove" {
			fmt.Fprintln(stdout, "Nothing was changed.")
			return exitFailure
		}
	}
	p := func(path string) string { return filepath.Join(root, path) }

	step := func(label string, fn func() error) {
		if err := fn(); err != nil {
			fmt.Fprintf(stdout, "  ! %s: %v\n", label, err)
			return
		}
		fmt.Fprintf(stdout, "  ✔ %s\n", label)
	}
	if root == "" {
		step("Stopped the agent service", func() error {
			_ = exec.Command("systemctl", "stop", "lumen-agent").Run()    //nolint:gosec,noctx // fixed arguments
			_ = exec.Command("systemctl", "disable", "lumen-agent").Run() //nolint:gosec,noctx // fixed arguments
			return nil
		})
	}
	step("Removed the systemd unit", func() error {
		err := os.Remove(p("/etc/systemd/system/lumen-agent.service"))
		if errors.Is(err, os.ErrNotExist) {
			err = nil
		}
		if root == "" {
			_ = exec.Command("systemctl", "daemon-reload").Run() //nolint:noctx // fixed arguments
		}
		return err
	})
	step("Removed the proxy container", func() error {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		dc := docker.New("")
		list, err := dc.ListContainers(ctx, true, caddy.RoleLabel+"=proxy")
		if err != nil {
			return fmt.Errorf("Docker isn't reachable, remove it later with: docker rm -f %s", caddy.ContainerName) //nolint:staticcheck // user-facing sentence
		}
		for _, c := range list {
			if err := dc.Remove(ctx, c.ID); err != nil {
				return err
			}
		}
		return nil
	})
	step("Removed /etc/lumen", func() error { return os.RemoveAll(p("/etc/lumen")) })
	if *keep {
		fmt.Fprintln(stdout, "  · Kept /var/lib/lumen")
	} else {
		step("Removed /var/lib/lumen", func() error { return os.RemoveAll(p("/var/lib/lumen")) })
	}
	step("Removed the agent binary", func() error {
		for _, suffix := range []string{"", ".prev", ".new", ".failed"} {
			if err := os.Remove(p("/usr/local/bin/lumen-agent" + suffix)); err != nil && !errors.Is(err, os.ErrNotExist) {
				return err
			}
		}
		return nil
	})
	fmt.Fprintln(stdout, "Lumen's agent is removed. Remove the server in the dashboard too if it's still listed.")
	return exitOK
}
