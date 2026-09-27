// Command lumen-release creates agent release artifacts: a minisign key pair,
// and for each binary a .sha256 (sha256sum format) and a .minisig signature
// that the installer and self-update verify.
//
//	lumen-release keygen -dir <dir>             writes release.pub and release.key (0600)
//	lumen-release sign -key <release.key> <bin>...
//
// The secret key file is unencrypted; keep production keys offline and sign
// in CI from a secret (docs/DECISIONS.md, minisign).
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/ShageeshanT/Lumen/apps/agent/internal/minisign"
	"github.com/ShageeshanT/Lumen/apps/agent/internal/state"
)

func main() { os.Exit(run(os.Args[1:], os.Stdout, os.Stderr)) }

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, "usage: lumen-release keygen -dir <dir> | sign -key <file> <binary>...")
		return 2
	}
	switch args[0] {
	case "keygen":
		fs := flag.NewFlagSet("keygen", flag.ContinueOnError)
		fs.SetOutput(stderr)
		dir := fs.String("dir", ".", "output directory")
		if err := fs.Parse(args[1:]); err != nil {
			return 2
		}
		sk, err := minisign.GenerateKey()
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		pub := "untrusted comment: lumen release public key\n" + sk.Public().String() + "\n"
		if err := os.MkdirAll(*dir, 0o750); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		if err := state.WriteFileAtomic(filepath.Join(*dir, "release.key"), []byte(sk.MarshalText()), 0o600); err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		if err := state.WriteFileAtomic(filepath.Join(*dir, "release.pub"), []byte(pub), 0o644); err != nil { //nolint:gosec // public key
			fmt.Fprintln(stderr, err)
			return 1
		}
		fmt.Fprintln(stdout, sk.Public().String())
		return 0
	case "sign":
		fs := flag.NewFlagSet("sign", flag.ContinueOnError)
		fs.SetOutput(stderr)
		keyPath := fs.String("key", "", "secret key file from keygen")
		if err := fs.Parse(args[1:]); err != nil || *keyPath == "" || fs.NArg() == 0 {
			fmt.Fprintln(stderr, "usage: lumen-release sign -key <file> <binary>...")
			return 2
		}
		raw, err := os.ReadFile(*keyPath)
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		sk, err := minisign.ParseSecretKey(string(raw))
		if err != nil {
			fmt.Fprintln(stderr, err)
			return 1
		}
		for _, bin := range fs.Args() {
			data, err := os.ReadFile(bin) //nolint:gosec // operator-provided path
			if err != nil {
				fmt.Fprintln(stderr, err)
				return 1
			}
			sum := sha256.Sum256(data)
			name := filepath.Base(bin)
			tc := "timestamp:" + strconv.FormatInt(time.Now().Unix(), 10) + "\tfile:" + name + "\thashed"
			if err := os.WriteFile(bin+".sha256", []byte(hex.EncodeToString(sum[:])+"  "+name+"\n"), 0o644); err != nil { //nolint:gosec // public checksum
				fmt.Fprintln(stderr, err)
				return 1
			}
			if err := os.WriteFile(bin+".minisig", []byte(minisign.Sign(sk, data, tc)), 0o644); err != nil { //nolint:gosec // public signature
				fmt.Fprintln(stderr, err)
				return 1
			}
			fmt.Fprintf(stdout, "signed %s\n", name)
		}
		return 0
	}
	fmt.Fprintf(stderr, "unknown command %q\n", args[0])
	return 2
}
