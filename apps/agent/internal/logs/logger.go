// Package logs is the agent's own structured logger: JSON lines on stdout
// (journald captures them) with `level`, `ts`, `msg`, `component` and, where
// relevant, `op_id`. Secrets never reach a line: attributes with sensitive
// names are replaced, and registered secret values are scrubbed from every
// string. Runtime log capture for containers is Phase 03.
package logs

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"sync"
)

const redacted = "[redacted]"

// sensitiveKeys are attribute names whose values are never logged.
var sensitiveKeys = map[string]bool{
	"credential":         true,
	"token":              true,
	"join_token":         true,
	"private_key":        true,
	"authorization":      true,
	"rotated_credential": true,
	"password":           true,
	"secret":             true,
}

var (
	secretsMu sync.RWMutex
	secrets   []string
)

// AddSecret registers a value (a credential, a join token) that must be
// scrubbed from any log line that contains it. Short values are ignored so
// common substrings are not mangled.
func AddSecret(value string) {
	if len(value) < 8 {
		return
	}
	secretsMu.Lock()
	defer secretsMu.Unlock()
	for _, s := range secrets {
		if s == value {
			return
		}
	}
	secrets = append(secrets, value)
}

// Scrub replaces every registered secret in s.
func Scrub(s string) string {
	secretsMu.RLock()
	defer secretsMu.RUnlock()
	for _, secret := range secrets {
		if strings.Contains(s, secret) {
			s = strings.ReplaceAll(s, secret, redacted)
		}
	}
	return s
}

// New returns a JSON logger writing to w at the given level ("debug",
// "info", "warn", "error"; anything else means info).
func New(w io.Writer, level string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	h := slog.NewJSONHandler(w, &slog.HandlerOptions{Level: lvl, ReplaceAttr: replace})
	return slog.New(&scrubHandler{Handler: h}).With("service", "lumen-agent")
}

func replace(groups []string, a slog.Attr) slog.Attr {
	if len(groups) == 0 {
		switch a.Key {
		case slog.TimeKey:
			a.Key = "ts"
			return a
		case slog.LevelKey:
			return slog.String("level", strings.ToLower(a.Value.String()))
		}
	}
	if sensitiveKeys[strings.ToLower(a.Key)] {
		return slog.String(a.Key, redacted)
	}
	if a.Value.Kind() == slog.KindString {
		return slog.String(a.Key, Scrub(a.Value.String()))
	}
	if a.Value.Kind() == slog.KindAny {
		if err, ok := a.Value.Any().(error); ok {
			return slog.String(a.Key, Scrub(err.Error()))
		}
	}
	return a
}

// scrubHandler scrubs the message text; attributes are handled by replace.
type scrubHandler struct{ slog.Handler }

func (h *scrubHandler) Handle(ctx context.Context, r slog.Record) error {
	if r.Message != "" {
		clean := Scrub(r.Message)
		if clean != r.Message {
			nr := slog.NewRecord(r.Time, r.Level, clean, r.PC)
			r.Attrs(func(a slog.Attr) bool { nr.AddAttrs(a); return true })
			r = nr
		}
	}
	return h.Handler.Handle(ctx, r)
}

func (h *scrubHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &scrubHandler{Handler: h.Handler.WithAttrs(attrs)}
}

func (h *scrubHandler) WithGroup(name string) slog.Handler {
	return &scrubHandler{Handler: h.Handler.WithGroup(name)}
}

// Component returns a child logger tagged with component=name.
func Component(l *slog.Logger, name string) *slog.Logger {
	return l.With("component", name)
}
